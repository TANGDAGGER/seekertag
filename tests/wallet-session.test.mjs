import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  PHANTOM_NATIVE_SUPPORTED,
  WALLET_SESSION_SCHEMA_VERSION,
  auditStoredWalletSession,
  classifyWalletFailure,
  clearWalletSession,
  createStoredWalletSession,
  getWalletAssociationConfig,
  initialWalletSessionState,
  parseStoredWalletSession,
  reduceWalletSession,
  serializeStoredWalletSession,
} = require('../work/test-build/features/wallet/wallet-session.js')
const {
  createWalletAuthenticationMessage,
  extractDetachedMessageSignature,
  runWalletAuthenticationSession,
} = require('../work/test-build/features/wallet/wallet-auth-flow.js')

const walletA = 'Gcf88XiFdSeYXYKGBd737fDUGKcRxPWSKXr5zdFinom3'
const walletB = '72AbVzkZ1PU5RHBtExXk2Y8jVKbWdAFuURkNs5wDK91'
const walletUriA = 'https://wallet.example/mobilewalletadapter'

function verifiedBinding(walletAddress = walletA) {
  return {
    walletAddress,
    verifiedAt: '2026-10-03T00:00:00.000Z',
    expiresAt: '2026-10-04T00:00:00.000Z',
  }
}

function issuedChallenge() {
  return {
    challengeId: 'challenge-a',
    domain: 'seekertag.app',
    uri: 'https://seekertag.app',
    nonce: 'a'.repeat(64),
    issuedAt: '2026-10-03T00:00:00.000Z',
    expiresAt: '2026-10-03T00:05:00.000Z',
    statement: 'Authenticate to SeekerTag. This does not authorize a transaction.',
    chainId: 'solana:devnet',
    version: '1',
  }
}

test('MWA signed payload is reduced to a detached signature only when its message matches', () => {
  const message = new TextEncoder().encode('secure nonce challenge')
  const signature = new Uint8Array(64).fill(9)
  const signedPayload = new Uint8Array(message.length + signature.length)
  signedPayload.set(message)
  signedPayload.set(signature, message.length)

  assert.deepEqual(extractDetachedMessageSignature(signedPayload, message), signature)
  assert.deepEqual(extractDetachedMessageSignature(signature, message), signature)

  const tampered = signedPayload.slice()
  tampered[0] ^= 1
  assert.throws(
    () => extractDetachedMessageSignature(tampered, message),
    /signed a different authentication message/,
  )
})

