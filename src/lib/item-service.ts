import type { ImagePickerAsset } from 'expo-image-picker'
import { supabase } from '@/config/supabase'
import { ensureAppSession } from '@/lib/auth-session'
import { createId } from '@/lib/id'
import { mapItem } from '@/lib/item-mapper'
import type { Item } from '@/types/item'
import type { FinderReportRow, ItemRow, OwnershipEventRow } from '@/types/database'
import type { FinderReport } from '@/types/finder-report'

export class MissingSupabaseConfigError extends Error {
  constructor() {
    super('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env to enable live item data.')
  }
}

export class FinderReportsAuthorizationError extends Error {
  constructor() {
    super(
      'Finder reports require a current verified owner session. Reconnect and verify the owner wallet, then retry.',
    )
    this.name = 'FinderReportsAuthorizationError'
  }
}

export class FinderReportOwnerAuthorizationError extends Error {
  constructor() {
    super(
      'The verified owner session expired or does not match this item. Reconnect and verify the owner wallet, then retry.',
    )
    this.name = 'FinderReportOwnerAuthorizationError'
  }
}

export class FinderReportNotFoundError extends Error {
  constructor() {
    super('This finder report no longer exists.')
    this.name = 'FinderReportNotFoundError'
  }
}

function getClient() {
  if (!supabase) throw new MissingSupabaseConfigError()
  return supabase
}

export async function listItems(_ownerWallet: string): Promise<Item[]> {
  const client = getClient()
  await ensureAppSession()
  const { data, error } = await client.rpc('list_my_items')

  if (error) throw error
  return ((data ?? []) as ItemRow[]).map((row) => mapItem(row))
}

export async function getItem(id: string): Promise<Item | null> {
  const client = getClient()
  await ensureAppSession()
  const [{ data: itemData, error: itemError }, { data: historyData, error: historyError }] =
    await Promise.all([
      client.rpc('get_public_item', { target_item_id: id }),
      client.rpc('get_item_ownership_history', { target_item_id: id }),
    ])

  if (itemError) throw itemError
  if (historyError) throw historyError
  const itemRow = (Array.isArray(itemData) ? itemData[0] : itemData) as ItemRow | undefined
  if (!itemRow) return null
  return mapItem(itemRow, (historyData ?? []) as OwnershipEventRow[])
}

type CreateItemInput = {
  itemId: string
  ownerWallet: string
  name: string
  description?: string
  image?: ImagePickerAsset
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const client = getClient()
  const session = await ensureAppSession()
  const id = input.itemId

  const imageUrl = input.image ? await uploadItemImage(input.image, session.user.id, id) : null
  const { error } = await client.rpc('register_item', {
    target_item_id: id,
    item_name: input.name,
    item_description: input.description ?? '',
    item_image_url: imageUrl,
  })
  if (error) throw error
  const item = await getItem(id)
  if (!item) throw new Error('The item was registered but could not be reloaded.')
  return item
}

export async function markItemLost(itemId: string, rewardAmount: string): Promise<Item> {
  const client = getClient()
  await ensureAppSession()
  const { error } = await client.rpc('mark_item_lost', {
    target_item_id: itemId,
    reward_amount: rewardAmount,
  })
  if (error) throw error
  const updated = await getItem(itemId)
  if (!updated) throw new Error('Lost Mode was activated, but the item could not be reloaded.')
  return updated
}

function mapFinderReport(row: FinderReportRow): FinderReport {
  return {
    id: row.id,
    itemId: row.item_id,
    finderWallet: row.finder_wallet,
    message: row.message ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    rewardState: row.reward_state,
    rewardAttemptId: row.reward_attempt_id ?? undefined,
    rewardTransactionSignature: row.reward_transaction_signature ?? undefined,
  }
}

export async function createFinderReport(input: {
  itemId: string
  finderWallet: string
  message?: string
}): Promise<FinderReport> {
  const client = getClient()
  await ensureAppSession()
  const reportId = createId()
  const { error } = await client.rpc('create_finder_report', {
    target_report_id: reportId,
    target_item_id: input.itemId,
    finder_message: input.message ?? '',
  })
  if (error?.code === '23505') throw new Error('You already reported this item as found.')
  if (error) throw error
  const report = await getFinderReportForFinder(reportId)
  if (!report) throw new Error('The finder report was created but could not be reloaded.')
  return report
}

