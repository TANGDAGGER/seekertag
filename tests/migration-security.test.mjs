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
const initialSchema = readFileSync(
  new URL('../supabase/migrations/202609140001_initial_schema.sql', import.meta.url),
  'utf8',
).toLowerCase()
const ownerFinderReports = readFileSync(
  new URL('../supabase/migrations/202610050001_owner_finder_reports.sql', import.meta.url),
  'utf8',
).toLowerCase()
const ownerFinderReportDetail = readFileSync(
  new URL('../supabase/migrations/202610050002_owner_finder_report_detail.sql', import.meta.url),
  'utf8',
).toLowerCase()
const itemService = readFileSync(new URL('../src/lib/item-service.ts', import.meta.url), 'utf8').toLowerCase()
const itemHooks = readFileSync(
  new URL('../src/features/items/item-hooks.ts', import.meta.url),
  'utf8',
).toLowerCase()
const itemPage = readFileSync(new URL('../app/item/[id].tsx', import.meta.url), 'utf8').toLowerCase()
const finderReportPage = readFileSync(
  new URL('../app/finder-report/[id].tsx', import.meta.url),
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

test('verified owner can list reports for their own item through an explicit authorization boundary', () => {
  assert.match(ownerFinderReports, /function public\.list_owner_finder_reports\(target_item_id uuid\)/)
  assert.match(ownerFinderReports, /verified_wallet text := public\.current_verified_wallet\(\)/)
  assert.match(ownerFinderReports, /if target_owner <> verified_wallet then/)
  assert.match(ownerFinderReports, /where r\.item_id = target_item_id/)
  assert.match(
    ownerFinderReports,
    /grant execute on function public\.list_owner_finder_reports\(uuid\) to authenticated/,
  )
  assert.match(itemService, /rpc\('list_owner_finder_reports'/)
})

test('unrelated or unverified wallets cannot list owner finder reports', () => {
  assert.match(ownerFinderReports, /if verified_wallet is null then/)
  assert.match(ownerFinderReports, /errcode = '42501'/)
  assert.match(ownerFinderReports, /only the verified current owner may list finder reports/)
  assert.match(
    ownerFinderReports,
    /revoke all on function public\.list_owner_finder_reports\(uuid\) from public, anon/,
  )
})

test('verified owner can open one listed report and receive its item id', () => {
  assert.match(ownerFinderReportDetail, /function public\.get_owner_finder_report\(target_report_id uuid\)/)
  assert.match(ownerFinderReportDetail, /join public\.items i on i\.id = r\.item_id/)
  assert.match(ownerFinderReportDetail, /if target_owner <> verified_wallet then/)
  assert.match(ownerFinderReportDetail, /r\.item_id/)
  assert.match(itemService, /rpc\('get_owner_finder_report'/)
  assert.match(itemService, /itemid: row\.item_id/)
})

test('unrelated verified wallets and anonymous users cannot open an owner report', () => {
  assert.match(ownerFinderReportDetail, /only the verified current owner may open this finder report/)
  assert.match(ownerFinderReportDetail, /errcode = '42501'/)
  assert.match(
    ownerFinderReportDetail,
    /revoke all on function public\.get_owner_finder_report\(uuid\) from public, anon/,
  )
})

test('finder retains a separate read path limited to their own report', () => {
  assert.match(migration, /finder_wallet = public\.current_verified_wallet\(\)/)
  assert.match(migration, /i\.owner_wallet = public\.current_verified_wallet\(\)/)
  assert.match(migration, /create policy "verified finder and owner read a report"/)
  assert.match(ownerFinderReportDetail, /function public\.get_my_finder_report\(target_report_id uuid\)/)
  assert.match(ownerFinderReportDetail, /r\.finder_wallet = verified_wallet/)
  assert.match(
    ownerFinderReportDetail,
    /revoke all on function public\.get_my_finder_report\(uuid\) from public, anon/,
  )
  assert.match(itemService, /rpc\('get_my_finder_report'/)
})

test('duplicate finder reports remain rejected per item and finder wallet', () => {
  assert.match(initialSchema, /constraint one_open_report_per_finder unique \(item_id, finder_wallet\)/)
  assert.match(itemService, /error\?\.code === '23505'/)
})

test('item page refetches finder reports after mount and whenever it regains focus', () => {
  assert.match(itemHooks, /refetchonmount: 'always'/)
  assert.match(itemHooks, /staletime: 0/)
  assert.match(itemPage, /usefocuseffect\(/)
  assert.match(itemPage, /refetchfinderreports\(\)/)
  assert.match(itemPage, /finderreportsauthorizationerror/)
  assert.match(itemService, /finder reports require a current verified owner session/)
})

test('finder report screen distinguishes report, authorization, item, and transport failures', () => {
  assert.match(finderReportPage, /finderreportnotfounderror/)
  assert.match(finderReportPage, /finderreportownerauthorizationerror/)
  assert.match(finderReportPage, /its item could not be loaded/)
  assert.match(finderReportPage, /network or database error/)
})