test('challenge is fetched before the single wallet association and no network fetch occurs inside it', async () => {
  const calls = []
  const stages = []
  let associationActive = false
  let associationCount = 0
  const authorization = { walletUriBase: walletUriA }

  const result = await runWalletAuthenticationSession({
    ensureSession: async () => {
      assert.equal(associationActive, false)
      calls.push('session-preflight')
    },
    requestChallenge: async () => {
      assert.equal(associationActive, false)
      calls.push('challenge-fetch')
      return issuedChallenge()
    },
    startAssociation: async (run) => {
      associationCount += 1
      associationActive = true
      calls.push('association-start')
      try {
        return await run({ id: 'mwa-session' })
      } finally {
        associationActive = false
      }
    },
    authorize: async () => {
      assert.equal(associationActive, true)
      calls.push('authorize')
      return {
        account: { label: 'Built-in account' },
        publicKey: walletA,
        addressBase64: 'base64-account-a',
        authorization,
      }
    },
    signMessage: async (_wallet, addressBase64, message) => {
      assert.equal(associationActive, true)
      assert.equal(addressBase64, 'base64-account-a')
      assert.deepEqual(message, createWalletAuthenticationMessage(issuedChallenge(), walletA))
      calls.push('sign-messages')
      return new Uint8Array(64).fill(7)
    },
    extractSignature: (signedPayload, expectedMessage) => {
      calls.push('signature-extract')
      return extractDetachedMessageSignature(signedPayload, expectedMessage)
    },
    verifyChallenge: async (publicKey, challengeId, proof) => {
      assert.equal(associationActive, false)
      assert.equal(publicKey, walletA)
      assert.equal(challengeId, 'challenge-a')
      assert.equal(proof.signature.length, 64)
      assert.equal(proof.method, 'sign_messages')
      calls.push('challenge-verification')
      return verifiedBinding()
    },
    confirmServerBinding: async (publicKey) => {
      assert.equal(associationActive, false)
      assert.equal(publicKey, walletA)
      calls.push('server-binding')
      return verifiedBinding()
    },
    persistAuthorization: async (received) => {
      assert.equal(associationActive, false)
      assert.equal(received, authorization)
      calls.push('persist-authorization')
    },
    onStage: (stage) => stages.push(stage),
  })

  assert.equal(associationCount, 1)
  assert.equal(result.binding.walletAddress, walletA)
  assert.deepEqual(calls, [
    'session-preflight',
    'challenge-fetch',
    'association-start',
    'authorize',
    'sign-messages',
    'signature-extract',
    'challenge-verification',
    'server-binding',
    'persist-authorization',
  ])
  assert.deepEqual(stages, [
    'preflight_session',
    'challenge_request_pre_wallet',
    'association_start',
    'authorize',
    'sign_messages_fallback',
    'signature_extract',
    'server_verify',
    'server_binding',
    'session_persist',
  ])
})

test('pre-wallet challenge failure prevents wallet launch', async () => {
  let walletLaunched = false
  await assert.rejects(
    runWalletAuthenticationSession({
      ensureSession: async () => undefined,
      requestChallenge: async () => {
        throw new Error('challenge unavailable')
      },
      startAssociation: async () => {
        walletLaunched = true
      },
      authorize: async () => {
        throw new Error('unreachable')
      },
      signMessage: async () => new Uint8Array(),
      extractSignature: extractDetachedMessageSignature,
      verifyChallenge: async () => verifiedBinding(),
      confirmServerBinding: async () => verifiedBinding(),
      persistAuthorization: async () => undefined,
    }),
    /challenge unavailable/,
  )
  assert.equal(walletLaunched, false)
})

test('authorization alone never verifies or persists a wallet session', async () => {
  let persisted = false
  let state = reduceWalletSession(initialWalletSessionState, { type: 'CONNECT_STARTED' })

  await assert.rejects(
    runWalletAuthenticationSession({
      ensureSession: async () => undefined,
      requestChallenge: async () => issuedChallenge(),
      startAssociation: async (run) => await run({}),
      authorize: async () => ({
        account: {},
        publicKey: walletA,
        addressBase64: 'base64-account-a',
        authorization: {},
      }),
      onAuthorized: () => {
        state = reduceWalletSession(state, { type: 'ACCOUNT_OBSERVED', address: walletA })
      },
      signMessage: async () => {
        throw new Error('sign_messages rejected')
      },
      extractSignature: extractDetachedMessageSignature,
      verifyChallenge: async () => verifiedBinding(),
      confirmServerBinding: async () => verifiedBinding(),
      persistAuthorization: async () => {
        persisted = true
      },
    }),
    /sign_messages rejected/,
  )

  state = reduceWalletSession(state, { type: 'FAILED', failure: 'rejected' })
  assert.equal(state.currentAddress, walletA)
  assert.equal(state.verifiedAddress, null)
  assert.equal(state.status, 'error')
  assert.equal(persisted, false)
})

