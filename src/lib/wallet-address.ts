import { address, type Address } from '@solana/kit'

export function parseWalletAddress(value: string): Address {
  try {
    return address(value.trim())
  } catch {
    throw new Error('Enter a valid Solana wallet address.')
  }
}

export function isValidWalletAddress(value: string): boolean {
  try {
    parseWalletAddress(value)
    return true
  } catch {
    return false
  }
}
