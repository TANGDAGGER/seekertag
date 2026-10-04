import { spawn } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { getCreateAccountInstruction } from '@solana-program/system'
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  address,
  appendTransactionMessageInstructions,
  blockhash,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  signTransactionMessageWithSigners,
  writeKeyPairSigner,
  type Address,
  type KeyPairSigner,
  type Signature,
} from '@solana/kit'

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com'
const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
const AIRDROP_LAMPORTS = 100_000_000n
const MINIMUM_FEE_PAYER_BALANCE = 10_000_000n
const MAX_U64 = 18_446_744_073_709_551_615n

type Options = {
  owner: Address
  decimals: number
  amountText: string
  amountBaseUnits: bigint
  rpcUrl: string
  feePayerFile?: string
}

type RpcSignatureStatus = {
  err: unknown
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized'
}

async function postJsonWithPowerShell(url: string, body: string): Promise<string> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$body = [Console]::In.ReadToEnd()',
    "$response = Invoke-WebRequest -Method Post -Uri $env:SEEKERTAG_RPC_URL -ContentType 'application/json' -Body $body",
    '[Console]::Out.Write($response.Content)',
  ].join('; ')

  return await new Promise((resolve, reject) => {
    const child = spawn('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, SEEKERTAG_RPC_URL: url },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.stderr.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`PowerShell RPC transport failed: ${stderr.trim() || `exit ${code}`}`))
    })
    child.stdin.end(body)
  })
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: `seekertag-${method}`, method, params })
  let responseText: string

  if (process.platform === 'win32') {
    // Windows PowerShell honors the system proxy used by this host. Node fetch does not always do so.
    responseText = await postJsonWithPowerShell(rpcUrl, body)
  } else {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (!response.ok) throw new Error(`Solana RPC ${method} failed with HTTP ${response.status}.`)
    responseText = await response.text()
  }

  const payload = JSON.parse(responseText) as { result?: T; error?: { message?: string } }
  if (payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message || `Solana RPC ${method} returned no result.`)
  }
  return payload.result
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function parseAmount(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('--amount must be a positive decimal number.')
  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > decimals) throw new Error(`--amount has more than ${decimals} decimal places.`)
  const baseUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (baseUnits <= 0n || baseUnits > MAX_U64) throw new Error('--amount must fit in an SPL Token u64.')
  return baseUnits
}

function parseOptions(): Options {
  const positionalOwner = process.argv.slice(2).find((value, index, values) => {
    const previous = values[index - 1]
    return (
      !value.startsWith('--') &&
      previous !== '--owner' &&
      previous !== '--decimals' &&
      previous !== '--amount' &&
      previous !== '--rpc' &&
      previous !== '--fee-payer-file'
    )
  })
  const ownerText = valueAfter('--owner') ?? positionalOwner
  if (!ownerText) {
    throw new Error(
      'Usage: pnpm devnet:create-token -- --owner OWNER_WALLET_PUBLIC_ADDRESS [--decimals 6] [--amount 1000]',
    )
  }

  let owner: Address
  try {
    owner = address(ownerText)
  } catch {
    throw new Error('The owner must be a valid Solana wallet public address.')
  }

  const decimals = Number(valueAfter('--decimals') ?? '6')
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('--decimals must be a whole number from 0 to 18.')
  }
  const amountText = valueAfter('--amount') ?? '1000'
  const rpcUrl = valueAfter('--rpc') ?? DEFAULT_RPC_URL
  const feePayerFile = valueAfter('--fee-payer-file')
  return {
    owner,
    decimals,
    amountText,
    amountBaseUnits: parseAmount(amountText, decimals),
    rpcUrl,
    feePayerFile,
  }
}

async function loadOrCreateFeePayer(fileArgument?: string): Promise<{
  signer: KeyPairSigner
  filePath?: string
}> {
  if (!fileArgument) return { signer: await generateKeyPairSigner() }

  const workRoot = resolve(process.cwd(), 'work')
  const filePath = resolve(process.cwd(), fileArgument)
  if (!filePath.startsWith(`${workRoot}${sep}`)) {
    throw new Error('--fee-payer-file must resolve inside the ignored work/ directory.')
  }

  try {
    const bytes = JSON.parse(await readFile(filePath, 'utf8')) as number[]
    if (!Array.isArray(bytes) || bytes.length !== 64) {
      throw new Error('The DEVNET-only fee-payer file is not a 64-byte Solana keypair.')
    }
    return { signer: await createKeyPairSignerFromBytes(Uint8Array.from(bytes)), filePath }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    const signer = await generateKeyPairSigner(true)
    await writeKeyPairSigner(signer, filePath)
    return { signer, filePath }
  }
}

