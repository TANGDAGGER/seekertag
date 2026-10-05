import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseTokenAmount } = require('../work/test-build/lib/token-amount.js')

test('converts decimal rewards without floating-point arithmetic', () => {
  assert.equal(parseTokenAmount('100', 6), 100_000_000n)
  assert.equal(parseTokenAmount('1.25', 6), 1_250_000n)
})

test('accepts PostgREST numeric JSON values without calling string-only methods', () => {
  assert.equal(parseTokenAmount(100, 6), 100_000_000n)
  assert.equal(parseTokenAmount(1.25, 6), 1_250_000n)
})

test('rejects zero, negative, exponential, and excessive precision', () => {
  for (const amount of ['0', '-1', '1e3', '1.0000001']) {
    assert.throws(() => parseTokenAmount(amount, 6))
  }
})

test('rejects invalid decimals and amounts beyond the SPL Token u64 limit', () => {
  for (const decimals of [-1, 1.5, 19]) assert.throws(() => parseTokenAmount('1', decimals))
  assert.throws(() => parseTokenAmount('18446744073709551616', 0))
})
