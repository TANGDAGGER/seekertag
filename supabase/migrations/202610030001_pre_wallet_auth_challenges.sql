-- Allow a challenge to be issued before an MWA wallet account is known.
alter table public.wallet_auth_challenges
  alter column wallet_address drop not null,
  add column if not exists domain text not null default 'seekertag.app',
  add column if not exists uri text not null default 'https://seekertag.app',
  add column if not exists statement text not null
    default 'Authenticate to SeekerTag. This does not authorize a transaction.',
  add column if not exists chain_id text not null default 'solana:devnet',
  add column if not exists issued_at timestamptz not null default now();

alter table public.wallet_auth_challenges
  drop constraint if exists wallet_auth_challenges_wallet_address_check;

alter table public.wallet_auth_challenges
  add constraint wallet_auth_challenges_wallet_address_check
  check (wallet_address is null or char_length(wallet_address) between 32 and 44),
  add constraint wallet_auth_challenges_domain_check
  check (domain = 'seekertag.app'),
  add constraint wallet_auth_challenges_uri_check
  check (uri = 'https://seekertag.app'),
  add constraint wallet_auth_challenges_chain_id_check
  check (chain_id = 'solana:devnet');

-- This service-role-only function consumes the nonce, records the proven wallet,
-- and creates its binding in one database transaction. Any later failure rolls
-- the nonce consumption back as well.
create or replace function public.complete_wallet_auth_challenge(
  target_challenge_id uuid,
  target_user_id uuid,
  target_wallet_address text,
  target_challenge_message text,
  target_verification_proof text
)
returns table(wallet_address text, verified_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.wallet_auth_challenges%rowtype;
  current_profile_wallet text;
  verified_time timestamptz := now();
  binding_expiry timestamptz := verified_time + interval '24 hours';
begin
  select c.* into challenge
  from public.wallet_auth_challenges c
  where c.id = target_challenge_id
    and c.user_id = target_user_id
  for update;

  if challenge.id is null or challenge.used_at is not null then
    raise exception 'This wallet challenge is invalid or already used.';
  end if;
  if challenge.expires_at <= verified_time then
    raise exception 'This wallet challenge expired.';
  end if;

  select p.wallet_address into current_profile_wallet
  from public.profiles p
  where p.id = target_user_id;

  if current_profile_wallet is not null and current_profile_wallet <> target_wallet_address then
    raise exception 'This app session is already bound to a different wallet. Reset the app session first.';
  end if;

  if current_profile_wallet is null then
    insert into public.profiles(id, wallet_address)
    values (target_user_id, target_wallet_address)
    on conflict (id) do update
      set wallet_address = excluded.wallet_address
      where public.profiles.wallet_address = excluded.wallet_address;
  end if;

  update public.wallet_auth_challenges
  set used_at = verified_time,
      wallet_address = target_wallet_address,
      challenge_message = target_challenge_message
  where id = challenge.id
    and used_at is null;

  if not found then
    raise exception 'This wallet challenge was already consumed.';
  end if;

  insert into public.wallet_auth_bindings(
    user_id,
    wallet_address,
    challenge_id,
    verification_proof,
    verified_at,
    expires_at
  ) values (
    target_user_id,
    target_wallet_address,
    challenge.id,
    target_verification_proof,
    verified_time,
    binding_expiry
  )
  on conflict (user_id) do update set
    wallet_address = excluded.wallet_address,
    challenge_id = excluded.challenge_id,
    verification_proof = excluded.verification_proof,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  return query select target_wallet_address, verified_time, binding_expiry;
end;
$$;

revoke all on function public.complete_wallet_auth_challenge(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.complete_wallet_auth_challenge(uuid, uuid, text, text, text)
to service_role;