export async function listFinderReports(itemId: string): Promise<FinderReport[]> {
  const client = getClient()
  await ensureAppSession()
  const { data, error } = await client.rpc('list_owner_finder_reports', { target_item_id: itemId })
  if (
    error?.code === '42501' ||
    /verified wallet session|required to list finder reports|verified current owner/i.test(
      error?.message ?? '',
    )
  ) {
    throw new FinderReportsAuthorizationError()
  }
  if (error) throw error
  return ((data ?? []) as FinderReportRow[]).map(mapFinderReport)
}

export async function getOwnerFinderReport(reportId: string): Promise<FinderReport> {
  const client = getClient()
  await ensureAppSession()
  const { data, error } = await client.rpc('get_owner_finder_report', { target_report_id: reportId })
  if (error?.code === 'P0002' || /finder report not found/i.test(error?.message ?? '')) {
    throw new FinderReportNotFoundError()
  }
  if (
    error?.code === '42501' ||
    /verified wallet session|verified current owner/i.test(error?.message ?? '')
  ) {
    throw new FinderReportOwnerAuthorizationError()
  }
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as FinderReportRow | undefined
  if (!row) throw new FinderReportNotFoundError()
  return mapFinderReport(row)
}

async function getFinderReportForFinder(reportId: string): Promise<FinderReport> {
  const client = getClient()
  await ensureAppSession()
  const { data, error } = await client.rpc('get_my_finder_report', { target_report_id: reportId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as FinderReportRow | undefined
  if (!row) throw new Error('The finder report is not available to this verified finder.')
  return mapFinderReport(row)
}

export async function beginReward(reportId: string): Promise<string> {
  const client = getClient()
  await ensureAppSession()
  const { data, error } = await client.rpc('begin_reward', { target_report_id: reportId })
  if (error) throw error
  if (!data) throw new Error('Supabase did not create a reward attempt.')
  return String(data)
}

export async function recordRewardSubmission(
  reportId: string,
  attemptId: string,
  transactionSignature: string,
): Promise<void> {
  const client = getClient()
  await ensureAppSession()
  const { error } = await client.rpc('record_reward_submission', {
    target_report_id: reportId,
    attempt_id: attemptId,
    tx_signature: transactionSignature,
  })
  if (error) throw error
}

export async function cancelRewardAttempt(reportId: string, attemptId: string): Promise<void> {
  const client = getClient()
  await ensureAppSession()
  const { error } = await client.rpc('cancel_reward_attempt', {
    target_report_id: reportId,
    attempt_id: attemptId,
  })
  if (error) throw error
}

export async function confirmAndFinalizeReward(
  reportId: string,
  transactionSignature: string,
): Promise<void> {
  const client = getClient()
  await ensureAppSession()
  const { data, error } = await client.functions.invoke('confirm-reward', {
    body: { reportId, signature: transactionSignature },
  })
  if (error) throw new Error(error.message || 'Server-side reward confirmation failed.')
  if (!data?.confirmed) throw new Error(data?.error || 'Server-side reward confirmation failed.')
}

export async function transferItemOwnership(input: {
  itemId: string
  recipientWallet: string
}): Promise<Item> {
  const client = getClient()
  await ensureAppSession()
  const { error } = await client.rpc('transfer_item_ownership', {
    target_item_id: input.itemId,
    new_wallet: input.recipientWallet,
  })
  if (error) throw error
  const updated = await getItem(input.itemId)
  if (!updated) throw new Error('The transfer completed, but the updated item could not be loaded.')
  return updated
}

async function uploadItemImage(asset: ImagePickerAsset, userId: string, itemId: string): Promise<string> {
  const client = getClient()
  const response = await fetch(asset.uri)
  if (!response.ok) throw new Error('The selected photo could not be read.')

  const extension = asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${itemId}.${extension}`
  const { error } = await client.storage.from('item-photos').upload(path, await response.arrayBuffer(), {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return client.storage.from('item-photos').getPublicUrl(path).data.publicUrl
}
