import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  OFFICIAL_SKR_MINT,
  assertGenesisHashMatchesCluster,
  parseRewardTokenEnvironment,
} = require('../work/test-build/config/configuration-validation.js')
const { canStartReward, isOwnershipMutationAuthorized } = require('../work/test-build/lib/authorization.js')
const { isValidWalletAddress } = require('../work/test-build/lib/wallet-address.js')

const owner = '7Zb1Mh8RD6zvbyAob6uBXSFVepfEcDeB2XbR6wB3F6YQ'
const stranger = '72AbVzkZ1PU5RHBtExXk2Y8jVKbWdAFuURkNs5wDK91'

test('rejects invalid wallet addresses', () => {
  assert.equal(isValidWalletAddress(owner), true)
  for (const value of ['', 'not-a-wallet', '1111', `${owner}x`])
    assert.equal(isValidWalletAddress(value), false)
})

test('production SKR cannot be configured on devnet', () => {
  assert.throws(() =>
    parseRewardTokenEnvironment({ cluster: 'devnet', mint: OFFICIAL_SKR_MINT, decimals: '6', symbol: 'SKR' }),
  )
})

test('mainnet resolves only to the fixed official SKR configuration', () => {
  assert.deepEqual(parseRewardTokenEnvironment({ cluster: 'mainnet-beta' }), {
    mint: OFFICIAL_SKR_MINT,
    decimals: 6,
    symbol: 'SKR',
    isOfficialSkr: true,
  })
  assert.throws(() =>
    parseRewardTokenEnvironment({ cluster: 'mainnet-beta', mint: owner, decimals: '6', symbol: 'SKR' }),
  )
})

test('devnet tokens cannot masquerade as SKR', () => {
  assert.throws(() =>
    parseRewardTokenEnvironment({ cluster: 'devnet', mint: owner, decimals: '6', symbol: 'SKR' }),
  )
  assert.equal(
    parseRewardTokenEnvironment({ cluster: 'devnet', mint: owner, decimals: '6', symbol: 'TEST TOKEN' })
      .symbol,
    'TEST TOKEN',
  )
})

test('RPC genesis hashes must match the configured network', () => {
  assert.doesNotThrow(() =>
    assertGenesisHashMatchesCluster('devnet', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'),
  )
  assert.throws(() => assertGenesisHashMatchesCluster('devnet', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1'))
  assert.throws(() => assertGenesisHashMatchesCluster('devnet', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'))
})

test('ownership mutations require the verified current owner', () => {
  assert.equal(
    isOwnershipMutationAuthorized({ verifiedWallet: owner, currentOwnerWallet: owner, action: 'mark-lost' }),
    true,
  )
  assert.equal(
    isOwnershipMutationAuthorized({
      verifiedWallet: stranger,
      currentOwnerWallet: owner,
      action: 'mark-lost',
    }),
    false,
  )
  assert.equal(
    isOwnershipMutationAuthorized({
      verifiedWallet: null,
      currentOwnerWallet: owner,
      action: 'transfer-ownership',
    }),
    false,
  )
})

test('a reward can start only once from the none state', () => {
  assert.equal(
    canStartReward({ verifiedWallet: owner, currentOwnerWallet: owner, rewardState: 'none' }),
    true,
  )
  for (const rewardState of ['submitting', 'submitted', 'confirmed']) {
    assert.equal(canStartReward({ verifiedWallet: owner, currentOwnerWallet: owner, rewardState }), false)
  }
})
