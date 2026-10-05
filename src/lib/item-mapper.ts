import type { Item } from '@/types/item'
import type { ItemRow, OwnershipEventRow } from '@/types/database'

export function mapItem(row: ItemRow, events: OwnershipEventRow[] = []): Item {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    ownerWallet: row.owner_wallet,
    status: row.status,
    finderRewardAmount: row.finder_reward_amount === null ? undefined : String(row.finder_reward_amount),
    rewardTransactionSignature: row.reward_transaction_signature ?? undefined,
    createdAt: row.created_at,
    ownershipHistory: events.map((event) => ({
      id: event.id,
      action: event.action,
      fromWallet: event.from_wallet ?? undefined,
      toWallet: event.to_wallet,
      createdAt: event.created_at,
      proof: event.proof ?? undefined,
    })),
  }
}
