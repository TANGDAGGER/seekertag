import type { RewardTransactionStage } from './reward-diagnostics'

export function getRewardTransferErrorMessage(error: unknown, stage?: RewardTransactionStage): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (stage === 'reward_auth_start' || stage === 'reward_auth_complete') {
    return 'SeekerTag could not verify the owner wallet before starting the reward. No transaction was submitted.'
  }
  if (stage === 'reward_begin_rpc' || stage === 'reward_begin_rpc_complete') {
    return 'SeekerTag could not start the reward process. No transaction was submitted.'
  }
  if (
    normalized.includes('cancel') ||
    normalized.includes('reject') ||
    normalized.includes('declin') ||
    normalized.includes('abort')
  ) {
    return 'The transaction was cancelled in your wallet. No reward was recorded.'
  }
  if (
    normalized.includes('undefined is not a function') ||
    normalized.includes('is not a function') ||
    normalized.includes('throwifaborted')
  ) {
    return 'SeekerTag could not prepare the wallet transaction on this device. No reward was sent or recorded.'
  }
  if (normalized.includes('insufficient') && normalized.includes('fund')) {
    return 'There is not enough SOL or reward-token balance to complete this reward.'
  }
  if (normalized.includes('blockhash') || normalized.includes('expired')) {
    return 'The transaction expired before it was submitted. Please try again.'
  }
  return message || 'The reward transaction failed. No success was recorded.'
}
