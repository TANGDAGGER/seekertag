-- Explicit detail reads for the verified item owner and verified finder.
-- These functions do not change or bypass the existing client-facing RLS policy;
-- each SECURITY DEFINER path performs its own wallet authorization first.

create or replace function public.get_owner_finder_report(target_report_id uuid)
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
      message = 'A verified wallet session is required to open this finder report.';
  end if;

  select i.owner_wallet into target_owner
  from public.finder_reports r
  join public.items i on i.id = r.item_id
  where r.id = target_report_id;

  if target_owner is null then
    raise exception using
      errcode = 'P0002',
      message = 'Finder report not found.';
  end if;

  if target_owner <> verified_wallet then
    raise exception using
      errcode = '42501',
      message = 'Only the verified current owner may open this finder report.';
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
  where r.id = target_report_id;
end;
$$;

revoke all on function public.get_owner_finder_report(uuid) from public, anon;
grant execute on function public.get_owner_finder_report(uuid) to authenticated;

create or replace function public.get_my_finder_report(target_report_id uuid)
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
begin
  if verified_wallet is null then
    raise exception using
      errcode = '42501',
      message = 'A verified wallet session is required to open this finder report.';
  end if;

  if not exists (
    select 1
    from public.finder_reports r
    where r.id = target_report_id
      and r.finder_wallet = verified_wallet
  ) then
    raise exception using
      errcode = '42501',
      message = 'This finder report is not available to the verified finder.';
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
  where r.id = target_report_id
    and r.finder_wallet = verified_wallet;
end;
$$;

revoke all on function public.get_my_finder_report(uuid) from public, anon;
grant execute on function public.get_my_finder_report(uuid) to authenticated;
