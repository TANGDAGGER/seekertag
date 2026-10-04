export function getWalletErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('cancel') || normalized.includes('declin') || normalized.includes('reject')) {
    return 'Wallet connection was cancelled. Nothing was changed.'
  }
  if (
    normalized.includes('no wallet') ||
    normalized.includes('not found') ||
    normalized.includes('unavailable')
  ) {
    return 'No compatible Solana wallet was found. Install or open an MWA-compatible wallet, then try again.'
  }
  if (normalized.includes('network')) {
    return 'The wallet could not be reached. Check your connection and try again.'
  }
  return 'We could not connect to your wallet. Please try again.'
}
