import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { appConfig } from '@/config/app-config'
import { supabase } from '@/config/supabase'
import { WalletPicker } from '@/features/wallet/wallet-picker'
import type { WalletAuthenticationStage } from '@/features/wallet/wallet-auth-flow'
import {
  auditStoredWalletSession,
  classifyWalletFailure,
  clearWalletSession,
  getWalletFailureMessage,
  initialWalletSessionState,
  OBSOLETE_WALLET_AUTHORIZATION_CACHE_KEYS,
  OBSOLETE_WALLET_SESSION_STORAGE_KEYS,
  reduceWalletSession,
  serializeStoredWalletSession,
  WALLET_SESSION_STORAGE_KEY,
  type StoredWalletSession,
  type WalletSessionMetadata,
} from '@/features/wallet/wallet-session'
import {
  createMwaWalletTransport,
  getPersistedWalletSession,
  type WalletAccount,
  type WalletTransport,
} from '@/features/wallet/wallet-transport'
import { ensureAppSession } from '@/lib/auth-session'
import {
  getWalletAuthStatus,
  requestWalletChallenge,
  revokeWalletAuthentication,
  verifyWalletChallenge,
} from '@/lib/wallet-auth'

function getWalletErrorDiagnostic(error: unknown): { errorClass: string; code?: string | number } {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown }
    return {
      errorClass: error.name || 'Error',
      ...(typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? { code: candidate.code }
        : {}),
    }
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; name?: unknown }
    return {
      errorClass: typeof candidate.name === 'string' ? candidate.name : 'UnknownWalletError',
      ...(typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? { code: candidate.code }
        : {}),
    }
  }
  return { errorClass: 'UnknownWalletError' }
}

export type WalletAuthenticationDiagnostic = {
  stage: WalletAuthenticationStage
  mwaErrorCode?: string | number
  mwaErrorClass: string
  walletUriBaseReturned: boolean
  authorizedAccountObtained: boolean
  challengeObtained: boolean
  signedPayloadReceived: boolean
  serverVerificationReached: boolean
  cluster: 'devnet'
}

type SeekerWalletContextValue = {
  account: WalletAccount | undefined
  connectedAccount: WalletAccount | undefined
  connectedAddress: string | null
  verified: boolean
  status: ReturnType<typeof reduceWalletSession>['status']
  authStage: WalletAuthenticationStage | null
  error: string | null
  authenticationDiagnostic: WalletAuthenticationDiagnostic | null
  walletSession: StoredWalletSession | null
  capabilities: WalletTransport['capabilities']
  openWalletChooser(): void
  disconnect(): Promise<void>
  changeWallet(): Promise<void>
  retryVerification(): Promise<void>
  signMessages: WalletTransport['signMessage']
  signAndSendTransactions: WalletTransport['signAndSendTransaction']
  sendTransactions: WalletTransport['sendTransactions']
}

const SeekerWalletContext = createContext<SeekerWalletContextValue | null>(null)

