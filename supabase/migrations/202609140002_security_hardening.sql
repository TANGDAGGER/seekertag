-- Wallet-authenticated mutation boundary for SeekerTag.
-- Deploy after 202609140001_initial_schema.sql.

create table public.wallet_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null check (char_length(wallet_address) between 32 and 44),
  nonce_hash text not null,
  challenge_message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index wallet_auth_challenges_lookup_idx
on public.wallet_auth_challenges(user_id, id)
where used_at is null;

create table public.wallet_auth_bindings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null check (char_length(wallet_address) between 32 and 44),
  challenge_id uuid not null references public.wallet_auth_challenges(id),
  verification_proof text not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.wallet_auth_challenges enable row level security;
alter table public.wallet_auth_bindings enable row level security;
alter table public.profiles drop constraint if exists profiles_wallet_address_key;
revoke all on public.wallet_auth_challenges from anon, authenticated;
revoke all on public.wallet_auth_bindings from anon, authenticated;

create or replace function public.current_verified_wallet()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.wallet_address
  from public.wallet_auth_bindings b
  where b.user_id = (select auth.uid())
    and b.expires_at > now()
$$;

revoke all on function public.current_verified_wallet() from public;
grant execute on function public.current_verified_wallet() to authenticated;

create or replace function public.current_verified_wallet_proof()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'challenge_id', b.challenge_id,
    'signature', b.verification_proof,
    'verified_at', b.verified_at
  )::text
  from public.wallet_auth_bindings b
  where b.user_id = (select auth.uid())
    and b.expires_at > now()
$$;

revoke all on function public.current_verified_wallet_proof() from public;
grant execute on function public.current_verified_wallet_proof() to authenticated;

