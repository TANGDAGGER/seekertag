export type RewardTransactionStage =
  | 'reward_auth_start'
  | 'reward_auth_complete'
  | 'reward_begin_rpc'
  | 'reward_begin_rpc_complete'
  | 'reward_prepare_local'
  | 'reward_prepare_rpc'
  | 'reward_prepare_balance'
  | 'reward_prepare_ata'
  | 'reward_prepare_instruction'
  | 'reward_wallet_open'
  | 'reward_wallet_send'
  | 'reward_signature_received'
  | 'reward_record_submission'
  | 'reward_chain_confirm'
  | 'reward_server_confirm'
  | 'reward_complete'

export type RewardTransactionDiagnostic = {
  stage: RewardTransactionStage
  errorClass: string
  errorCode?: string | number
  errorMessage?: string
  stackLocation?: string
  cluster: 'devnet'
}

function sanitizeDiagnosticText(value: string, maximumLength: number): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]{8,}){1,2}/g, '[redacted-token]')
    .replace(/[A-Za-z0-9+/_-]{64,}={0,2}/g, '[redacted-value]')
    .replace(/(?:https?|file):\/\/\S+/gi, '[redacted-url]')
    .replace(/[A-Za-z]:\\[^\s)]+/g, '[redacted-path]')
    .slice(0, maximumLength)
}

function getSanitizedStackLocation(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  for (const frame of stack.split('\n').slice(1)) {
    const v8Function = frame.match(/\bat\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/)
    if (v8Function?.[1]) return sanitizeDiagnosticText(v8Function[1], 80)
    const hermesFunction = frame.trim().match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)@/)
    if (hermesFunction?.[1]) return sanitizeDiagnosticText(hermesFunction[1], 80)
  }
  return undefined
}

export function getRewardErrorIdentity(error: unknown): {
  errorClass: string
  errorCode?: string | number
  errorMessage?: string
  stackLocation?: string
} {
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown; stack?: unknown } | null
  if (candidate && typeof candidate === 'object') {
    return {
      errorClass:
        typeof candidate.name === 'string' && candidate.name ? candidate.name : 'UnknownRewardError',
      ...(typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? { errorCode: candidate.code }
        : {}),
      ...(typeof candidate.message === 'string' && candidate.message
        ? { errorMessage: sanitizeDiagnosticText(candidate.message, 180) }
        : {}),
      ...(typeof candidate.stack === 'string' && getSanitizedStackLocation(candidate.stack)
        ? { stackLocation: getSanitizedStackLocation(candidate.stack) }
        : {}),
    }
  }
  return {
    errorClass: 'UnknownRewardError',
    ...(error === undefined || error === null
      ? {}
      : { errorMessage: sanitizeDiagnosticText(String(error), 180) }),
  }
}
