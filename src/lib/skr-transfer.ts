import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { address, createSolanaRpc, signature, type Address, type Instruction } from '@solana/kit'
import { appConfig, verifyConfiguredRpc } from '@/config/app-config'
import {
  createInstructionOnlySigner,
  prepareInstructionsForMobileWallet,
} from '@/features/wallet/wallet-instructions'
import type { RewardTransactionStage } from '@/lib/reward-diagnostics'
import { parseTokenAmount } from '@/lib/token-amount'

export { getRewardTransferErrorMessage } from '@/lib/reward-error'

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
  onStage?: (stage: RewardTransactionStage) => void
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
  input.onStage?.('reward_prepare_rpc')
  await verifyConfiguredRpc()

  input.onStage?.('reward_prepare_balance')
  const { value: feeBalance } = await createSolanaRpc(appConfig.rpcUrl).getBalance(owner).send()
  if (feeBalance < MINIMUM_FEE_BALANCE_LAMPORTS) {
    throw new Error(
      'The owner wallet needs more SOL to pay network fees and, if needed, create the finder token account.',
    )
  }

  input.onStage?.('reward_prepare_ata')
  const [source] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS })
  const [destination] = await findAssociatedTokenPda({
    owner: finder,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const rpc = createSolanaRpc(appConfig.rpcUrl)

  input.onStage?.('reward_prepare_balance')
  const [sourceBalanceResult, mintAccount] = await Promise.all([
    rpc
      .getTokenAccountBalance(source)
      .send()
      .catch(() => null),
    rpc.getAccountInfo(mint, { encoding: 'base64' }).send(),
  ])

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

  input.onStage?.('reward_prepare_instruction')
  const instructionSigner = createInstructionOnlySigner(owner)
  const instructions = prepareInstructionsForMobileWallet(
    [
      getCreateAssociatedTokenIdempotentInstruction({
        payer: instructionSigner,
        ata: destination,
        owner: finder,
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: instructionSigner,
        amount: amountBaseUnits,
        decimals,
      }),
    ],
    owner,
  )

  return {
    amountBaseUnits,
    mint,
    instructions,
  }
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