async function waitForConfirmation(
  rpcUrl: string,
  transactionSignature: Signature,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { value } = await rpcCall<{ value: Array<RpcSignatureStatus | null> }>(
      rpcUrl,
      'getSignatureStatuses',
      [[transactionSignature], { searchTransactionHistory: true }],
    )
    const status = value[0]
    if (status?.err) throw new Error(`${label} failed on Solana: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }
  throw new Error(`${label} was submitted but was not confirmed before the timeout.`)
}

async function main(): Promise<void> {
  const options = parseOptions()

  const genesisHash = await rpcCall<string>(options.rpcUrl, 'getGenesisHash')
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error(`REFUSING TO CONTINUE: RPC is not Solana devnet (reported genesis hash ${genesisHash}).`)
  }

  console.log('DEVNET CONFIRMED. Everything created by this tool is a worthless development asset.')
  const { signer: feePayer, filePath: feePayerFile } = await loadOrCreateFeePayer(options.feePayerFile)
  console.log(
    feePayerFile
      ? 'Using the DEVNET-ONLY fee payer stored under ignored work/ until this mint succeeds…'
      : 'Generating an in-memory DEVNET-ONLY fee-payer/mint-authority keypair…',
  )
  const mint = await generateKeyPairSigner()

  const { value: existingFeeBalance } = await rpcCall<{ value: number }>(options.rpcUrl, 'getBalance', [
    feePayer.address,
  ])
  try {
    if (BigInt(existingFeeBalance) < MINIMUM_FEE_PAYER_BALANCE) {
      const airdropSignature = signature(
        await rpcCall<string>(options.rpcUrl, 'requestAirdrop', [feePayer.address, Number(AIRDROP_LAMPORTS)]),
      )
      await waitForConfirmation(options.rpcUrl, airdropSignature, 'Devnet SOL airdrop')
    } else {
      console.log('The DEVNET-only fee payer is already funded; skipping the public faucet request.')
    }
  } catch (error) {
    const manualFunding = feePayerFile
      ? ` The DEVNET-only key remains at ${feePayerFile}. Fund this PUBLIC address with at least 0.02 devnet SOL, then rerun the exact same command: ${feePayer.address}.`
      : ''
    throw new Error(
      `The devnet faucet did not fund the ephemeral fee payer, so no mint was created. ` +
        (feePayerFile
          ? `A DEVNET-only fallback key was saved only because manual funding is required.`
          : `No private key was saved.`) +
        manualFunding +
        ` Cause: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const mintSize = getMintSize()
  const mintRent = lamports(
    BigInt(await rpcCall<number>(options.rpcUrl, 'getMinimumBalanceForRentExemption', [mintSize])),
  )
  const [ownerAta] = await findAssociatedTokenPda({
    owner: options.owner,
    mint: mint.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  const instructions = [
    getCreateAccountInstruction({
      payer: feePayer,
      newAccount: mint,
      lamports: mintRent,
      space: mintSize,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: options.decimals,
      mintAuthority: feePayer.address,
      freezeAuthority: null,
    }),
    getCreateAssociatedTokenIdempotentInstruction({
      payer: feePayer,
      ata: ownerAta,
      owner: options.owner,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
    getMintToCheckedInstruction({
      mint: mint.address,
      token: ownerAta,
      mintAuthority: feePayer,
      amount: options.amountBaseUnits,
      decimals: options.decimals,
    }),
  ] as const

  const { value: rawLatestBlockhash } = await rpcCall<{
    value: { blockhash: string; lastValidBlockHeight: number }
  }>(options.rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])
  const latestBlockhash = {
    blockhash: blockhash(rawLatestBlockhash.blockhash),
    lastValidBlockHeight: BigInt(rawLatestBlockhash.lastValidBlockHeight),
  }
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  )
  const signedTransaction = await signTransactionMessageWithSigners(message)
  const transactionSignature = getSignatureFromTransaction(signedTransaction)
  const submittedSignature = await rpcCall<string>(options.rpcUrl, 'sendTransaction', [
    getBase64EncodedWireTransaction(signedTransaction),
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ])
  if (submittedSignature !== transactionSignature) {
    throw new Error('Solana RPC returned an unexpected transaction signature.')
  }
  await waitForConfirmation(options.rpcUrl, transactionSignature, 'Mint transaction')

  if (feePayerFile) {
    try {
      await unlink(feePayerFile)
    } catch (error) {
      console.warn(
        `WARNING: Mint succeeded, but the DEVNET-only key file could not be deleted. Delete it manually: ${feePayerFile}. ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  console.log('')
  console.log('SUCCESS — WORTHLESS DEVNET ASSET ONLY')
  console.log(`Mint address: ${mint.address}`)
  console.log(`Decimals: ${options.decimals}`)
  console.log(`Owner address: ${options.owner}`)
  console.log(`Amount minted: ${options.amountText} DEV REWARD`)
  console.log(`Owner token account: ${ownerAta}`)
  console.log(`Explorer: https://explorer.solana.com/address/${mint.address}?cluster=devnet`)
  console.log('')
  console.log('Suggested environment-variable values:')
  console.log(`EXPO_PUBLIC_REWARD_TOKEN_MINT=${mint.address}`)
  console.log(`EXPO_PUBLIC_REWARD_TOKEN_DECIMALS=${options.decimals}`)
  console.log('EXPO_PUBLIC_REWARD_TOKEN_SYMBOL=DEV REWARD')
  console.log(`REWARD_TOKEN_MINT=${mint.address}`)
  console.log(`REWARD_TOKEN_DECIMALS=${options.decimals}`)
  console.log('')
  console.log(
    'The ephemeral DEVNET-only mint authority is discarded; any fallback fee-payer file was deleted.',
  )
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