export function SeekerWalletProvider({ children }: PropsWithChildren) {
  const mobileWallet = useMobileWallet()
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(reduceWalletSession, initialWalletSessionState)
  const [chooserVisible, setChooserVisible] = useState(false)
  const [errorOverride, setErrorOverride] = useState<string | null>(null)
  const [walletNotice, setWalletNotice] = useState<string | null>(null)
  const [walletSession, setWalletSession] = useState<StoredWalletSession | null>(null)
  const [authenticationDiagnostic, setAuthenticationDiagnostic] =
    useState<WalletAuthenticationDiagnostic | null>(null)
  const [pendingAccount, setPendingAccount] = useState<WalletAccount | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const storedSession = useRef<StoredWalletSession | null>(null)
  const clearing = useRef(false)
  const restoredServerCheck = useRef<string | null>(null)

  const persistAuthorizedSession = useCallback(
    async (metadata: WalletSessionMetadata, preservePreviousWalletUri: boolean) => {
      const session = getPersistedWalletSession(metadata, storedSession.current, preservePreviousWalletUri)
      storedSession.current = session
      setWalletSession(session)
      await AsyncStorage.setItem(WALLET_SESSION_STORAGE_KEY, serializeStoredWalletSession(session))
    },
    [],
  )

  const getStoredSession = useCallback(() => storedSession.current, [])
  const transport = useMemo(
    () => createMwaWalletTransport(mobileWallet, { getStoredSession, persistAuthorizedSession }),
    [getStoredSession, mobileWallet, persistAuthorizedSession],
  )

  useEffect(() => {
    let active = true
    void (async () => {
      const sessionKeys = [WALLET_SESSION_STORAGE_KEY, ...OBSOLETE_WALLET_SESSION_STORAGE_KEYS]
      const entries = await AsyncStorage.multiGet(sessionKeys)
      const values = new Map(entries)
      const audit = auditStoredWalletSession(
        values.get(WALLET_SESSION_STORAGE_KEY) ?? null,
        OBSOLETE_WALLET_SESSION_STORAGE_KEYS.map((key) => values.get(key) ?? null),
      )

      await AsyncStorage.multiRemove([
        ...OBSOLETE_WALLET_SESSION_STORAGE_KEYS,
        ...OBSOLETE_WALLET_AUTHORIZATION_CACHE_KEYS,
      ])
      if (audit.discardLocalAuthorization) {
        // This clears only SeekerTag's app-local MWA authorization cache. It does
        // not deauthorize, clear, or otherwise modify the external wallet app.
        await mobileWallet.store.persist(null)
        await AsyncStorage.removeItem(WALLET_SESSION_STORAGE_KEY)
      }
      if (!active) return
      const restored = audit.discardLocalAuthorization ? null : audit.session
      storedSession.current = restored
      setWalletSession(restored)
      dispatch({ type: 'RESTORED' })
    })()
      .catch(() => {
        if (!active) return
        storedSession.current = null
        setWalletSession(null)
        setErrorOverride('Stored wallet state could not be checked. Clear SeekerTag app data and try again.')
      })
      .finally(() => {
        if (active) setStorageReady(true)
      })
    return () => {
      active = false
    }
  }, [mobileWallet.store])

  useEffect(() => {
    const address = transport.getPublicKey()
    dispatch({ type: 'ACCOUNT_OBSERVED', address })
    if (!address || clearing.current) return

    if (storedSession.current && storedSession.current.publicKey !== address) {
      storedSession.current = null
      setWalletSession(null)
      dispatch({ type: 'RESTORED' })
      restoredServerCheck.current = null
      void AsyncStorage.removeItem(WALLET_SESSION_STORAGE_KEY)
    }

    if (appConfig.demoMode) {
      dispatch({ type: 'VERIFIED', address })
      return
    }
    if (!storageReady || restoredServerCheck.current === address) return
    restoredServerCheck.current = address
    void getWalletAuthStatus()
      .then(async (binding) => {
        if (clearing.current || transport.getPublicKey() !== address) return
        if (binding?.walletAddress === address && new Date(binding.expiresAt).getTime() > Date.now()) {
          if (!storedSession.current) {
            const session = getPersistedWalletSession(
              { publicKey: address, accountLabel: transport.account?.label },
              null,
              false,
            )
            storedSession.current = session
            setWalletSession(session)
            await AsyncStorage.setItem(WALLET_SESSION_STORAGE_KEY, serializeStoredWalletSession(session))
          }
          dispatch({ type: 'VERIFIED', address })
          return
        }
        setErrorOverride('Wallet connected, but verification was not completed.')
        dispatch({ type: 'FAILED', failure: 'unknown' })
      })
      .catch((error) => {
        if (clearing.current) return
        dispatch({ type: 'FAILED', failure: classifyWalletFailure(error) })
      })
  }, [storageReady, transport])

  const connectWallet = useCallback(async () => {
    dispatch({ type: 'CONNECT_STARTED' })
    setErrorOverride(null)
    setWalletNotice(null)
    setAuthenticationDiagnostic(null)
    setChooserVisible(false)
    let stage: WalletAuthenticationStage = 'preflight_session'
    let authorizationCompleted = false
    let returnedWalletUri = false
    let challengeObtained = false
    let signedPayloadReceived = false
    let serverVerificationReached = false
    try {
      if (appConfig.demoMode) {
        const account = await transport.connect()
        const publicKey = String(account.address)
        setPendingAccount(null)
        dispatch({ type: 'ACCOUNT_OBSERVED', address: publicKey })
        dispatch({ type: 'VERIFIED', address: publicKey })
        return
      }
      if (
        !transport.capabilities.authorize ||
        !transport.capabilities.signMessage ||
        !transport.capabilities.signAndSendTransaction
      ) {
        throw new Error('This wallet does not support the required Mobile Wallet Adapter capabilities.')
      }

      const binding = await transport.connectAndVerify({
        ensureSession: async () => {
          await ensureAppSession()
        },
        requestChallenge: requestWalletChallenge,
        verifyChallenge: verifyWalletChallenge,
        confirmServerBinding: async (publicKey) => {
          const confirmed = await getWalletAuthStatus()
          if (!confirmed || confirmed.walletAddress !== publicKey) return null
          if (new Date(confirmed.expiresAt).getTime() <= Date.now()) return null
          return confirmed
        },
        onAuthorized: (account, diagnostics) => {
          authorizationCompleted = true
          returnedWalletUri = diagnostics.hasWalletUriBase
          setPendingAccount(account)
          dispatch({ type: 'ACCOUNT_OBSERVED', address: String(account.address) })
        },
        onWalletUriBaseObserved: (hasWalletUriBase) => {
          returnedWalletUri = hasWalletUriBase
        },
        onStage: (nextStage) => {
          stage = nextStage
          if (nextStage === 'association_start') challengeObtained = true
          if (nextStage === 'signature_extract') signedPayloadReceived = true
          if (nextStage === 'server_verify') serverVerificationReached = true
          dispatch({ type: 'AUTH_STAGE', stage: nextStage })
        },
      })
      if (clearing.current || transport.getPublicKey() !== binding.walletAddress) return
      setPendingAccount(null)
      restoredServerCheck.current = binding.walletAddress
      dispatch({ type: 'ACCOUNT_OBSERVED', address: binding.walletAddress })
      dispatch({ type: 'VERIFIED', address: binding.walletAddress })
      setAuthenticationDiagnostic(null)
      await queryClient.invalidateQueries({ queryKey: ['items'] })
    } catch (error) {
      const errorDiagnostic = getWalletErrorDiagnostic(error)
      if (appConfig.walletDiagnosticsEnabled && appConfig.clusterName === 'devnet') {
        setAuthenticationDiagnostic({
          stage,
          ...(errorDiagnostic.code !== undefined ? { mwaErrorCode: errorDiagnostic.code } : {}),
          mwaErrorClass: errorDiagnostic.errorClass,
          walletUriBaseReturned: returnedWalletUri,
          authorizedAccountObtained: authorizationCompleted,
          challengeObtained,
          signedPayloadReceived,
          serverVerificationReached,
          cluster: 'devnet',
        })
      }
      if (__DEV__) {
        console.warn('[SeekerTag wallet authentication]', {
          ...errorDiagnostic,
          stage,
          hasWalletUriBase: returnedWalletUri,
          cluster: appConfig.clusterName,
          chain: appConfig.clusterName === 'devnet' ? 'solana:devnet' : 'solana:mainnet',
        })
      }
      if (authorizationCompleted) {
        setErrorOverride('Wallet connected, but verification was not completed.')
      } else {
        setPendingAccount(null)
      }
      dispatch({ type: 'FAILED', failure: classifyWalletFailure(error) })
    }
  }, [queryClient, transport])

  const disconnect = useCallback(async () => {
    clearing.current = true
    dispatch({ type: 'DISCONNECT_STARTED' })
    setErrorOverride(null)
    setAuthenticationDiagnostic(null)
    try {
      const cleanup = await clearWalletSession({
        revokeServerBinding: revokeWalletAuthentication,
        deauthorizeWallet: transport.deauthorize,
        clearAdapterAuthorization: transport.disconnect,
        clearSessionMetadata: async () => {
          storedSession.current = null
          setWalletSession(null)
          setPendingAccount(null)
          restoredServerCheck.current = null
          await AsyncStorage.multiRemove([
            WALLET_SESSION_STORAGE_KEY,
            ...OBSOLETE_WALLET_SESSION_STORAGE_KEYS,
            ...OBSOLETE_WALLET_AUTHORIZATION_CACHE_KEYS,
          ])
        },
        signOut: async () => {
          if (!supabase) return
          const { error } = await supabase.auth.signOut()
          if (error) throw error
          await ensureAppSession()
        },
      })
      queryClient.removeQueries()
      dispatch({ type: 'CLEARED' })
      if (cleanup.walletDeauthorizationFailed) {
        const warning =
          'The previous wallet could not confirm remote deauthorization, but its SeekerTag binding and local session were cleared.'
        setWalletNotice(warning)
        setErrorOverride(warning)
      }
    } catch (error) {
      setErrorOverride(error instanceof Error ? error.message : 'The wallet session could not be cleared.')
      dispatch({ type: 'FAILED', failure: 'unknown' })
      throw error
    } finally {
      clearing.current = false
    }
  }, [queryClient, transport])

  const changeWallet = useCallback(async () => {
    await disconnect()
    setChooserVisible(true)
  }, [disconnect])

  const retryVerification = useCallback(async () => {
    await connectWallet()
  }, [connectWallet])

  const connectedAccount = pendingAccount ?? transport.account
  const connectedAddress = connectedAccount ? String(connectedAccount.address) : null
  const verified =
    !appConfig.demoMode &&
    Boolean(connectedAddress) &&
    state.status === 'verified' &&
    state.verifiedAddress === connectedAddress
  const account = appConfig.demoMode ? connectedAccount : verified ? connectedAccount : undefined
  const error = errorOverride ?? (state.failure ? getWalletFailureMessage(state.failure) : null)
  const busy = ['connecting', 'verifying', 'disconnecting'].includes(state.status)

  const value = useMemo<SeekerWalletContextValue>(
    () => ({
      account,
      connectedAccount,
      connectedAddress,
      verified,
      status: state.status,
      authStage: state.authStage,
      error,
      authenticationDiagnostic,
      walletSession,
      capabilities: transport.capabilities,
      openWalletChooser: () => {
        setErrorOverride(null)
        setAuthenticationDiagnostic(null)
        setChooserVisible(true)
      },
      disconnect,
      changeWallet,
      retryVerification,
      signMessages: transport.signMessage,
      signAndSendTransactions: transport.signAndSendTransaction,
      sendTransactions: transport.sendTransactions,
    }),
    [
      account,
      authenticationDiagnostic,
      changeWallet,
      connectedAccount,
      connectedAddress,
      disconnect,
      error,
      retryVerification,
      state.status,
      state.authStage,
      transport,
      verified,
      walletSession,
    ],
  )

  return (
    <SeekerWalletContext.Provider value={value}>
      {children}
      <WalletPicker
        busy={busy}
        onClose={() => setChooserVisible(false)}
        notice={walletNotice}
        onConnectMwa={() => void connectWallet()}
        visible={chooserVisible}
      />
    </SeekerWalletContext.Provider>
  )
}

export function useSeekerWallet(): SeekerWalletContextValue {
  const context = useContext(SeekerWalletContext)
  if (!context) throw new Error('useSeekerWallet must be used inside SeekerWalletProvider.')
  return context
}
