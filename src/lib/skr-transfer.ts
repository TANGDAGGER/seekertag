import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  address,
  createSolanaRpc,
  signature,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit'
import { appConfig, verifyConfiguredRpc } from '@/config/app-config'
import { parseTokenAmount } from '@/lib/token-amount'

const MINIMUM_FEE_BALANCE_LAMPORTS = 3_000_000n

export type PreparedRewardTransfer = {
  instructions: Instruction[]
  amountBaseUnits: bigint
  mint: Address
}

export async function prepareRewardTransfer(input: {
  ownerWallet: string
  finderWallet: string
  rewardAmount: string
  signer: TransactionSigner
}): Promise<PreparedRewardTransfer> {
  let owner: Address
  let finder: Address
  try {
    owner = address(input.ownerWallet)
    finder = address(input.finderWallet)
  } catch {
    throw new Error('The owner or finder wallet address is invalid.')
  }
  if (owner === finder) throw new Error('The finder wallet must be different from the owner wallet.')

  const rewardToken = appConfig.rewardToken
  if (!rewardToken) throw new Error('A reward token is not configured.')
  const { mint, decimals, symbol } = rewardToken
  const amountBaseUnits = parseTokenAmount(input.rewardAmount, decimals)
  const [source] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS })
  const [destination] = await findAssociatedTokenPda({
    owner: finder,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const rpc = createSolanaRpc(appConfig.rpcUrl)

  await verifyConfiguredRpc()

  const [{ value: feeBalance }, sourceBalanceResult, mintAccount] = await Promise.all([
    rpc.getBalance(owner).send(),
    rpc
      .getTokenAccountBalance(source)
      .send()
      .catch(() => null),
    rpc.getAccountInfo(mint, { encoding: 'base64' }).send(),
  ])

  if (feeBalance < MINIMUM_FEE_BALANCE_LAMPORTS) {
    throw new Error(
      'The owner wallet needs more SOL to pay network fees and, if needed, create the finder token account.',
    )
  }
  if (!sourceBalanceResult)
    throw new Error(`The owner wallet does not have a ${symbol} token account on this network.`)
  if (!mintAccount.value) throw new Error(`The configured ${symbol} mint does not exist on this network.`)
  if (mintAccount.value.owner !== TOKEN_PROGRAM_ADDRESS) {
    throw new Error(
      'The configured reward mint is not compatible with the SPL Token program used by this app.',
    )
  }
  if (sourceBalanceResult.value.decimals !== decimals) {
    throw new Error(
      `${symbol} decimal mismatch: the configured value is ${decimals}, but the mint reports ${sourceBalanceResult.value.decimals}.`,
    )
  }
  if (BigInt(sourceBalanceResult.value.amount) < amountBaseUnits) {
    throw new Error(`The owner wallet does not have enough ${symbol} for this reward.`)
  }

  return {
    amountBaseUnits,
    mint,
    instructions: [
      getCreateAssociatedTokenIdempotentInstruction({
        payer: input.signer,
        ata: destination,
        owner: finder,
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: input.signer,
        amount: amountBaseUnits,
        decimals,
      }),
    ],
  }
}

export function getRewardTransferErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('cancel') || normalized.includes('reject') || normalized.includes('declin')) {
    return 'The transaction was cancelled in your wallet. No reward was recorded.'
  }
  if (normalized.includes('insufficient') && normalized.includes('fund')) {
    return 'There is not enough SOL or reward-token balance to complete this reward.'
  }
  if (normalized.includes('blockhash') || normalized.includes('expired')) {
    return 'The transaction expired before it was submitted. Please try again.'
  }
  return message || 'The reward transaction failed. No success was recorded.'
}

export async function confirmRewardTransaction(transactionSignature: string): Promise<void> {
  const rpc = createSolanaRpc(appConfig.rpcUrl)
  const checkedSignature = signature(transactionSignature)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { value } = await rpc
      .getSignatureStatuses([checkedSignature], { searchTransactionHistory: true })
      .send()
    const status = value[0]
    if (status?.err) throw new Error('The reward transaction was submitted but failed on the Solana network.')
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }

  throw new Error(
    'The transaction was submitted, but confirmation is still pending. Check its signature in Solana Explorer before retrying.',
  )
}
