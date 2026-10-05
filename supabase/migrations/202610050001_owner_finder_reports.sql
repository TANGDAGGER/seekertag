-- Load finder reports through an explicit, wallet-authorized owner boundary.
-- Direct table RLS remains in place for the finder/owner single-report path.

create or replace function public.list_owner_finder_reports(target_item_id uuid)
returns table(
  id uuid,
  item_id uuid,
  finder_wallet text,
  message text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  reward_state text,
  reward_attempt_id uuid,
  reward_transaction_signature text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  verified_wallet text := public.current_verified_wallet();
  target_owner text;
begin
  if verified_wallet is null then
    raise exception using
      errcode = '42501',
      message = 'A verified wallet session is required to list finder reports.';
  end if;

  select i.owner_wallet into target_owner
  from public.items i
  where i.id = target_item_id;

  if target_owner is null then
    raise exception 'Item not found.';
  end if;

  if target_owner <> verified_wallet then
    raise exception using
      errcode = '42501',
      message = 'Only the verified current owner may list finder reports for this item.';
  end if;

  return query
  select
    r.id,
    r.item_id,
    r.finder_wallet,
    r.message,
    r.status,
    r.created_at,
    r.resolved_at,
    r.reward_state,
    r.reward_attempt_id,
    r.reward_transaction_signature
  from public.finder_reports r
  where r.item_id = target_item_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.list_owner_finder_reports(uuid) from public, anon;
grant execute on function public.list_owner_finder_reports(uuid) to authenticated;