test('server verification and exact authorized account binding are mandatory before persistence', async () => {
  let persisted = false
  await assert.rejects(
    runWalletAuthenticationSession({
      ensureSession: async () => undefined,
      requestChallenge: async () => issuedChallenge(),
      startAssociation: async (run) => await run({}),
      authorize: async () => ({
        account: {},
        publicKey: walletA,
        addressBase64: 'base64-account-a',
        authorization: {},
      }),
      signMessage: async (_wallet, addressBase64) => {
        assert.equal(addressBase64, 'base64-account-a')
        return new Uint8Array(64)
      },
      extractSignature: extractDetachedMessageSignature,
      verifyChallenge: async () => verifiedBinding(walletB),
      confirmServerBinding: async () => verifiedBinding(walletB),
      persistAuthorization: async () => {
        persisted = true
      },
    }),
    /does not match the authorized MWA account/,
  )
  assert.equal(persisted, false)
})

test('successful server verification retains the wallet URI returned by authorization', async () => {
  let stored
  await runWalletAuthenticationSession({
    ensureSession: async () => undefined,
    requestChallenge: async () => issuedChallenge(),
    startAssociation: async (run) => await run({}),
    authorize: async () => ({
      account: {},
      publicKey: walletA,
      addressBase64: 'base64-account-a',
      authorization: { publicKey: walletA, walletUriBase: walletUriA },
    }),
    signMessage: async () => new Uint8Array(64),
    extractSignature: extractDetachedMessageSignature,
    verifyChallenge: async () => verifiedBinding(),
    confirmServerBinding: async () => verifiedBinding(),
    persistAuthorization: async (authorization) => {
      stored = createStoredWalletSession(authorization)
    },
  })
  assert.equal(stored.walletUriBase, walletUriA)
  assert.equal(stored.publicKey, walletA)
})

test('SIWS address must equal the authorized MWA account', async () => {
  const message = createWalletAuthenticationMessage(issuedChallenge(), walletA)
  await assert.rejects(
    runWalletAuthenticationSession({
      ensureSession: async () => undefined,
      requestChallenge: async () => issuedChallenge(),
      startAssociation: async (run) => await run({}),
      authorize: async (_wallet, _challenge, onStage) => {
        onStage?.('siws_sign_in')
        return {
          account: {},
          publicKey: walletA,
          addressBase64: 'authorized-account',
          authorization: {},
          signInProof: {
            method: 'siws',
            addressBase64: 'different-account',
            signedMessage: message,
            signature: new Uint8Array(64),
          },
        }
      },
      signMessage: async () => new Uint8Array(),
      extractSignature: extractDetachedMessageSignature,
      verifyChallenge: async () => verifiedBinding(),
      confirmServerBinding: async () => verifiedBinding(),
      persistAuthorization: async () => undefined,
    }),
    /SIWS address does not match/,
  )
})

test('failed SIWS server verification never persists or marks the wallet verified', async () => {
  let persisted = false
  const message = createWalletAuthenticationMessage(issuedChallenge(), walletA)
  await assert.rejects(
    runWalletAuthenticationSession({
      ensureSession: async () => undefined,
      requestChallenge: async () => issuedChallenge(),
      startAssociation: async (run) => await run({}),
      authorize: async (_wallet, _challenge, onStage) => {
        onStage?.('siws_sign_in')
        return {
          account: {},
          publicKey: walletA,
          addressBase64: 'authorized-account',
          authorization: {},
          signInProof: {
            method: 'siws',
            addressBase64: 'authorized-account',
            signedMessage: message,
            signature: new Uint8Array(64),
          },
        }
      },
      signMessage: async () => new Uint8Array(),
      extractSignature: extractDetachedMessageSignature,
      verifyChallenge: async () => {
        throw new Error('server rejected SIWS')
      },
      confirmServerBinding: async () => verifiedBinding(),
      persistAuthorization: async () => {
        persisted = true
      },
    }),
    /server rejected SIWS/,
  )
  assert.equal(persisted, false)
})

