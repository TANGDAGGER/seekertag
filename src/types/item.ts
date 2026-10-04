export type ItemStatus = 'protected' | 'lost' | 'returned'

export type OwnershipEvent = {
  id: string
  action: 'claimed' | 'transferred'
  fromWallet?: string
  toWallet: string
  createdAt: string
  proof?: string
}

export type Item = {
  id: string
  name: string
  description?: string
  imageUrl?: string
  ownerWallet: string
  status: ItemStatus
  finderRewardAmount?: string
  rewardTransactionSignature?: string
  createdAt: string
  ownershipHistory: OwnershipEvent[]
}
