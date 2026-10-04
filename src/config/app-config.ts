import {
  createSolanaDevnet,
  createSolanaMainnet,
  type AppIdentity,
  type SolanaCluster,
} from '@wallet-ui/react-native-kit'
import { address } from '@solana/kit'
import {
  assertGenesisHashMatchesCluster,
  parseBooleanEnvironment,
  parseCluster,
  parseRewardTokenEnvironment,
} from '@/config/configuration-validation'

const demoMode = parseBooleanEnvironment(process.env.EXPO_PUBLIC_DEMO_MODE, 'EXPO_PUBLIC_DEMO_MODE')
const buildVariant = process.env.EXPO_PUBLIC_BUILD_VARIANT?.trim().toLowerCase()
const walletDiagnosticsEnabled = __DEV__ || buildVariant === 'development' || buildVariant === 'preview'
const clusterName = parseCluster(process.env.EXPO_PUBLIC_SOLANA_CLUSTER)
const defaultRpcUrls = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
} as const

const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim() || defaultRpcUrls[clusterName]
const parsedRewardToken = parseRewardTokenEnvironment({
  cluster: clusterName,
  mint: process.env.EXPO_PUBLIC_REWARD_TOKEN_MINT,
  decimals: process.env.EXPO_PUBLIC_REWARD_TOKEN_DECIMALS,
  symbol: process.env.EXPO_PUBLIC_REWARD_TOKEN_SYMBOL,
  allowMissing: demoMode,
})

let rewardToken = null
if (parsedRewardToken) {
  try {
    rewardToken = { ...parsedRewardToken, mint: address(parsedRewardToken.mint), cluster: clusterName }
  } catch {
    throw new Error('EXPO_PUBLIC_REWARD_TOKEN_MINT is not a valid Solana address.')
  }
}

function createConfiguredCluster(): SolanaCluster {
  if (clusterName === 'mainnet-beta') return createSolanaMainnet({ url: rpcUrl })
  return createSolanaDevnet({ url: rpcUrl })
}

export const appConfig = {
  identity: {
    name: 'SeekerTag',
    uri: 'https://seekertag.app',
    icon: 'icon.png',
  } satisfies AppIdentity,
  cluster: createConfiguredCluster(),
  clusterName,
  rpcUrl,
  demoMode,
  walletDiagnosticsEnabled,
  rewardToken,
} as const

export async function verifyConfiguredRpc(): Promise<void> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'seekertag-health', method: 'getGenesisHash' }),
  })
  if (!response.ok) throw new Error(`Solana RPC health check failed with HTTP ${response.status}.`)
  const payload = (await response.json()) as { result?: string; error?: { message?: string } }
  if (!payload.result) throw new Error(payload.error?.message || 'Solana RPC did not return a genesis hash.')
  assertGenesisHashMatchesCluster(clusterName, payload.result)
}

export function getExplorerTransactionUrl(signature: string): string {
  const suffix = clusterName === 'mainnet-beta' ? '' : `?cluster=${clusterName}`
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${suffix}`
}
