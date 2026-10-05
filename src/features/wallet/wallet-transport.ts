import { getAddressCodec, getBase64Encoder } from '@solana/kit'
import {
  transact,
  useMobileWallet,
  type KitMobileWallet,
  type WalletAuthorization,
} from '@wallet-ui/react-native-kit'
import {
  extractDetachedMessageSignature,
  runWalletAuthenticationSession,
  type VerifiedWalletBinding,
  type WalletAuthenticationStage,
  type WalletChallenge,
  type WalletSignatureProof,
} from '@/features/wallet/wallet-auth-flow'
import {
  createStoredWalletSession,
  getWalletAssociationConfig,
  normalizeWalletUriBase,
  type StoredWalletSession,
  type WalletSessionMetadata,
} from '@/features/wallet/wallet-session'
import { sendInstructionsWithMobileWallet } from '@/features/wallet/wallet-instructions'

type MobileWalletApi = ReturnType<typeof useMobileWallet>
export type WalletAccount = NonNullable<MobileWalletApi['account']>

type AuthorizedAccount = {
  address: string
  icon?: WalletAccount['icon']
  label?: string
}

type AuthorizationResult = {
  accounts: AuthorizedAccount[]
  auth_token: string
  wallet_uri_base?: string
  wallet_icon?: string
  sign_in_result?: {
    address: string
    signed_message: string
    signature: string
    signature_type?: string
  }
}

export type WalletTransportCapabilities = {
  authorize: boolean
  signMessage: boolean
  signAndSendTransaction: boolean
}

export interface WalletTransport {
  readonly id: 'mwa'
  readonly account: MobileWalletApi['account']
  readonly capabilities: WalletTransportCapabilities
  connect(): Promise<WalletAccount>
  connectAndVerify(options: ConnectAndVerifyOptions): Promise<VerifiedWalletBinding>
  disconnect(): Promise<void>
  deauthorize(): Promise<void>
  getPublicKey(): string | null
  signMessage: MobileWalletApi['signMessages']
  signAndSendTransaction: MobileWalletApi['signAndSendTransactions']
  sendTransactions: MobileWalletApi['sendTransactions']
}

export type ConnectAndVerifyOptions = {
  ensureSession(): Promise<void>
  requestChallenge(): Promise<WalletChallenge>
  verifyChallenge(
    publicKey: string,
    challengeId: string,
    proof: WalletSignatureProof,
  ): Promise<VerifiedWalletBinding>
  confirmServerBinding(publicKey: string): Promise<VerifiedWalletBinding | null>
  onAuthorized?(account: WalletAccount, diagnostics: { hasWalletUriBase: boolean }): void
  onWalletUriBaseObserved?(hasWalletUriBase: boolean): void
  onStage?(stage: WalletAuthenticationStage): void
}

type CreateMwaWalletTransportOptions = {
  getStoredSession: () => StoredWalletSession | null
  persistAuthorizedSession: (
    metadata: WalletSessionMetadata,
    preservePreviousWalletUri: boolean,
  ) => Promise<void>
}

function getAccountFromAuthorizedAccount(account: AuthorizedAccount): WalletAccount {
  const decoded = getBase64Encoder().encode(account.address)
  return {
    address: getAddressCodec().decode(decoded),
    addressBase64: account.address,
    ...(account.icon ? { icon: account.icon } : {}),
    ...(account.label ? { label: account.label } : {}),
  }
}

function isAuthorizationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === -1
}

type PreparedAuthorization = {
  authorization: WalletAuthorization
  result: AuthorizationResult
  selectedAccount: WalletAccount
}

type PendingAuthorization = {
  prepared: PreparedAuthorization
  preservePreviousWalletUri: boolean
}

