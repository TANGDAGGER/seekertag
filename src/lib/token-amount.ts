export function parseTokenAmount(value: string | number, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Token decimals must be a whole number from 0 to 18.')
  }
  const normalized = String(value).trim()
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error('Enter a valid token amount.')
  const [whole = '0', fraction = ''] = normalized.split('.')
  if (fraction.length > decimals) throw new Error(`This token supports at most ${decimals} decimal places.`)
  const baseUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (baseUnits <= 0n) throw new Error('The reward must be greater than zero.')
  if (baseUnits > 18_446_744_073_709_551_615n) throw new Error('The reward exceeds the SPL Token limit.')
  return baseUnits
}
