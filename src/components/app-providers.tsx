import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  MobileWalletProvider,
  type WalletAuthorization,
  type WalletAuthorizationCache,
} from '@wallet-ui/react-native-kit'
import type { PropsWithChildren } from 'react'
import { appConfig } from '@/config/app-config'
import { SeekerWalletProvider } from '@/features/wallet/wallet-provider'
import { WALLET_AUTHORIZATION_CACHE_KEY } from '@/features/wallet/wallet-session'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000 },
    mutations: { retry: 0 },
  },
})
const walletAuthorizationCache: WalletAuthorizationCache = {
  clear: async () => await AsyncStorage.removeItem(WALLET_AUTHORIZATION_CACHE_KEY),
  get: async () => {
    const value = await AsyncStorage.getItem(WALLET_AUTHORIZATION_CACHE_KEY)
    if (!value) return undefined
    try {
      return JSON.parse(value) as WalletAuthorization
    } catch {
      await AsyncStorage.removeItem(WALLET_AUTHORIZATION_CACHE_KEY)
      return undefined
    }
  },
  set: async (value) => await AsyncStorage.setItem(WALLET_AUTHORIZATION_CACHE_KEY, JSON.stringify(value)),
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileWalletProvider
        cache={walletAuthorizationCache}
        cluster={appConfig.cluster}
        identity={appConfig.identity}
      >
        <SeekerWalletProvider>{children}</SeekerWalletProvider>
      </MobileWalletProvider>
    </QueryClientProvider>
  )
}
