import {
  AccountRole,
  isSignerRole,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit'

type SignerBearingAccount = {
  address: Address
  role: AccountRole
  signer?: TransactionSigner
}

export function createInstructionOnlySigner(address: Address): TransactionSigner {
  return {
    address,
    signTransactions: async (transactions) => transactions,
  }
}

export function prepareInstructionsForMobileWallet(
  instructions: readonly Instruction[],
  expectedSigner: Address,
): Instruction[] {
  let expectedSignerFound = false
  const prepared = instructions.map((instruction) => ({
    ...instruction,
    ...(instruction.accounts
      ? {
          accounts: instruction.accounts.map((account) => {
            const signerAccount = account as SignerBearingAccount
            if (isSignerRole(signerAccount.role)) {
              if (signerAccount.address !== expectedSigner) {
                throw new Error('A reward instruction requested an unexpected transaction signer.')
              }
              expectedSignerFound = true
            }
            return { address: signerAccount.address, role: signerAccount.role }
          }),
        }
      : {}),
  }))

  if (!expectedSignerFound) {
    throw new Error('The prepared reward transaction does not require the verified owner signature.')
  }
  return prepared
}

export async function sendInstructionsWithMobileWallet(
  sendTransactions: (instructions: Instruction[]) => Promise<string>,
  instructions: readonly Instruction[],
): Promise<string> {
  return await sendTransactions([...instructions])
}
