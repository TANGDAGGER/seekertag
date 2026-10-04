import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type CheckResult = { status: number; body: unknown }

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
  const hostname = new URL(url).hostname
  if (hostname !== `${confirmedRef}.supabase.co`) {
    throw new Error('Refusing to run: Supabase URL does not match SEEKERTAG_DEV_PROJECT_REF.')
  }
}

async function post(
  url: string,
  apiKey: string,
  functionName: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<CheckResult> {
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // Keep the raw response for a useful failure message.
  }
  return { status: response.status, body: parsed }
}

function expectRejected(name: string, result: CheckResult): void {
  if (result.status >= 200 && result.status < 300) {
    throw new Error(`${name} unexpectedly succeeded: ${JSON.stringify(result.body)}`)
  }
  console.log(`[PASS] ${name} rejected with HTTP ${result.status}.`)
}

async function createAnonymousSession(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.signInAnonymously()
  if (error) {
    throw new Error(
      `Anonymous sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth settings. ${error.message}`,
    )
  }
  if (!data.session?.access_token) throw new Error('Supabase did not return an anonymous session.')
  return data.session.access_token
}

async function main(): Promise<void> {
  const url = required('EXPO_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  const apiKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY')
  const walletAddress = required('SMOKE_WALLET_ADDRESS')
  assertDevProject(url)

  console.log('Target confirmed as an explicitly named SeekerTag development project.')

  const unauthWallet = await post(url, apiKey, 'wallet-auth', {
    action: 'challenge',
    walletAddress,
  })
  expectRejected('wallet-auth unauthenticated request', unauthWallet)

  const unauthReward = await post(url, apiKey, 'confirm-reward', {
    reportId: crypto.randomUUID(),
    signature: 'not-a-solana-signature',
  })
  expectRejected('confirm-reward unauthenticated request', unauthReward)

  const client = createClient(url, apiKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const accessToken = await createAnonymousSession(client)
  try {
    const challenge = await post(
      url,
      apiKey,
      'wallet-auth',
      { action: 'challenge', walletAddress },
      accessToken,
    )
    if (challenge.status !== 200) {
      throw new Error(`wallet-auth challenge failed: ${JSON.stringify(challenge.body)}`)
    }
    const challengeBody = challenge.body as { challengeId?: string; message?: string }
    if (!challengeBody.challengeId || !challengeBody.message) {
      throw new Error(`wallet-auth challenge response is incomplete: ${JSON.stringify(challenge.body)}`)
    }
    console.log('[PASS] wallet-auth endpoint returned a real challenge.')

    const malformed = await post(
      url,
      apiKey,
      'wallet-auth',
      {
        action: 'verify',
        challengeId: challengeBody.challengeId,
        signature: Buffer.alloc(64).toString('base64'),
      },
      accessToken,
    )
    expectRejected('wallet-auth malformed signature', malformed)

    const malformedAgain = await post(
      url,
      apiKey,
      'wallet-auth',
      {
        action: 'verify',
        challengeId: challengeBody.challengeId,
        signature: 'not-base64!',
      },
      accessToken,
    )
    expectRejected('wallet-auth invalid retry', malformedAgain)

    const nonexistentReward = await post(
      url,
      apiKey,
      'confirm-reward',
      { reportId: crypto.randomUUID(), signature: 'not-a-solana-signature' },
      accessToken,
    )
    expectRejected('confirm-reward nonexistent transaction/report', nonexistentReward)
  } finally {
    await client.auth.signOut()
  }

  console.log('[PASS] Edge Function smoke test completed without faking a valid signature.')
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