test('server nonce verification remains single-use and compare-and-set protected', () => {
  const source = readFileSync(new URL('../supabase/functions/wallet-auth/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(
    new URL('../supabase/migrations/202610030001_pre_wallet_auth_challenges.sql', import.meta.url),
    'utf8',
  )
  assert.match(source, /challenge\.used_at/)
  assert.match(source, /nonce_hash/)
  assert.match(source, /complete_wallet_auth_challenge/)
  assert.match(migration, /for update/)
  assert.match(migration, /used_at is not null/)
  assert.match(migration, /to service_role/)
})

test('pre-wallet nonce is bound to the authenticated Supabase session', () => {
  const source = readFileSync(new URL('../supabase/functions/wallet-auth/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(
    new URL('../supabase/migrations/202610030001_pre_wallet_auth_challenges.sql', import.meta.url),
    'utf8',
  )
  assert.match(source, /user_id: userData\.user\.id/)
  assert.match(source, /\.eq\('user_id', userData\.user\.id\)/)
  assert.match(source, /target_user_id: userData\.user\.id/)
  assert.match(migration, /c\.user_id = target_user_id/)
  assert.match(migration, /revoke all on function public\.complete_wallet_auth_challenge/)
})

test('generic MWA selection becomes verified only for the observed public key', () => {
  let state = reduceWalletSession(initialWalletSessionState, { type: 'CONNECT_STARTED' })
  assert.equal(state.status, 'connecting')
  assert.equal('requestedWallet' in state, false)

  state = reduceWalletSession(state, { type: 'ACCOUNT_OBSERVED', address: walletA })
  assert.equal(state.status, 'verifying')
  assert.equal(state.verifiedAddress, null)

  state = reduceWalletSession(state, { type: 'VERIFIED', address: walletB })
  assert.equal(state.status, 'verifying')
  assert.equal(state.verifiedAddress, null)

  state = reduceWalletSession(state, { type: 'VERIFIED', address: walletA })
  assert.equal(state.status, 'verified')
  assert.equal(state.verifiedAddress, walletA)
})

test('observing a changed wallet immediately clears the old authenticated identity', () => {
  let state = {
    ...initialWalletSessionState,
    currentAddress: walletA,
    verifiedAddress: walletA,
    status: 'verified',
  }
  state = reduceWalletSession(state, { type: 'ACCOUNT_OBSERVED', address: walletB })
  assert.equal(state.currentAddress, walletB)
  assert.equal(state.verifiedAddress, null)
  assert.equal(state.status, 'verifying')
})

test('disconnect clears public key and verification state', () => {
  const connected = {
    ...initialWalletSessionState,
    currentAddress: walletA,
    verifiedAddress: walletA,
    status: 'verified',
  }
  assert.deepEqual(reduceWalletSession(connected, { type: 'CLEARED' }), initialWalletSessionState)
})

test('legacy wallet metadata is discarded and requires fresh local authorization', () => {
  const legacy = JSON.stringify({
    version: 1,
    transport: 'mwa',
    publicKey: walletA,
    requestedWallet: 'solflare',
  })
  assert.equal(parseStoredWalletSession(legacy), null)
  assert.deepEqual(auditStoredWalletSession(null, [legacy]), {
    session: null,
    discardLocalAuthorization: true,
  })
})

test('persisted MWA metadata retains the exact public key and optional wallet URI', () => {
  const stored = createStoredWalletSession({
    publicKey: walletA,
    accountLabel: 'Primary account',
    walletUriBase: walletUriA,
  })
  assert.deepEqual(parseStoredWalletSession(serializeStoredWalletSession(stored)), stored)
  assert.equal(stored.version, WALLET_SESSION_SCHEMA_VERSION)
  assert.equal(stored.publicKey, walletA)
  assert.equal(stored.walletUriBase, walletUriA)
})

test('wallet URI is reused only for the public key that authorized it', () => {
  const stored = createStoredWalletSession({ publicKey: walletA, walletUriBase: walletUriA })
  assert.deepEqual(getWalletAssociationConfig(stored, walletA), { baseUri: walletUriA })
  assert.equal(getWalletAssociationConfig(stored, walletB), undefined)
})

test('missing or unsafe wallet URI falls back to generic Android MWA resolution', () => {
  const generic = createStoredWalletSession({ publicKey: walletA })
  const unsafe = createStoredWalletSession({ publicKey: walletA, walletUriBase: 'solana-wallet://fake' })
  assert.equal(getWalletAssociationConfig(generic, walletA), undefined)
  assert.equal(getWalletAssociationConfig(unsafe, walletA), undefined)
  assert.equal(getWalletAssociationConfig(null, walletA), undefined)
})

test('a returned URI may be preserved across reauthorization only for the same session public key', () => {
  const previous = createStoredWalletSession({ publicKey: walletA, walletUriBase: walletUriA })
  const sameWallet = createStoredWalletSession({ publicKey: walletA }, previous, true)
  const changedWallet = createStoredWalletSession({ publicKey: walletB }, previous, true)
  assert.equal(sameWallet.walletUriBase, walletUriA)
  assert.equal(changedWallet.walletUriBase, undefined)
})

test('session cleanup revokes server binding and clears identity even if deauthorization fails', async () => {
  const calls = []
  const cleanup = await clearWalletSession({
    revokeServerBinding: async () => calls.push('server-revoke'),
    deauthorizeWallet: async () => {
      calls.push('wallet-deauthorize')
      throw new Error('wallet app was removed')
    },
    clearAdapterAuthorization: async () => calls.push('adapter-clear'),
    clearSessionMetadata: async () => calls.push('metadata-clear'),
    signOut: async () => calls.push('sign-out-and-renew'),
  })
  assert.equal(cleanup.walletDeauthorizationFailed, true)
  assert.deepEqual(calls, [
    'server-revoke',
    'wallet-deauthorize',
    'adapter-clear',
    'metadata-clear',
    'sign-out-and-renew',
  ])
})

test('failed server revocation never skips local authorization and wallet identity cleanup', async () => {
  const calls = []
  await assert.rejects(
    clearWalletSession({
      revokeServerBinding: async () => {
        calls.push('server-revoke')
        throw new Error('offline')
      },
      deauthorizeWallet: async () => calls.push('wallet-deauthorize'),
      clearAdapterAuthorization: async () => calls.push('adapter-clear'),
      clearSessionMetadata: async () => calls.push('metadata-clear'),
      signOut: async () => calls.push('sign-out'),
    }),
  )
  assert.deepEqual(calls, [
    'server-revoke',
    'wallet-deauthorize',
    'adapter-clear',
    'metadata-clear',
    'sign-out',
  ])
})

test('Phantom remains unsupported for native SeekerTag connection', () => {
  assert.equal(PHANTOM_NATIVE_SUPPORTED, false)
})

test('authorization failures are classified without exposing raw Android errors', () => {
  assert.equal(classifyWalletFailure(new Error('User cancelled request')), 'cancelled')
  assert.equal(classifyWalletFailure(new Error('ERROR_AUTHORIZATION_FAILED')), 'rejected')
  assert.equal(classifyWalletFailure(new Error('Request timed out')), 'timed-out')
  assert.equal(classifyWalletFailure(new Error('Activity not found')), 'unavailable')
  assert.equal(classifyWalletFailure(new Error('sign_messages unsupported')), 'unsupported')
})

test('invalid persisted metadata is rejected safely', () => {
  assert.equal(parseStoredWalletSession('{"transport":"phantom"}'), null)
  assert.equal(parseStoredWalletSession('not-json'), null)
  assert.deepEqual(auditStoredWalletSession('not-json', []), {
    session: null,
    discardLocalAuthorization: true,
  })
})

test('a valid current session survives cleanup of a leftover obsolete key', () => {
  const current = serializeStoredWalletSession(createStoredWalletSession({ publicKey: walletA }))
  const audit = auditStoredWalletSession(current, ['legacy-value'])
  assert.equal(audit.session?.publicKey, walletA)
  assert.equal(audit.discardLocalAuthorization, false)
})
