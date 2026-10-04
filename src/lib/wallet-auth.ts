import { supabase } from '@/config/supabase'
import { ensureAppSession } from '@/lib/auth-session'
import { bytesToBase64 } from '@/lib/base64'
import {
  createWalletAuthenticationMessage,
  type WalletChallenge,
  type WalletSignatureProof,
} from '@/features/wallet/wallet-auth-flow'

export type WalletAuthStatus = {
  walletAddress: string
  verifiedAt: string
  expiresAt: string
}

type SignMessages = (message: Uint8Array) => Promise<Uint8Array>

export async function requestWalletChallenge(): Promise<WalletChallenge> {
  if (!supabase) throw new Error('Supabase is not configured.')
  await ensureAppSession()
  const { data: challenge, error } = await supabase.functions.invoke('wallet-auth', {
    body: { action: 'challenge' },
  })
  if (error) throw new Error(error.message || 'Could not request a wallet challenge.')
  if (
    !challenge?.challengeId ||
    !challenge?.domain ||
    !challenge?.uri ||
    !challenge?.nonce ||
    !challenge?.issuedAt ||
    !challenge?.expiresAt ||
    !challenge?.statement ||
    challenge?.chainId !== 'solana:devnet' ||
    challenge?.version !== '1'
  ) {
    throw new Error(challenge?.error || 'Invalid wallet challenge.')
  }
  return {
    challengeId: String(challenge.challengeId),
    domain: String(challenge.domain),
    uri: String(challenge.uri),
    nonce: String(challenge.nonce),
    issuedAt: String(challenge.issuedAt),
    expiresAt: String(challenge.expiresAt),
    statement: String(challenge.statement),
    chainId: 'solana:devnet',
    version: '1',
  }
}

export async function verifyWalletChallenge(
  walletAddress: string,
  challengeId: string,
  proof: WalletSignatureProof,
): Promise<WalletAuthStatus> {
  if (!supabase) throw new Error('Supabase is not configured.')
  await ensureAppSession()
  const { data: verified, error } = await supabase.functions.invoke('wallet-auth', {
    body: {
      action: 'verify',
      challengeId,
      walletAddress,
      signedMessage: bytesToBase64(proof.signedMessage),
      signature: bytesToBase64(proof.signature),
      signatureType: proof.signatureType ?? 'ed25519',
      authMethod: proof.method,
    },
  })
  if (error) throw new Error(error.message || 'Wallet verification failed.')
  if (!verified?.walletAddress) throw new Error(verified?.error || 'Wallet verification failed.')
  if (verified.walletAddress !== walletAddress) {
    throw new Error('The verified wallet does not match the authorized MWA account.')
  }
  return {
    walletAddress: verified.walletAddress,
    verifiedAt: verified.verifiedAt,
    expiresAt: verified.expiresAt,
  }
}

export async function getWalletAuthStatus(): Promise<WalletAuthStatus | null> {
  if (!supabase) return null
  await ensureAppSession()
  const { data, error } = await supabase.rpc('wallet_auth_status')
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as
    { wallet_address: string; verified_at: string; expires_at: string } | undefined
  return row
    ? { walletAddress: row.wallet_address, verifiedAt: row.verified_at, expiresAt: row.expires_at }
    : null
}

export async function authenticateWallet(
  walletAddress: string,
  signMessages: SignMessages,
): Promise<WalletAuthStatus> {
  if (!supabase) throw new Error('Supabase is not configured.')
  await ensureAppSession()
  const existing = await getWalletAuthStatus()
  if (existing?.walletAddress === walletAddress && new Date(existing.expiresAt).getTime() > Date.now()) {
    return existing
  }
  if (existing) {
    // Never carry a verified server identity across an account change or an
    // expired authorization. Revoke it before asking the current wallet to sign.
    await revokeWalletAuthentication()
  }

  const challenge = await requestWalletChallenge()
  const signedMessage = createWalletAuthenticationMessage(challenge, walletAddress)
  const signature = await signMessages(signedMessage)
  await verifyWalletChallenge(walletAddress, challenge.challengeId, {
    method: 'sign_messages',
    signedMessage,
    signature,
    signatureType: 'ed25519',
  })
  const binding = await getWalletAuthStatus()
  if (!binding || binding.walletAddress !== walletAddress) {
    throw new Error('The server did not bind the authorized wallet to this app session.')
  }
  return binding
}

export async function revokeWalletAuthentication(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('wallet-auth', { body: { action: 'revoke' } })
  if (error) throw new Error(error.message || 'Wallet session revocation failed.')
}
