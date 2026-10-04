import type { WalletAuthenticationStage } from './wallet-auth-flow'

export const PHANTOM_NATIVE_SUPPORTED = false
export const WALLET_SESSION_SCHEMA_VERSION = 3 as const
export const WALLET_SESSION_STORAGE_KEY = 'seekertag.wallet-session.v3'
export const OBSOLETE_WALLET_SESSION_STORAGE_KEYS = [
  'seekertag.wallet-session.v1',
  'seekertag.wallet-session.v2',
] as const
export const WALLET_AUTHORIZATION_CACHE_KEY = 'seekertag.mwa-authorization.v3'
export const OBSOLETE_WALLET_AUTHORIZATION_CACHE_KEYS = ['authorization-cache'] as const

export type WalletFailureKind =
  'cancelled' | 'rejected' | 'timed-out' | 'unavailable' | 'unsupported' | 'network' | 'unknown'

export type WalletSessionState = {
  currentAddress: string | null
  verifiedAddress: string | null
  status: 'idle' | 'connecting' | 'verifying' | 'verified' | 'disconnecting' | 'error'
  authStage: WalletAuthenticationStage | null
  failure: WalletFailureKind | null
}

export type WalletSessionEvent =
  | { type: 'RESTORED' }
  | { type: 'CONNECT_STARTED' }
  | { type: 'ACCOUNT_OBSERVED'; address: string | null }
  | { type: 'AUTH_STAGE'; stage: WalletAuthenticationStage }
  | { type: 'VERIFY_STARTED'; address: string }
  | { type: 'VERIFIED'; address: string }
  | { type: 'FAILED'; failure: WalletFailureKind }
  | { type: 'DISCONNECT_STARTED' }
  | { type: 'CLEARED' }

export type StoredWalletSession = {
  version: typeof WALLET_SESSION_SCHEMA_VERSION
  transport: 'mwa'
  publicKey: string
  accountLabel?: string
  walletUriBase?: string
  walletIcon?: string
}

export type WalletSessionMetadata = Omit<StoredWalletSession, 'version' | 'transport'>

export const initialWalletSessionState: WalletSessionState = {
  currentAddress: null,
  verifiedAddress: null,
  status: 'idle',
  authStage: null,
  failure: null,
}

export function reduceWalletSession(
  state: WalletSessionState,
  event: WalletSessionEvent,
): WalletSessionState {
  switch (event.type) {
    case 'RESTORED':
      return state
    case 'CONNECT_STARTED':
      return {
        ...state,
        verifiedAddress: null,
        status: 'connecting',
        authStage: 'preflight_session',
        failure: null,
      }
    case 'ACCOUNT_OBSERVED':
      if (!event.address) return initialWalletSessionState
      if (event.address === state.currentAddress) return state
      return {
        ...state,
        currentAddress: event.address,
        verifiedAddress: null,
        status: 'verifying',
        failure: null,
      }
    case 'AUTH_STAGE':
      return {
        ...state,
        status:
          event.stage === 'preflight_session' ||
          event.stage === 'challenge_request_pre_wallet' ||
          event.stage === 'association_start' ||
          event.stage === 'authorize' ||
          event.stage === 'siws_sign_in'
            ? 'connecting'
            : 'verifying',
        authStage: event.stage,
        failure: null,
      }
    case 'VERIFY_STARTED':
      if (event.address !== state.currentAddress) return state
      return {
        ...state,
        verifiedAddress: null,
        status: 'verifying',
        authStage: 'challenge_request_pre_wallet',
        failure: null,
      }
    case 'VERIFIED':
      if (event.address !== state.currentAddress) return state
      return {
        ...state,
        verifiedAddress: event.address,
        status: 'verified',
        authStage: null,
        failure: null,
      }
    case 'FAILED':
      return { ...state, verifiedAddress: null, status: 'error', failure: event.failure }
    case 'DISCONNECT_STARTED':
      return {
        ...state,
        verifiedAddress: null,
        status: 'disconnecting',
        authStage: null,
        failure: null,
      }
    case 'CLEARED':
      return initialWalletSessionState
  }
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

export function normalizeWalletUriBase(value: unknown): string | undefined {
  const candidate = optionalText(value, 2_048)
  if (!candidate) return undefined
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined
    return candidate
  } catch {
    return undefined
  }
}

function normalizeWalletIcon(value: unknown): string | undefined {
  const candidate = optionalText(value, 512_000)
  if (!candidate || !/^data:image\/(?:png|webp|gif|svg\+xml);base64,/i.test(candidate)) return undefined
  return candidate
}

export function createStoredWalletSession(
  metadata: WalletSessionMetadata,
  previous?: StoredWalletSession | null,
  preservePreviousWalletUri = false,
): StoredWalletSession {
  const returnedWalletUri = normalizeWalletUriBase(metadata.walletUriBase)
  const previousWalletUri =
    preservePreviousWalletUri && previous?.publicKey === metadata.publicKey
      ? normalizeWalletUriBase(previous.walletUriBase)
      : undefined
  const accountLabel = optionalText(metadata.accountLabel, 120)
  const walletIcon = normalizeWalletIcon(metadata.walletIcon)

  return {
    version: WALLET_SESSION_SCHEMA_VERSION,
    transport: 'mwa',
    publicKey: metadata.publicKey,
    ...(accountLabel ? { accountLabel } : {}),
    ...(returnedWalletUri || previousWalletUri
      ? { walletUriBase: returnedWalletUri ?? previousWalletUri }
      : {}),
    ...(walletIcon ? { walletIcon } : {}),
  }
}

