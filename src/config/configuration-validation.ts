export type SupportedCluster = 'devnet' | 'mainnet-beta'

export const OFFICIAL_SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'
export const OFFICIAL_SKR_DECIMALS = 6

const GENESIS_HASHES: Record<SupportedCluster, string> = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
}

export function parseBooleanEnvironment(value: string | undefined, name: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be explicitly set to true or false.`)
}

export function parseCluster(value: string | undefined): SupportedCluster {
  if (value === 'devnet' || value === 'mainnet-beta') return value
  throw new Error('EXPO_PUBLIC_SOLANA_CLUSTER must be devnet or mainnet-beta.')
}

export function parseRewardTokenEnvironment(input: {
  cluster: SupportedCluster
  mint?: string
  decimals?: string
  symbol?: string
  allowMissing?: boolean
}): { mint: string; decimals: number; symbol: string; isOfficialSkr: boolean } | null {
  const mint = input.mint?.trim()
  const rawDecimals = input.decimals?.trim()
  const symbol = input.symbol?.trim().toUpperCase()

  if (input.cluster === 'mainnet-beta') {
    if (mint && mint !== OFFICIAL_SKR_MINT) {
      throw new Error('Mainnet rewards must use the official SKR mint.')
    }
    if (rawDecimals && rawDecimals !== String(OFFICIAL_SKR_DECIMALS)) {
      throw new Error('Official SKR uses 6 decimals.')
    }
    if (symbol && symbol !== 'SKR') throw new Error('The mainnet reward token symbol must be SKR.')
    return {
      mint: OFFICIAL_SKR_MINT,
      decimals: OFFICIAL_SKR_DECIMALS,
      symbol: 'SKR',
      isOfficialSkr: true,
    }
  }

  if (mint === OFFICIAL_SKR_MINT) {
    throw new Error('Production SKR can only be used on Solana mainnet.')
  }
  if (!mint && !rawDecimals && !symbol && input.allowMissing) return null
  if (!mint || !rawDecimals || !symbol) {
    throw new Error(
      'Devnet rewards require EXPO_PUBLIC_REWARD_TOKEN_MINT, EXPO_PUBLIC_REWARD_TOKEN_DECIMALS, and EXPO_PUBLIC_REWARD_TOKEN_SYMBOL.',
    )
  }
  const decimals = Number(rawDecimals)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('EXPO_PUBLIC_REWARD_TOKEN_DECIMALS must be a whole number from 0 to 18.')
  }
  if (symbol === 'SKR') {
    throw new Error('A devnet test token must not be labeled SKR. Use TEST TOKEN or DEV REWARD.')
  }
  if (!/^[A-Z0-9][A-Z0-9 -]{0,15}$/.test(symbol)) {
    throw new Error('EXPO_PUBLIC_REWARD_TOKEN_SYMBOL must be a short display label.')
  }
  return { mint, decimals, symbol, isOfficialSkr: false }
}

export function assertGenesisHashMatchesCluster(cluster: SupportedCluster, genesisHash: string): void {
  if (GENESIS_HASHES[cluster] !== genesisHash) {
    throw new Error(
      `Solana RPC network mismatch: the app is configured for ${cluster}, but the RPC returned a different genesis hash.`,
    )
  }
}
