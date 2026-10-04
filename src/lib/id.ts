import { randomUUID } from 'react-native-quick-crypto'

export function createId(): string {
  return randomUUID()
}
