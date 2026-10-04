import { createClient, type PostgrestError } from '@supabase/supabase-js'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. See docs/BEGINNER_DEPLOY.md.`)
  return value
}

function assertDevProject(url: string): void {
  if (process.env.SEEKERTAG_SMOKE_PROJECT !== 'development') {
    throw new Error('Refusing to run: set SEEKERTAG_SMOKE_PROJECT=development explicitly.')
  }
  if (/localhost|127\.0\.0\.1/.test(url)) return
  const confirmedRef = required('SEEKERTAG_DEV_PROJECT_REF')
  if (new URL(url).hostname !== `${confirmedRef}.supabase.co`) {
    throw new Error('Refusing to run: Supabase URL does not match SEEKERTAG_DEV_PROJECT_REF.')
  }
}

function expectPermissionDenied(name: string, error: PostgrestError | null): void {
  if (!error) throw new Error(`${name} was not rejected.`)
  const permissionDenied =
    error.code === '42501' || /permission denied|row-level security|verified wallet/i.test(error.message)
  if (!permissionDenied) {
    throw new Error(`${name} failed for the wrong reason (${error.code}): ${error.message}`)
  }
  console.log(`[PASS] ${name} rejected (${error.code}).`)
}

async function main(): Promise<void> {
  const url = required('EXPO_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  const apiKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY')
  assertDevProject(url)

  const client = createClient(url, apiKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error: authError } = await client.auth.signInAnonymously()
  if (authError) {
    throw new Error(
      `Anonymous sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth settings. ${authError.message}`,
    )
  }
  if (!data.session) throw new Error('Supabase did not return an anonymous session.')

  // Random IDs guarantee these checks never target an existing row. A constraint error is
  // deliberately not accepted as evidence; each operation must be stopped by authorization.
  const randomItem = crypto.randomUUID()
  const randomReport = crypto.randomUUID()
  const fakeWallet = '11111111111111111111111111111111'

  try {
    const ownership = await client.from('ownership_events').insert({
      id: crypto.randomUUID(),
      item_id: randomItem,
      action: 'claimed',
      to_wallet: fakeWallet,
      proof: 'forged-proof',
    })
    expectPermissionDenied('arbitrary ownership history insert', ownership.error)

    const ownerChange = await client.from('items').update({ owner_wallet: fakeWallet }).eq('id', randomItem)
    expectPermissionDenied("another item's owner change", ownerChange.error)

    const lostMode = await client.from('items').update({ status: 'lost' }).eq('id', randomItem)
    expectPermissionDenied("another item's Lost Mode change", lostMode.error)

    const rewarded = await client.from('finder_reports').update({ status: 'rewarded' }).eq('id', randomReport)
    expectPermissionDenied('finder report rewarded mutation', rewarded.error)

    const forgedSignature = await client
      .from('items')
      .update({ reward_transaction_signature: 'forged-signature' })
      .eq('id', randomItem)
    expectPermissionDenied('forged reward transaction signature', forgedSignature.error)
  } finally {
    await client.auth.signOut()
  }

  console.log('[PASS] Public-key direct-mutation checks were rejected on the development project.')
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
