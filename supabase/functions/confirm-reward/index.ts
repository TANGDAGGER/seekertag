import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { corsHeaders, json } from '../_shared/http.ts'

type TokenBalance = {
  mint: string
  owner?: string
  uiTokenAmount: { amount: string; decimals: number }
}

const GENESIS_HASHES = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
} as const
const OFFICIAL_SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'

function getBearerToken(request: Request): string {
  const value = request.headers.get('authorization') ?? ''
  if (!value.startsWith('Bearer ')) throw new Error('An authenticated Supabase session is required.')
  return value.slice(7)
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `seekertag-${method}`, method, params }),
  })
  if (!response.ok) throw new Error(`Solana RPC ${method} failed with HTTP ${response.status}.`)
  const payload = (await response.json()) as { result?: T; error?: { message?: string } }
  if (payload.error || payload.result === undefined)
    throw new Error(payload.error?.message || `${method} failed.`)
  return payload.result
}

function tokenAmountForOwner(balances: TokenBalance[], owner: string, mint: string): bigint {
  return balances
    .filter((balance) => balance.owner === owner && balance.mint === mint)
    .reduce((sum, balance) => sum + BigInt(balance.uiTokenAmount.amount), 0n)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL')!
    const cluster = Deno.env.get('SOLANA_CLUSTER')
    const rewardMint = Deno.env.get('REWARD_TOKEN_MINT')!
    const rewardDecimals = Number(Deno.env.get('REWARD_TOKEN_DECIMALS'))
    if (cluster !== 'devnet' && cluster !== 'mainnet-beta') throw new Error('Invalid server SOLANA_CLUSTER.')
    if (!rpcUrl || !rewardMint || !Number.isInteger(rewardDecimals)) {
      throw new Error('The reward verification function is not configured.')
    }
    if (cluster === 'devnet' && rewardMint === OFFICIAL_SKR_MINT) {
      throw new Error('Production SKR can only be used on Solana mainnet.')
    }
    if (cluster === 'mainnet-beta' && (rewardMint !== OFFICIAL_SKR_MINT || rewardDecimals !== 6)) {
      throw new Error('Mainnet reward verification must use official SKR with 6 decimals.')
    }

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const token = getBearerToken(request)
    const { data: userData, error: userError } = await service.auth.getUser(token)
    if (userError || !userData.user) throw new Error('The Supabase session is invalid or expired.')
    const { data: binding, error: bindingError } = await service
      .from('wallet_auth_bindings')
      .select('wallet_address,expires_at')
      .eq('user_id', userData.user.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (bindingError || !binding) throw new Error('A verified wallet session is required.')

    const body = (await request.json()) as { reportId?: string; signature?: string }
    const reportId = String(body.reportId ?? '')
    const signature = String(body.signature ?? '')
    const { data: report, error: reportError } = await service
      .from('finder_reports')
      .select(
        'id,finder_wallet,reward_state,reward_transaction_signature,item_id,items!inner(owner_wallet,finder_reward_amount)',
      )
      .eq('id', reportId)
      .single()
    if (reportError) throw reportError
    const item = Array.isArray(report.items) ? report.items[0] : report.items
    if (!item || item.owner_wallet !== binding.wallet_address)
      throw new Error('Only the verified owner may confirm this reward.')
    if (report.reward_state === 'confirmed' && report.reward_transaction_signature === signature) {
      return json({ confirmed: true, signature, reconciled: true })
    }
    if (report.reward_state !== 'submitted' || report.reward_transaction_signature !== signature) {
      throw new Error('The submitted signature does not match this reward attempt.')
    }

    const genesisHash = await rpcCall<string>(rpcUrl, 'getGenesisHash')
    if (genesisHash !== GENESIS_HASHES[cluster])
      throw new Error('The server RPC does not match SOLANA_CLUSTER.')
    const transaction = await rpcCall<{
      meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null
    } | null>(rpcUrl, 'getTransaction', [
      signature,
      { commitment: 'confirmed', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ])
    if (!transaction?.meta || transaction.meta.err)
      throw new Error('The reward transaction is not confirmed successfully.')

    const scale = 10n ** BigInt(rewardDecimals)
    const amountText = String(item.finder_reward_amount)
    if (!/^\d+(?:\.\d+)?$/.test(amountText)) throw new Error('The stored reward amount is invalid.')
    const [whole, fraction = ''] = amountText.split('.')
    if (fraction.length > rewardDecimals) throw new Error('The stored reward precision is invalid.')
    const expected = BigInt(whole) * scale + BigInt(fraction.padEnd(rewardDecimals, '0') || '0')
    const pre = transaction.meta.preTokenBalances ?? []
    const post = transaction.meta.postTokenBalances ?? []
    const ownerDelta =
      tokenAmountForOwner(post, item.owner_wallet, rewardMint) -
      tokenAmountForOwner(pre, item.owner_wallet, rewardMint)
    const finderDelta =
      tokenAmountForOwner(post, report.finder_wallet, rewardMint) -
      tokenAmountForOwner(pre, report.finder_wallet, rewardMint)
    if (ownerDelta !== -expected || finderDelta !== expected) {
      throw new Error(
        'The confirmed transaction does not match the expected reward mint, amount, owner, and finder.',
      )
    }
    for (const balance of [...pre, ...post]) {
      if (balance.mint === rewardMint && balance.uiTokenAmount.decimals !== rewardDecimals) {
        throw new Error('The confirmed token decimals do not match server configuration.')
      }
    }

    const { error: finalizeError } = await service.rpc('finalize_reward_verified', {
      target_report_id: reportId,
      expected_owner_wallet: binding.wallet_address,
      tx_signature: signature,
    })
    if (finalizeError) throw finalizeError
    return json({ confirmed: true, signature, reconciled: false })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Reward confirmation failed.' }, 400)
  }
})