create or replace function public.wallet_auth_status()
returns table(wallet_address text, verified_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.wallet_address, b.verified_at, b.expires_at
  from public.wallet_auth_bindings b
  where b.user_id = (select auth.uid())
    and b.expires_at > now()
$$;

revoke all on function public.wallet_auth_status() from public;
grant execute on function public.wallet_auth_status() to authenticated;

-- Wallet profiles are written only by the signature-verifying Edge Function.
drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Users create their profile" on public.profiles;
drop policy if exists "Users update their profile" on public.profiles;
revoke all on public.profiles from anon, authenticated;

-- Public item reads expose only the fields used by a tag page. Internal user IDs are omitted.
drop policy if exists "Items are publicly readable by tag" on public.items;
drop policy if exists "Owners create items" on public.items;
drop policy if exists "Owners update items" on public.items;
revoke all on public.items from anon, authenticated;

alter table public.items
  alter column finder_reward_amount type numeric(39, 18);

create or replace function public.get_public_item(target_item_id uuid)
returns table(
  id uuid,
  owner_wallet text,
  name text,
  description text,
  image_url text,
  status text,
  finder_reward_amount numeric,
  reward_transaction_signature text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.owner_wallet, i.name, i.description, i.image_url, i.status,
         i.finder_reward_amount, i.reward_transaction_signature, i.created_at, i.updated_at
  from public.items i
  where i.id = target_item_id
$$;

revoke all on function public.get_public_item(uuid) from public;
grant execute on function public.get_public_item(uuid) to anon, authenticated;

create or replace function public.list_my_items()
returns setof public.items
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
  from public.items i
  where i.owner_wallet = public.current_verified_wallet()
  order by i.created_at desc
$$;

revoke all on function public.list_my_items() from public;
grant execute on function public.list_my_items() to authenticated;

-- Proof bytes and internal IDs are not public. The client receives display-only history.
drop policy if exists "Ownership history is publicly readable" on public.ownership_events;
drop policy if exists "Current owners append ownership history" on public.ownership_events;
revoke all on public.ownership_events from anon, authenticated;

create or replace function public.get_item_ownership_history(target_item_id uuid)
returns table(id uuid, item_id uuid, action text, from_wallet text, to_wallet text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.item_id, e.action, e.from_wallet, e.to_wallet, e.created_at
  from public.ownership_events e
  where e.item_id = target_item_id
  order by e.created_at asc
$$;

revoke all on function public.get_item_ownership_history(uuid) from public;
grant execute on function public.get_item_ownership_history(uuid) to anon, authenticated;

create or replace function public.register_item(
  target_item_id uuid,
  item_name text,
  item_description text,
  item_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_wallet text := public.current_verified_wallet();
  verified_proof text := public.current_verified_wallet_proof();
begin
  if verified_wallet is null then raise exception 'A verified wallet session is required'; end if;
  if item_name is null or char_length(trim(item_name)) not between 1 and 80 then
    raise exception 'Item name must contain 1 to 80 characters';
  end if;
  if item_description is not null and char_length(item_description) > 500 then
    raise exception 'Item description is too long';
  end if;
  if verified_proof is null then raise exception 'Verified wallet proof is missing'; end if;

  insert into public.items(id, owner_user_id, owner_wallet, name, description, image_url, status)
  values (target_item_id, (select auth.uid()), verified_wallet, trim(item_name), nullif(trim(item_description), ''), item_image_url, 'protected');

  insert into public.ownership_events(item_id, action, to_wallet, proof)
  values (target_item_id, 'claimed', verified_wallet, verified_proof);
  return target_item_id;
end;
$$;

revoke all on function public.register_item(uuid, text, text, text) from public;
grant execute on function public.register_item(uuid, text, text, text) to authenticated;

create or replace function public.mark_item_lost(target_item_id uuid, reward_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare verified_wallet text := public.current_verified_wallet();
begin
  if verified_wallet is null then raise exception 'A verified wallet session is required'; end if;
  if reward_amount is null or reward_amount <= 0 or reward_amount >= 1000000000000000000000 then
    raise exception 'Invalid finder reward';
  end if;
  update public.items
  set status = 'lost', finder_reward_amount = reward_amount
  where id = target_item_id
    and owner_wallet = verified_wallet;
  if not found then raise exception 'Only the verified current owner may mark this item lost'; end if;
end;
$$;

revoke all on function public.mark_item_lost(uuid, numeric) from public;
grant execute on function public.mark_item_lost(uuid, numeric) to authenticated;

-- Reports are readable only by the verified finder or verified item owner, and are never directly writable.
drop policy if exists "Finders create their own reports" on public.finder_reports;
drop policy if exists "Finder and owner read a report" on public.finder_reports;
drop policy if exists "Item owner resolves a report" on public.finder_reports;
revoke insert, update, delete on public.finder_reports from anon, authenticated;
grant select on public.finder_reports to authenticated;

create policy "Verified finder and owner read a report"
on public.finder_reports for select to authenticated
using (
  finder_wallet = public.current_verified_wallet()
  or exists (
    select 1 from public.items i
    where i.id = finder_reports.item_id
      and i.owner_wallet = public.current_verified_wallet()
  )
);

create or replace function public.create_finder_report(
  target_report_id uuid,
  target_item_id uuid,
  finder_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare verified_wallet text := public.current_verified_wallet();
declare target_owner text;
begin
  if verified_wallet is null then raise exception 'A verified wallet session is required'; end if;
  if finder_message is not null and char_length(finder_message) > 500 then
    raise exception 'Finder message is too long';
  end if;
  select i.owner_wallet into target_owner from public.items i
  where i.id = target_item_id and i.status = 'lost';
  if target_owner is null then raise exception 'This item is not accepting finder reports'; end if;
  if target_owner = verified_wallet then raise exception 'The owner cannot report their own item'; end if;

  insert into public.finder_reports(id, item_id, finder_user_id, finder_wallet, message, status)
  values (target_report_id, target_item_id, (select auth.uid()), verified_wallet, nullif(trim(finder_message), ''), 'open');
  return target_report_id;
end;
$$;

revoke all on function public.create_finder_report(uuid, uuid, text) from public;
grant execute on function public.create_finder_report(uuid, uuid, text) to authenticated;

alter table public.finder_reports
  add column reward_state text not null default 'none'
    check (reward_state in ('none', 'submitting', 'submitted', 'confirmed')),
  add column reward_attempt_id uuid,
  add column reward_transaction_signature text,
  add column reward_started_at timestamptz;

create unique index finder_reports_reward_signature_idx
on public.finder_reports(reward_transaction_signature)
where reward_transaction_signature is not null;

create or replace function public.begin_reward(target_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare verified_wallet text := public.current_verified_wallet();
declare attempt_id uuid := gen_random_uuid();
declare current_state text;
begin
  if verified_wallet is null then raise exception 'A verified wallet session is required'; end if;
  select r.reward_state into current_state
  from public.finder_reports r
  join public.items i on i.id = r.item_id
  where r.id = target_report_id
    and i.owner_wallet = verified_wallet
  for update of r;
  if current_state is null then raise exception 'Finder report not found for the verified owner'; end if;
  if current_state <> 'none' then raise exception 'A reward is already pending or completed for this report'; end if;

  update public.finder_reports
  set reward_state = 'submitting', reward_attempt_id = attempt_id, reward_started_at = now()
  where id = target_report_id;
  return attempt_id;
end;
$$;

revoke all on function public.begin_reward(uuid) from public;
grant execute on function public.begin_reward(uuid) to authenticated;

create or replace function public.record_reward_submission(
  target_report_id uuid,
  attempt_id uuid,
  tx_signature text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare verified_wallet text := public.current_verified_wallet();
begin
  if verified_wallet is null then raise exception 'A verified wallet session is required'; end if;
  if tx_signature is null or tx_signature !~ '^[1-9A-HJ-NP-Za-km-z]{87,88}$' then
    raise exception 'Invalid transaction signature';
  end if;
  update public.finder_reports r
  set reward_state = 'submitted', reward_transaction_signature = tx_signature
  from public.items i
  where r.id = target_report_id and r.item_id = i.id
    and r.reward_attempt_id = attempt_id and r.reward_state = 'submitting'
    and i.owner_wallet = verified_wallet;
  if not found then raise exception 'Reward attempt is invalid or already recorded'; end if;
end;
$$;

revoke all on function public.record_reward_submission(uuid, uuid, text) from public;
grant execute on function public.record_reward_submission(uuid, uuid, text) to authenticated;

create or replace function public.cancel_reward_attempt(target_report_id uuid, attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare verified_wallet text := public.current_verified_wallet();
begin
  update public.finder_reports r
  set reward_state = 'none', reward_attempt_id = null, reward_started_at = null
  from public.items i
  where r.id = target_report_id and r.item_id = i.id
    and r.reward_attempt_id = attempt_id and r.reward_state = 'submitting'
    and i.owner_wallet = verified_wallet;
end;
$$;

revoke all on function public.cancel_reward_attempt(uuid, uuid) from public;
grant execute on function public.cancel_reward_attempt(uuid, uuid) to authenticated;

-- Called only by confirm-reward after it independently validates the confirmed token transfer.
create or replace function public.finalize_reward_verified(
  target_report_id uuid,
  expected_owner_wallet text,
  tx_signature text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_item_id uuid;
begin
  select r.item_id into target_item_id
  from public.finder_reports r
  join public.items i on i.id = r.item_id
  where r.id = target_report_id
    and i.owner_wallet = expected_owner_wallet
    and r.reward_state = 'submitted'
    and r.reward_transaction_signature = tx_signature
  for update of r;
  if target_item_id is null then raise exception 'Submitted reward does not match this report and owner'; end if;

  update public.finder_reports
  set status = 'rewarded', reward_state = 'confirmed', resolved_at = now()
  where id = target_report_id;
  update public.items
  set status = 'returned', reward_transaction_signature = tx_signature
  where id = target_item_id;
end;
$$;

revoke all on function public.finalize_reward_verified(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_reward_verified(uuid, text, text) to service_role;

-- Replace the original transfer function. Ownership fields are never directly writable by clients.
drop function public.transfer_item_ownership(uuid, text, text);

create or replace function public.transfer_item_ownership(target_item_id uuid, new_wallet text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_item public.items%rowtype;
declare recipient_user_id uuid;
declare verified_wallet text := public.current_verified_wallet();
declare verified_proof text := public.current_verified_wallet_proof();
begin
  if verified_wallet is null then raise exception 'A verified wallet session is required'; end if;
  select * into current_item from public.items where id = target_item_id for update;
  if current_item.id is null then raise exception 'Item not found'; end if;
  if current_item.owner_wallet <> verified_wallet then
    raise exception 'Only the verified current owner can transfer this item';
  end if;
  if new_wallet = current_item.owner_wallet then raise exception 'Recipient must be different from the current owner'; end if;
  if verified_proof is null then raise exception 'Verified wallet proof is missing'; end if;

  select p.id into recipient_user_id from public.profiles p where p.wallet_address = new_wallet order by p.created_at asc limit 1;
  if recipient_user_id is null then raise exception 'Recipient must connect to SeekerTag once before receiving an item'; end if;

  update public.items set owner_user_id = recipient_user_id, owner_wallet = new_wallet where id = target_item_id;
  insert into public.ownership_events(item_id, action, from_wallet, to_wallet, proof)
  values (target_item_id, 'transferred', current_item.owner_wallet, new_wallet, verified_proof);
end;
$$;

revoke all on function public.transfer_item_ownership(uuid, text) from public;
grant execute on function public.transfer_item_ownership(uuid, text) to authenticated;

-- The original reward function trusted a client-supplied signature and must no longer be callable.
revoke all on function public.record_skr_reward(uuid, text) from public, anon, authenticated;
