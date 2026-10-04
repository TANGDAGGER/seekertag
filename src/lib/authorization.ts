export type OwnershipMutation =
  'register-item' | 'mark-lost' | 'change-reward' | 'resolve-report' | 'reward-finder' | 'transfer-ownership'

export function isOwnershipMutationAuthorized(input: {
  verifiedWallet: string | null
  currentOwnerWallet: string
  action: OwnershipMutation
}): boolean {
  if (!input.verifiedWallet) return false
  if (input.action === 'register-item') return true
  return input.verifiedWallet === input.currentOwnerWallet
}

export function canStartReward(input: {
  verifiedWallet: string | null
  currentOwnerWallet: string
  rewardState: 'none' | 'submitting' | 'submitted' | 'confirmed'
}): boolean {
  return input.verifiedWallet === input.currentOwnerWallet && input.rewardState === 'none'
}