export function createMwaWalletTransport(
  walletApi: MobileWalletApi,
  { getStoredSession, persistAuthorizedSession }: CreateMwaWalletTransportOptions,
): WalletTransport {
  const getCurrentAccount = () => walletApi.store.$selectedAccount.get()
  const getCurrentPublicKey = () => {
    const account = getCurrentAccount()
    return account ? String(account.address) : null
  }

  const prepareAuthorization = (result: AuthorizationResult): PreparedAuthorization => {
    if (!Array.isArray(result.accounts) || result.accounts.length === 0 || !result.auth_token) {
      throw new Error('The wallet returned an invalid Mobile Wallet Adapter authorization.')
    }
    if (result.wallet_uri_base && !normalizeWalletUriBase(result.wallet_uri_base)) {
      throw new Error('The wallet returned an unsafe Mobile Wallet Adapter reconnect URI.')
    }

    const accounts = result.accounts.map(getAccountFromAuthorizedAccount)
    const previousAccount = getCurrentAccount()
    const selectedAccount =
      accounts.find((account) => account.addressBase64 === previousAccount?.addressBase64) ?? accounts[0]!
    const authorization: WalletAuthorization = {
      accounts,
      authToken: result.auth_token,
      selectedAccount,
    }

    return { authorization, result, selectedAccount }
  }

  const persistAuthorization = async (
    prepared: PreparedAuthorization,
    preservePreviousWalletUri: boolean,
  ): Promise<WalletAccount> => {
    const { authorization, result, selectedAccount } = prepared
    await persistAuthorizedSession(
      {
        publicKey: String(selectedAccount.address),
        accountLabel: selectedAccount.label,
        walletUriBase: result.wallet_uri_base,
        walletIcon: result.wallet_icon,
      },
      preservePreviousWalletUri,
    )
    await walletApi.store.persist(authorization)
    return selectedAccount
  }

  const authorizeUnpersisted = async (
    wallet: KitMobileWallet,
    onWalletUriBaseObserved?: (hasWalletUriBase: boolean) => void,
    challenge?: WalletChallenge,
    onStage?: (stage: WalletAuthenticationStage) => void,
  ): Promise<PendingAuthorization> => {
    let signInSupported = false
    if (challenge) {
      try {
        const capabilities = await wallet.getCapabilities()
        signInSupported = capabilities.features.includes('solana:signInWithSolana')
      } catch {
        // Legacy wallets still have the mandatory sign_messages fallback.
        signInSupported = false
      }
    }
    const signInPayload =
      challenge && signInSupported
        ? {
            domain: challenge.domain,
            statement: challenge.statement,
            uri: challenge.uri,
            version: challenge.version,
            chainId: challenge.chainId,
            nonce: challenge.nonce,
            issuedAt: challenge.issuedAt,
            expirationTime: challenge.expiresAt,
          }
        : undefined
    if (signInPayload) onStage?.('siws_sign_in')

    const authToken = walletApi.store.$authToken.get()
    if (authToken) {
      try {
        const result = (await wallet.authorize({
          auth_token: authToken,
          chain: walletApi.chain,
          identity: walletApi.identity,
          ...(signInPayload ? { sign_in_payload: signInPayload } : {}),
        })) as AuthorizationResult
        if (signInSupported && !result.sign_in_result) {
          throw new Error('The wallet advertised SIWS support but returned no sign-in result.')
        }
        onWalletUriBaseObserved?.(Boolean(result.wallet_uri_base))
        return { prepared: prepareAuthorization(result), preservePreviousWalletUri: true }
      } catch (error) {
        if (!isAuthorizationFailure(error)) throw error
        await walletApi.store.persist(null)
      }
    }

    const result = (await wallet.authorize({
      chain: walletApi.chain,
      identity: walletApi.identity,
      ...(signInPayload ? { sign_in_payload: signInPayload } : {}),
    })) as AuthorizationResult
    if (signInSupported && !result.sign_in_result) {
      throw new Error('The wallet advertised SIWS support but returned no sign-in result.')
    }
    onWalletUriBaseObserved?.(Boolean(result.wallet_uri_base))
    return { prepared: prepareAuthorization(result), preservePreviousWalletUri: false }
  }

  const authorizeSession = async (wallet: KitMobileWallet): Promise<WalletAccount> => {
    const pending = await authorizeUnpersisted(wallet)
    return await persistAuthorization(pending.prepared, pending.preservePreviousWalletUri)
  }

  const currentAssociationConfig = () => getWalletAssociationConfig(getStoredSession(), getCurrentPublicKey())

  const connect = async () => {
    // A first/new connection is deliberately generic. An existing authorized
    // session may return to its own wallet through that wallet's URI. Change
    // Wallet clears both pieces of state before this method is called again.
    return await transact(async (wallet) => await authorizeSession(wallet), currentAssociationConfig())
  }

  const connectAndVerify = async ({
    ensureSession,
    requestChallenge,
    verifyChallenge,
    confirmServerBinding,
    onAuthorized,
    onWalletUriBaseObserved,
    onStage,
  }: ConnectAndVerifyOptions): Promise<VerifiedWalletBinding> => {
    const result = await runWalletAuthenticationSession<KitMobileWallet, WalletAccount, PendingAuthorization>(
      {
        ensureSession,
        requestChallenge,
        startAssociation: async (run) => await transact(run, currentAssociationConfig()),
        authorize: async (wallet, challenge, stageCallback) => {
          const pending = await authorizeUnpersisted(
            wallet,
            onWalletUriBaseObserved,
            challenge,
            stageCallback,
          )
          onAuthorized?.(pending.prepared.selectedAccount, {
            hasWalletUriBase: Boolean(pending.prepared.result.wallet_uri_base),
          })
          const signInResult = pending.prepared.result.sign_in_result
          return {
            account: pending.prepared.selectedAccount,
            publicKey: String(pending.prepared.selectedAccount.address),
            addressBase64: pending.prepared.selectedAccount.addressBase64,
            authorization: pending,
            ...(signInResult
              ? {
                  signInProof: {
                    method: 'siws' as const,
                    addressBase64: signInResult.address,
                    signedMessage: new Uint8Array(getBase64Encoder().encode(signInResult.signed_message)),
                    signature: new Uint8Array(getBase64Encoder().encode(signInResult.signature)),
                    ...(signInResult.signature_type ? { signatureType: signInResult.signature_type } : {}),
                  },
                }
              : {}),
          }
        },
        signMessage: async (wallet, addressBase64, message) => {
          const signed = await wallet.signMessages({ addresses: [addressBase64], payloads: [message] })
          return signed[0]!
        },
        extractSignature: extractDetachedMessageSignature,
        verifyChallenge,
        confirmServerBinding,
        persistAuthorization: async (pending) => {
          await persistAuthorization(pending.prepared, pending.preservePreviousWalletUri)
        },
        onStage,
      },
    )
    return result.binding
  }

  const signMessages = (async (message: Uint8Array | Uint8Array[]) => {
    const result = await transact(async (wallet) => {
      const account = await authorizeSession(wallet)
      const isArray = Array.isArray(message)
      const payloads: Uint8Array[] = isArray ? message : [message]
      const signed = await wallet.signMessages({
        addresses: payloads.map(() => account.addressBase64),
        payloads,
      })
      const signatures = signed.map((signedPayload, index) =>
        extractDetachedMessageSignature(signedPayload, payloads[index]!),
      )
      return isArray ? signatures : signatures[0]!
    }, currentAssociationConfig())
    return result
  }) as MobileWalletApi['signMessages']

  const signAndSendTransactions = (async (
    transaction: Parameters<MobileWalletApi['signAndSendTransactions']>[0],
    minContextSlot: bigint,
  ) => {
    const result = await transact(async (wallet) => {
      await authorizeSession(wallet)
      const transactions = Array.isArray(transaction) ? transaction : [transaction]
      const signatures = await wallet.signAndSendTransactions({
        minContextSlot: Number(minContextSlot),
        transactions: transactions as Parameters<
          KitMobileWallet['signAndSendTransactions']
        >[0]['transactions'],
      })
      return Array.isArray(transaction) ? signatures : signatures[0]!
    }, currentAssociationConfig())
    return result
  }) as MobileWalletApi['signAndSendTransactions']

  const sendTransactions: MobileWalletApi['sendTransactions'] = async (instructions) => {
    if (!getCurrentAccount()) throw new Error('No MWA wallet account is authorized.')
    return await sendInstructionsWithMobileWallet(walletApi.sendTransactions, instructions)
  }

  return {
    id: 'mwa',
    account: walletApi.account,
    capabilities: {
      authorize: true,
      signMessage: true,
      signAndSendTransaction: true,
    },
    connect,
    connectAndVerify,
    disconnect: async () => await walletApi.store.persist(null),
    deauthorize: async () => {
      const authToken = walletApi.store.$authToken.get()
      if (!authToken) return
      await transact(async (wallet) => {
        await wallet.deauthorize({ auth_token: authToken })
      }, currentAssociationConfig())
    },
    getPublicKey: getCurrentPublicKey,
    signMessage: signMessages,
    signAndSendTransaction: signAndSendTransactions,
    sendTransactions,
  }
}

export function getPersistedWalletSession(
  metadata: WalletSessionMetadata,
  previous: StoredWalletSession | null,
  preservePreviousWalletUri: boolean,
): StoredWalletSession {
  return createStoredWalletSession(metadata, previous, preservePreviousWalletUri)
}
