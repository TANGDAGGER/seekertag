export type ItemRow = {
  id: string
  owner_user_id: string
  owner_wallet: string
  name: string
  description: string | null
  image_url: string | null
  status: 'protected' | 'lost' | 'returned'
  finder_reward_amount: string | null
  reward_transaction_signature: string | null
  created_at: string
  updated_at: string
}

export type OwnershipEventRow = {
  id: string
  item_id: string
  action: 'claimed' | 'transferred'
  from_wallet: string | null
  to_wallet: string
  proof: string | null
  transaction_signature: string | null
  created_at: string
}

export type FinderReportRow = {
  id: string
  item_id: string
  finder_user_id: string
  finder_wallet: string
  message: string | null
  status: 'open' | 'returned' | 'rewarded'
  created_at: string
  resolved_at: string | null
  reward_state: 'none' | 'submitting' | 'submitted' | 'confirmed'
  reward_attempt_id: string | null
  reward_transaction_signature: string | null
}
