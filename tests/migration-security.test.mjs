import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/202609140002_security_hardening.sql', import.meta.url),
  'utf8',
).toLowerCase()
const serviceRoleGrants = readFileSync(
  new URL('../supabase/migrations/202609160001_edge_function_service_role_grants.sql', import.meta.url),
  'utf8',
).toLowerCase()

test('hardening migration revokes direct sensitive table writes', () => {
  for (const table of ['profiles', 'items', 'ownership_events']) {
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`))
  }
  assert.match(migration, /revoke insert, update, delete on public\.finder_reports from anon, authenticated/)
})

test('hardening migration makes ownership and reward transitions function-only', () => {
  for (const fn of [
    'register_item',
    'mark_item_lost',
    'create_finder_report',
    'begin_reward',
    'record_reward_submission',
    'finalize_reward_verified',
    'transfer_item_ownership',
  ]) {
    assert.match(migration, new RegExp(`function public\\.${fn}\\(`))
  }
  assert.match(
    migration,
    /grant execute on function public\.finalize_reward_verified\([^;]+\) to service_role/,
  )
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.finalize_reward_verified\([^;]+\) to authenticated/,
  )
})

test('edge functions receive explicit backend grants without restoring client writes', () => {
  assert.match(serviceRoleGrants, /on table public\.wallet_auth_challenges\s+to service_role/)
  assert.match(serviceRoleGrants, /on table public\.wallet_auth_bindings\s+to service_role/)
  assert.match(serviceRoleGrants, /on table public\.profiles\s+to service_role/)
  assert.match(serviceRoleGrants, /on table public\.items, public\.finder_reports\s+to service_role/)
  assert.doesNotMatch(serviceRoleGrants, /to (anon|authenticated)/)
})
