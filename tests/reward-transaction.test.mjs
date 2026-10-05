import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { AccountRole } = require('@solana/kit')
const {
  createInstructionOnlySigner,
  prepareInstructionsForMobileWallet,
  sendInstructionsWithMobileWallet,
} = require('../work/test-build/features/wallet/wallet-instructions.js')
const { canStartReward } = require('../work/test-build/lib/authorization.js')
const { getRewardErrorIdentity } = require('../work/test-build/lib/reward-diagnostics.js')
const { getRewardTransferErrorMessage } = require('../work/test-build/lib/reward-error.js')
const { executeRewardFlow, RewardFlowError } = require('../work/test-build/lib/reward-flow.js')

const owner = 'Gcf88XiFdSeYXYKGBd737fDUGKcRxPWSKXr5zdFinom3'
const programAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

function preparedInstructions() {
  const signer = createInstructionOnlySigner(owner)
  return prepareInstructionsForMobileWallet(
    [
      {
        programAddress,
        accounts: [{ address: owner, role: AccountRole.WRITABLE_SIGNER, signer }],
        data: new Uint8Array([1]),
      },
      {
        programAddress,
        accounts: [{ address: owner, role: AccountRole.READONLY_SIGNER, signer }],
        data: new Uint8Array([12]),
      },
    ],
    owner,
  )
}

test('successful instruction preparation preserves signer roles but removes custom signer objects', () => {
  const instructions = preparedInstructions()
  assert.equal(instructions.length, 2)
  for (const instruction of instructions) {
    assert.equal(instruction.accounts[0].address, owner)
    assert.equal('signer' in instruction.accounts[0], false)
  }
  assert.equal(instructions[0].accounts[0].role, AccountRole.WRITABLE_SIGNER)
  assert.equal(instructions[1].accounts[0].role, AccountRole.READONLY_SIGNER)
})

test('instruction preparation rejects any signer other than the verified owner', () => {
  assert.throws(
    () =>
      prepareInstructionsForMobileWallet(
        [
          {
            programAddress,
            accounts: [
              { address: '2b667WrongWallet111111111111111111111111111', role: AccountRole.READONLY_SIGNER },
            ],
          },
        ],
        owner,
      ),
    /unexpected transaction signer/,
  )
})

test('official mobile wallet send path is invoked exactly once with prepared instructions', async () => {
  const instructions = preparedInstructions()
  const calls = []
  const signature = await sendInstructionsWithMobileWallet(async (received) => {
    calls.push(received)
    return 'transaction-signature'
  }, instructions)

  assert.equal(signature, 'transaction-signature')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], instructions)
})

test('no signature cancels the reward attempt and reports the wallet send stage', async () => {
  let rewardState = 'none'
  let cancelCalls = 0
  await assert.rejects(
    executeRewardFlow({
      begin: async () => {
        rewardState = 'submitting'
        return 'attempt-1'
      },
      prepare: async () => preparedInstructions(),
      send: async () => {
        throw new TypeError('native wallet send failed')
      },
      record: async () => assert.fail('record must not run without a signature'),
      confirmChain: async () => assert.fail('confirmation must not run without a signature'),
      confirmServer: async () => assert.fail('server confirmation must not run without a signature'),
      cancel: async () => {
        cancelCalls += 1
        rewardState = 'none'
      },
    }),
    (error) => {
      assert.ok(error instanceof RewardFlowError)
      assert.equal(error.stage, 'reward_wallet_send')
      assert.equal(error.submittedSignature, null)
      assert.equal(error.resetFailed, false)
      const diagnostic = getRewardErrorIdentity(error.cause)
      assert.equal(diagnostic.errorClass, 'TypeError')
      assert.equal(diagnostic.errorMessage, 'native wallet send failed')
      return true
    },
  )
  assert.equal(cancelCalls, 1)
  assert.equal(rewardState, 'none')
})

test('reward diagnostics retain safe error details without exposing paths or token-like values', () => {
  const error = new TypeError('value.trim is not a function')
  error.stack =
    'TypeError: value.trim is not a function\n    at parseTokenAmount (C:\\Users\\person\\app.ts:12:3)\n    at eyJabcdefghijklmnopqrstuvwxyz0123456789.abcdefghijklmnopqrstuvwxyz0123456789.signature'
  assert.deepEqual(getRewardErrorIdentity(error), {
    errorClass: 'TypeError',
    errorMessage: 'value.trim is not a function',
    stackLocation: 'parseTokenAmount',
  })
})

test('begin-stage failures use an accurate no-submission message', () => {
  assert.equal(
    getRewardTransferErrorMessage(new TypeError('undefined is not a function'), 'reward_begin_rpc'),
    'SeekerTag could not start the reward process. No transaction was submitted.',
  )
})

test('a received signature is never cancelled or automatically sent a second time', async () => {
  let sendCalls = 0
  let cancelCalls = 0
  await assert.rejects(
    executeRewardFlow({
      begin: async () => 'attempt-1',
      prepare: async () => preparedInstructions(),
      send: async () => {
        sendCalls += 1
        return 'submitted-signature'
      },
      record: async () => {
        throw new Error('temporary database failure')
      },
      confirmChain: async () => undefined,
      confirmServer: async () => undefined,
      cancel: async () => {
        cancelCalls += 1
      },
    }),
    (error) => {
      assert.equal(error.submittedSignature, 'submitted-signature')
      assert.equal(error.stage, 'reward_record_submission')
      return true
    },
  )
  assert.equal(sendCalls, 1)
  assert.equal(cancelCalls, 0)
})

test('duplicate reward remains blocked once submitting, submitted, or confirmed', () => {
  for (const rewardState of ['submitting', 'submitted', 'confirmed']) {
    assert.equal(canStartReward({ verifiedWallet: owner, currentOwnerWallet: owner, rewardState }), false)
  }
})

test('a confirmed transaction records and finalizes exactly once', async () => {
  const calls = { send: 0, record: 0, chain: 0, server: 0, cancel: 0 }
  const stages = []
  const result = await executeRewardFlow({
    begin: async () => 'attempt-1',
    prepare: async (onStage) => {
      onStage('reward_prepare_rpc')
      onStage('reward_prepare_balance')
      onStage('reward_prepare_ata')
      onStage('reward_prepare_instruction')
      return preparedInstructions()
    },
    send: async () => {
      calls.send += 1
      return 'confirmed-signature'
    },
    record: async () => {
      calls.record += 1
    },
    confirmChain: async () => {
      calls.chain += 1
    },
    confirmServer: async () => {
      calls.server += 1
    },
    cancel: async () => {
      calls.cancel += 1
    },
    onStage: (stage) => stages.push(stage),
  })

  assert.deepEqual(result, { attemptId: 'attempt-1', signature: 'confirmed-signature' })
  assert.deepEqual(calls, { send: 1, record: 1, chain: 1, server: 1, cancel: 0 })
  assert.deepEqual(stages, [
    'reward_begin_rpc',
    'reward_begin_rpc_complete',
    'reward_prepare_local',
    'reward_prepare_rpc',
    'reward_prepare_balance',
    'reward_prepare_ata',
    'reward_prepare_instruction',
    'reward_wallet_open',
    'reward_wallet_send',
    'reward_signature_received',
    'reward_record_submission',
    'reward_chain_confirm',
    'reward_server_confirm',
    'reward_complete',
  ])
})
