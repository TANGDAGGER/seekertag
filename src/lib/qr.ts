const ITEM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEMO_ITEM_ID_PATTERN = /^demo-[a-z0-9-]{1,64}$/i

export function isValidItemId(value: string, allowDemo = false): boolean {
  return ITEM_ID_PATTERN.test(value) || (allowDemo && DEMO_ITEM_ID_PATTERN.test(value))
}

export function createItemQrValue(itemId: string, allowDemo = false): string {
  if (!isValidItemId(itemId, allowDemo)) throw new Error('Cannot create a QR code for an invalid item ID.')
  return `seekertag://public-item/${encodeURIComponent(itemId)}`
}

export function parseSeekerTagQr(value: string, allowDemo = false): string | null {
  if (value.length > 300 || !value.startsWith('seekertag://')) return null

  try {
    const url = new URL(value)
    if (
      url.protocol !== 'seekertag:' ||
      url.hostname !== 'public-item' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      url.port
    )
      return null
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length !== 1) return null
    const id = decodeURIComponent(segments[0]!)
    return isValidItemId(id, allowDemo) ? id : null
  } catch {
    return null
  }
}
