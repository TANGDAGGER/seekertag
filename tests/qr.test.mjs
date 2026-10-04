import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseSeekerTagQr: parse } = require('../work/test-build/lib/qr.js')

test('accepts a SeekerTag item deep link', () => {
  assert.equal(
    parse('seekertag://public-item/550e8400-e29b-41d4-a716-446655440000'),
    '550e8400-e29b-41d4-a716-446655440000',
  )
})

test('rejects arbitrary web links and transaction-like data', () => {
  assert.equal(parse('https://malicious.example/item/550e8400-e29b-41d4-a716-446655440000'), null)
  assert.equal(parse('solana:recipient?amount=100'), null)
})

test('rejects path traversal and oversized payloads', () => {
  assert.equal(parse('seekertag://public-item/../../settings'), null)
  assert.equal(parse(`seekertag://public-item/${'a'.repeat(400)}`), null)
})

test('rejects query strings, fragments, malformed encoding, and demo IDs in live mode', () => {
  assert.equal(parse('seekertag://public-item/550e8400-e29b-41d4-a716-446655440000?next=solana'), null)
  assert.equal(parse('seekertag://public-item/550e8400-e29b-41d4-a716-446655440000#send'), null)
  assert.equal(parse('seekertag://public-item/%E0%A4%A'), null)
  assert.equal(parse('seekertag://public-item/demo-airpods'), null)
  assert.equal(parse('seekertag://public-item/demo-airpods', true), 'demo-airpods')
})
