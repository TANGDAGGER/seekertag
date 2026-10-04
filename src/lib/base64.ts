import { fromUint8Array } from 'js-base64'

export function bytesToBase64(bytes: Uint8Array): string {
  return fromUint8Array(bytes)
}