export function getWalletAssociationConfig(
  session: StoredWalletSession | null,
  publicKey: string | null,
): { baseUri: string } | undefined {
  if (!session || !publicKey || session.publicKey !== publicKey) return undefined
  const baseUri = normalizeWalletUriBase(session.walletUriBase)
  return baseUri ? { baseUri } : undefined
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase()
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown }
    return `${String(candidate.code ?? '')} ${String(candidate.message ?? '')}`.toLowerCase()
  }
  return String(error).toLowerCase()
}

export function classifyWalletFailure(error: unknown): WalletFailureKind {
  const normalized = errorText(error)
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'timed-out'
  if (normalized.includes('cancel')) return 'cancelled'
  if (
    normalized.includes('declin') ||
    normalized.includes('reject') ||
    normalized.includes('authorization_failed') ||
    normalized.includes('authorization failed')
  ) {
    return 'rejected'
  }
  if (
    normalized.includes('no wallet') ||
    normalized.includes('not found') ||
    normalized.includes('activity not found') ||
    normalized.includes('unavailable')
  ) {
    return 'unavailable'
  }
  if (
    normalized.includes('not supported') ||
    normalized.includes('unsupported') ||
    normalized.includes('sign_messages')
  ) {
    return 'unsupported'
  }
  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('socket')) {
    return 'network'
  }
  return 'unknown'
}

export function getWalletFailureMessage(failure: WalletFailureKind): string {
  switch (failure) {
    case 'cancelled':
      return 'Wallet connection was cancelled. Nothing was changed.'
    case 'rejected':
      return 'The wallet rejected the request. No SeekerTag session was created.'
    case 'timed-out':
      return 'The wallet did not respond in time. Open it and try again.'
    case 'unavailable':
      return 'No compatible MWA wallet was found. Install or open one, then try again.'
    case 'unsupported':
      return 'This wallet cannot sign the messages SeekerTag requires for secure authentication.'
    case 'network':
      return 'The wallet could not be reached. Check the connection and confirm the wallet is using devnet.'
    default:
      return 'We could not connect to the wallet. Try again with an MWA-compatible wallet.'
  }
}

export function serializeStoredWalletSession(session: StoredWalletSession): string {
  return JSON.stringify(session)
}

export function parseStoredWalletSession(value: string | null): StoredWalletSession | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (
      parsed.version !== WALLET_SESSION_SCHEMA_VERSION ||
      parsed.transport !== 'mwa' ||
      typeof parsed.publicKey !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(parsed.publicKey) ||
      (parsed.accountLabel !== undefined && optionalText(parsed.accountLabel, 120) === undefined) ||
      (parsed.walletUriBase !== undefined && normalizeWalletUriBase(parsed.walletUriBase) === undefined) ||
      (parsed.walletIcon !== undefined && normalizeWalletIcon(parsed.walletIcon) === undefined)
    ) {
      return null
    }

    return createStoredWalletSession({
      publicKey: parsed.publicKey,
      accountLabel: optionalText(parsed.accountLabel, 120),
      walletUriBase: normalizeWalletUriBase(parsed.walletUriBase),
      walletIcon: normalizeWalletIcon(parsed.walletIcon),
    })
  } catch {
    return null
  }
}

export type StoredWalletSessionAudit = {
  session: StoredWalletSession | null
  discardLocalAuthorization: boolean
}

export function auditStoredWalletSession(
  currentValue: string | null,
  obsoleteValues: readonly (string | null)[],
): StoredWalletSessionAudit {
  const session = parseStoredWalletSession(currentValue)
  const currentValueIsInvalid = currentValue !== null && session === null
  const legacyStateExists = obsoleteValues.some((value) => value !== null)
  return {
    session,
    // A valid v3 session wins if cleanup of an older key was previously interrupted.
    // Otherwise any incompatible or legacy SeekerTag state requires a fresh MWA authorization.
    discardLocalAuthorization: currentValueIsInvalid || (!session && legacyStateExists),
  }
}

type ClearWalletSessionDependencies = {
  revokeServerBinding: () => Promise<void>
  deauthorizeWallet: () => Promise<void>
  clearAdapterAuthorization: () => Promise<void>
  clearSessionMetadata: () => Promise<void>
  signOut: () => Promise<void>
}

export type ClearWalletSessionResult = {
  walletDeauthorizationFailed: boolean
}

export async function clearWalletSession({
  revokeServerBinding,
  deauthorizeWallet,
  clearAdapterAuthorization,
  clearSessionMetadata,
  signOut,
}: ClearWalletSessionDependencies): Promise<ClearWalletSessionResult> {
  const requiredErrors: unknown[] = []
  let walletDeauthorizationFailed = false

  try {
    await revokeServerBinding()
  } catch (error) {
    requiredErrors.push(error)
  }

  // The original wallet may have been removed or its returned App Link may no
  // longer resolve. Deauthorization is best effort; server and local cleanup are not.
  try {
    await deauthorizeWallet()
  } catch {
    walletDeauthorizationFailed = true
  }

  for (const cleanup of [clearAdapterAuthorization, clearSessionMetadata, signOut]) {
    try {
      await cleanup()
    } catch (error) {
      requiredErrors.push(error)
    }
  }

  if (requiredErrors.length > 0) {
    throw new Error('The previous wallet session could not be fully cleared. Please try again.')
  }
  return { walletDeauthorizationFailed }
}
