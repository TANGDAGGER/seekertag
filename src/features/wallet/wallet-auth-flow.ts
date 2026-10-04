export type WalletAuthenticationStage =
  | 'preflight_session'
  | 'challenge_request_pre_wallet'
  | 'association_start'
  | 'authorize'
  | 'siws_sign_in'
  | 'sign_messages_fallback'
  | 'signature_extract'
  | 'server_verify'
  | 'server_binding'
  | 'session_persist'

export type WalletChallenge = {
  challengeId: string
  domain: string
  uri: string
  nonce: string
  issuedAt: string
  expiresAt: string
  statement: string
  chainId: 'solana:devnet'
  version: '1'
}

export type WalletSignatureProof = {
  method: 'siws' | 'sign_messages'
  signedMessage: Uint8Array
  signature: Uint8Array
  signatureType?: string
  addressBase64?: string
}

export type VerifiedWalletBinding = {
  walletAddress: string
  verifiedAt: string
  expiresAt: string
}

type AuthorizedSession<TAccount, TAuthorization> = {
  account: TAccount
  publicKey: string
  addressBase64: string
  authorization: TAuthorization
  signInProof?: WalletSignatureProof
}

type WalletAuthenticationDependencies<TWallet, TAccount, TAuthorization> = {
  ensureSession(): Promise<void>
  requestChallenge(): Promise<WalletChallenge>
  startAssociation<T>(run: (wallet: TWallet) => Promise<T>): Promise<T>
  authorize(
    wallet: TWallet,
    challenge: WalletChallenge,
    onStage?: (stage: WalletAuthenticationStage) => void,
  ): Promise<AuthorizedSession<TAccount, TAuthorization>>
  signMessage(wallet: TWallet, addressBase64: string, message: Uint8Array): Promise<Uint8Array>
  extractSignature(signedPayload: Uint8Array, expectedMessage: Uint8Array): Uint8Array
  verifyChallenge(
    publicKey: string,
    challengeId: string,
    proof: WalletSignatureProof,
  ): Promise<VerifiedWalletBinding>
  confirmServerBinding(publicKey: string): Promise<VerifiedWalletBinding | null>
  persistAuthorization(authorization: TAuthorization): Promise<void>
  onAuthorized?(account: TAccount): void
  onChallenge?(challenge: WalletChallenge): void
  onStage?(stage: WalletAuthenticationStage): void
}

export type WalletAuthenticationResult<TAccount> = {
  account: TAccount
  binding: VerifiedWalletBinding
  method: WalletSignatureProof['method']
}

export function createWalletAuthenticationMessage(
  challenge: WalletChallenge,
  walletAddress: string,
): Uint8Array {
  const fields = [
    `URI: ${challenge.uri}`,
    `Version: ${challenge.version}`,
    `Chain ID: ${challenge.chainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expiration Time: ${challenge.expiresAt}`,
  ]
  const message = [
    `${challenge.domain} wants you to sign in with your Solana account:`,
    walletAddress,
    '',
    challenge.statement,
    '',
    ...fields,
  ].join('\n')
  return new TextEncoder().encode(message)
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export function extractDetachedMessageSignature(
  signedPayload: Uint8Array,
  expectedMessage: Uint8Array,
): Uint8Array {
  const signatureLength = 64
  if (signedPayload.length < signatureLength) {
    throw new Error('The wallet returned an invalid Ed25519 signed message.')
  }
  const messageLength = signedPayload.length - signatureLength
  if (messageLength > 0) {
    if (!byteArraysEqual(signedPayload.slice(0, messageLength), expectedMessage)) {
      throw new Error('The wallet signed a different authentication message.')
    }
  }
  return signedPayload.slice(messageLength)
}

function validateSiwsProof(
  proof: WalletSignatureProof,
  expectedMessage: Uint8Array,
  expectedAddressBase64: string,
): WalletSignatureProof {
  if (proof.method !== 'siws') throw new Error('The wallet returned an invalid SIWS result.')
  if (!proof.addressBase64 || proof.addressBase64 !== expectedAddressBase64) {
    throw new Error('The SIWS address does not match the authorized MWA account.')
  }
  if (proof.signatureType && proof.signatureType.toLowerCase() !== 'ed25519') {
    throw new Error('The wallet returned an unsupported SIWS signature type.')
  }
  if (proof.signature.length !== 64) {
    throw new Error('The wallet returned an invalid Ed25519 SIWS signature.')
  }
  if (!byteArraysEqual(proof.signedMessage, expectedMessage)) {
    throw new Error('The wallet signed a different SIWS authentication message.')
  }
  return proof
}

export async function runWalletAuthenticationSession<TWallet, TAccount, TAuthorization>({
  ensureSession,
  requestChallenge,
  startAssociation,
  authorize,
  signMessage,
  extractSignature,
  verifyChallenge,
  confirmServerBinding,
  persistAuthorization,
  onAuthorized,
  onChallenge,
  onStage,
}: WalletAuthenticationDependencies<TWallet, TAccount, TAuthorization>): Promise<
  WalletAuthenticationResult<TAccount>
> {
  onStage?.('preflight_session')
  await ensureSession()

  // This network request must complete before Android launches a wallet Activity.
  onStage?.('challenge_request_pre_wallet')
  const challenge = await requestChallenge()
  onChallenge?.(challenge)

  onStage?.('association_start')
  const associated = await startAssociation(async (wallet) => {
    onStage?.('authorize')
    const authorized = await authorize(wallet, challenge, onStage)
    onAuthorized?.(authorized.account)
    const expectedMessage = createWalletAuthenticationMessage(challenge, authorized.publicKey)

    if (authorized.signInProof) {
      onStage?.('signature_extract')
      return {
        authorized,
        proof: validateSiwsProof(
          authorized.signInProof,
          expectedMessage,
          authorized.addressBase64,
        ),
      }
    }

    onStage?.('sign_messages_fallback')
    const signedPayload = await signMessage(wallet, authorized.addressBase64, expectedMessage)
    onStage?.('signature_extract')
    const signature = extractSignature(signedPayload, expectedMessage)
    return {
      authorized,
      proof: {
        method: 'sign_messages' as const,
        signedMessage: expectedMessage,
        signature,
        signatureType: 'ed25519',
      },
    }
  })

  // All Supabase calls happen only after the wallet association has returned.
  onStage?.('server_verify')
  const verified = await verifyChallenge(
    associated.authorized.publicKey,
    challenge.challengeId,
    associated.proof,
  )
  if (verified.walletAddress !== associated.authorized.publicKey) {
    throw new Error('The verified wallet does not match the authorized MWA account.')
  }

  onStage?.('server_binding')
  const binding = await confirmServerBinding(associated.authorized.publicKey)
  if (!binding || binding.walletAddress !== associated.authorized.publicKey) {
    throw new Error('The server did not bind the authorized wallet to this app session.')
  }

  onStage?.('session_persist')
  await persistAuthorization(associated.authorized.authorization)
  return {
    account: associated.authorized.account,
    binding,
    method: associated.proof.method,
  }
}
