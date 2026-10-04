export type FinderReport = {
  id: string
  itemId: string
  finderWallet: string
  message?: string
  status: 'open' | 'returned' | 'rewarded'
  createdAt: string
  resolvedAt?: string
  rewardState: 'none' | 'submitting' | 'submitted' | 'confirmed'
  rewardAttemptId?: string
  rewardTransactionSignature?: string
}
