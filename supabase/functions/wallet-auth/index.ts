import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { ed25519 } from 'npm:@noble/curves@1.9.7/ed25519'
import bs58 from 'npm:bs58@6.0.0'
import { corsHeaders, json } from '../_shared/http.ts'

const APP_DOMAIN = 'seekertag.app'
const APP_URI = 'https://seekertag.app'
const APP_STATEMENT = 'Authenticate to SeekerTag. This does not authorize a transaction.'
const APP_CHAIN_ID = 'solana:devnet'
const CHALLENGE_TTL_MS = 5 * 60 * 1000

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(value)
}

function getBearerToken(request: Request): string {
  const value = request.headers.get('authorization') ?? ''
  if (!value.startsWith('Bearer ')) throw new Error('An authenticated Supabase session is required.')
  return value.slice(7)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return 'Wallet verification failed.'
}

function validateWalletAddress(walletAddress: string): Uint8Array {
  let publicKey: Uint8Array
  try {
    publicKey = bs58.decode(walletAddress)
  } catch {
    throw new Error('The wallet address is not valid base58.')
  }
  if (publicKey.length !== 32) throw new Error('The wallet address is not a valid Ed25519 public key.')
  return publicKey
}

function createSignInMessage(input: {
  walletAddress: string
  nonce: string
  issuedAt: string
  expiresAt: string
}): string {
  return [
    `${APP_DOMAIN} wants you to sign in with your Solana account:`,
    input.walletAddress,
    '',
    APP_STATEMENT,
    '',
    `URI: ${APP_URI}`,
    'Version: 1',
    `Chain ID: ${APP_CHAIN_ID}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
  ].join('\n')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const token = getBearerToken(request)
    const { data: userData, error: userError } = await service.auth.getUser(token)
    if (userError || !userData.user) throw new Error('The Supabase session is invalid or expired.')
    const body = (await request.json()) as Record<string, unknown>
    const action = body.action

    if (action === 'revoke') {
      const { error } = await service.from('wallet_auth_bindings').delete().eq('user_id', userData.user.id)
      if (error) throw error
      return json({ revoked: true })
    }

    if (action === 'challenge') {
      // walletAddress is accepted only for backwards compatibility with older
      // preview APKs. New clients deliberately request the challenge first.
      const legacyWalletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : ''
      if (legacyWalletAddress) validateWalletAddress(legacyWalletAddress)

      const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
      const nonce = bytesToHex(nonceBytes)
      const issuedAt = new Date()
      const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS)
      const legacyMessage = legacyWalletAddress
        ? createSignInMessage({
            walletAddress: legacyWalletAddress,
            nonce,
            issuedAt: issuedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          })
        : ''

      const { data, error } = await service
        .from('wallet_auth_challenges')
        .insert({
          user_id: userData.user.id,
          wallet_address: legacyWalletAddress || null,
          nonce_hash: await sha256(nonce),
          challenge_message: legacyMessage,
          domain: APP_DOMAIN,
          uri: APP_URI,
          statement: APP_STATEMENT,
          chain_id: APP_CHAIN_ID,
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single()
      if (error) throw error
      return json({
        challengeId: data.id,
        domain: APP_DOMAIN,
        uri: APP_URI,
        statement: APP_STATEMENT,
        chainId: APP_CHAIN_ID,
        version: '1',
        nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ...(legacyMessage ? { message: legacyMessage } : {}),
      })
    }

    if (action === 'verify') {
      const challengeId = String(body.challengeId ?? '')
      const signature = decodeBase64(String(body.signature ?? ''))
      const signatureType = String(body.signatureType ?? 'ed25519').toLowerCase()
      if (signatureType !== 'ed25519') throw new Error('The wallet signature type must be Ed25519.')
      if (signature.length !== 64) throw new Error('The wallet signature is not a valid Ed25519 signature.')

      const { data: challenge, error: challengeError } = await service
        .from('wallet_auth_challenges')
        .select(
          'id,user_id,wallet_address,nonce_hash,challenge_message,domain,uri,statement,chain_id,issued_at,expires_at,used_at',
        )
        .eq('id', challengeId)
        .eq('user_id', userData.user.id)
        .maybeSingle()
      if (challengeError) throw challengeError
      if (!challenge || challenge.used_at) throw new Error('This wallet challenge is invalid or already used.')
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        throw new Error('This wallet challenge expired.')
      }
      if (
        challenge.domain !== APP_DOMAIN ||
        challenge.uri !== APP_URI ||
        challenge.statement !== APP_STATEMENT ||
        challenge.chain_id !== APP_CHAIN_ID
      ) {
        throw new Error('The wallet challenge app identity is invalid.')
      }

      const walletAddress = String(body.walletAddress ?? challenge.wallet_address ?? '')
      const publicKey = validateWalletAddress(walletAddress)
      if (challenge.wallet_address && challenge.wallet_address !== walletAddress) {
        throw new Error('The signed wallet does not match this challenge.')
      }

      const suppliedSignedMessage = body.signedMessage
      const signedMessageBytes = suppliedSignedMessage
        ? decodeBase64(String(suppliedSignedMessage))
        : new TextEncoder().encode(String(challenge.challenge_message ?? ''))
      const signedMessage = decodeUtf8(signedMessageBytes)
      const nonce = /^Nonce: ([0-9a-f]{64})$/m.exec(signedMessage)?.[1]
      if (!nonce || (await sha256(nonce)) !== challenge.nonce_hash) {
        throw new Error('The wallet challenge nonce is invalid.')
      }

      const expectedMessage = createSignInMessage({
        walletAddress,
        nonce,
        issuedAt: new Date(challenge.issued_at).toISOString(),
        expiresAt: new Date(challenge.expires_at).toISOString(),
      })
      if (signedMessage !== expectedMessage) {
        throw new Error('The signed authentication message does not exactly match the issued challenge.')
      }
      if (!ed25519.verify(signature, signedMessageBytes, publicKey)) {
        throw new Error('The wallet signature could not be verified.')
      }

      const { data: completed, error: completionError } = await service.rpc(
        'complete_wallet_auth_challenge',
        {
          target_challenge_id: challenge.id,
          target_user_id: userData.user.id,
          target_wallet_address: walletAddress,
          target_challenge_message: expectedMessage,
          target_verification_proof: String(body.signature),
        },
      )
      if (completionError) throw completionError
      const binding = Array.isArray(completed) ? completed[0] : completed
      if (!binding?.wallet_address) throw new Error('The wallet binding was not created.')

      return json({
        walletAddress: binding.wallet_address,
        verifiedAt: binding.verified_at,
        expiresAt: binding.expires_at,
      })
    }

    return json({ error: 'Unsupported action' }, 400)
  } catch (error) {
    return json({ error: getErrorMessage(error) }, 400)
  }
})
