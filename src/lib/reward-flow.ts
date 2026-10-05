import type { RewardTransactionStage } from './reward-diagnostics'

export class RewardFlowError extends Error {
  readonly stage: RewardTransactionStage
  readonly attemptId: string | null
  readonly submittedSignature: string | null
  readonly resetFailed: boolean
  override readonly cause: unknown

  constructor(input: {
    cause: unknown
    stage: RewardTransactionStage
    attemptId: string | null
    submittedSignature: string | null
    resetFailed: boolean
  }) {
    super(input.cause instanceof Error ? input.cause.message : String(input.cause))
    this.name = 'RewardFlowError'
    this.cause = input.cause
    this.stage = input.stage
    this.attemptId = input.attemptId
    this.submittedSignature = input.submittedSignature
    this.resetFailed = input.resetFailed
  }
}

export async function executeRewardFlow<TPrepared>(input: {
  begin(): Promise<string>
  prepare(onStage: (stage: RewardTransactionStage) => void): Promise<TPrepared>
  send(prepared: TPrepared): Promise<string>
  record(attemptId: string, signature: string): Promise<void>
  confirmChain(signature: string): Promise<void>
  confirmServer(signature: string): Promise<void>
  cancel(attemptId: string): Promise<void>
  onAttempt?(attemptId: string): void
  onSignature?(signature: string): void
  onStage?(stage: RewardTransactionStage): void
}): Promise<{ attemptId: string; signature: string }> {
  let stage: RewardTransactionStage = 'reward_begin_rpc'
  let attemptId: string | null = null
  let submittedSignature: string | null = null
  const updateStage = (nextStage: RewardTransactionStage) => {
    stage = nextStage
    input.onStage?.(nextStage)
  }

  try {
    updateStage('reward_begin_rpc')
    attemptId = await input.begin()
    updateStage('reward_begin_rpc_complete')
    input.onAttempt?.(attemptId)

    updateStage('reward_prepare_local')
    const prepared = await input.prepare(updateStage)
    updateStage('reward_wallet_open')
    updateStage('reward_wallet_send')
    const signature = await input.send(prepared)
    if (!signature) throw new Error('The wallet returned no transaction signature.')
    submittedSignature = signature
    updateStage('reward_signature_received')
    input.onSignature?.(signature)

    updateStage('reward_record_submission')
    await input.record(attemptId, signature)
    updateStage('reward_chain_confirm')
    await input.confirmChain(signature)
    updateStage('reward_server_confirm')
    await input.confirmServer(signature)
    updateStage('reward_complete')
    return { attemptId, signature }
  } catch (cause) {
    let resetFailed = false
    if (attemptId && !submittedSignature) {
      try {
        await input.cancel(attemptId)
      } catch {
        resetFailed = true
      }
    }
    throw new RewardFlowError({ cause, stage, attemptId, submittedSignature, resetFailed })
  }
}
