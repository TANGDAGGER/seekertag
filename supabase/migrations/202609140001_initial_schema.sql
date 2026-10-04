-- SeekerTag MVP schema. Run with `supabase db push` or paste into the Supabase SQL editor.
-- The mobile client uses the public/anon key plus an anonymous Auth session. Never ship a service-role key.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique check (char_length(wallet_address) between 32 and 44),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wallet_address)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id),
  owner_wallet text not null check (char_length(owner_wallet) between 32 and 44),
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  image_url text,
  status text not null default 'protected' check (status in ('protected', 'lost', 'returned')),
  finder_reward_amount numeric(30, 9) check (finder_reward_amount is null or finder_reward_amount > 0),
  reward_transaction_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_owner_matches_profile foreign key (owner_user_id, owner_wallet)
    references public.profiles(id, wallet_address)
);

create table public.ownership_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  action text not null check (action in ('claimed', 'transferred')),
  from_wallet text,
  to_wallet text not null,
  proof text,
  transaction_signature text,
  created_at timestamptz not null default now()
);

create table public.finder_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  finder_user_id uuid not null references public.profiles(id),
  finder_wallet text not null,
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'open' check (status in ('open', 'returned', 'rewarded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint finder_wallet_matches_profile foreign key (finder_user_id, finder_wallet)
    references public.profiles(id, wallet_address),
  constraint one_open_report_per_finder unique (item_id, finder_wallet)
);

create index items_owner_wallet_idx on public.items(owner_wallet);
create index ownership_events_item_created_idx on public.ownership_events(item_id, created_at);
create index finder_reports_item_created_idx on public.finder_reports(item_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger items_set_updated_at before update on public.items
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.ownership_events enable row level security;
alter table public.finder_reports enable row level security;

create policy "Profiles are publicly readable"
on public.profiles for select
using (true);

create policy "Users create their profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "Users update their profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Items are publicly readable by tag"
on public.items for select
using (true);

create policy "Owners create items"
on public.items for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "Owners update items"
on public.items for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Ownership history is publicly readable"
on public.ownership_events for select
using (true);

create policy "Current owners append ownership history"
on public.ownership_events for insert to authenticated
with check (
  exists (
    select 1 from public.items
    where items.id = ownership_events.item_id
      and items.owner_user_id = (select auth.uid())
  )
);

create policy "Finders create their own reports"
on public.finder_reports for insert to authenticated
with check (
  (select auth.uid()) = finder_user_id
  and exists (
    select 1 from public.items
    where items.id = finder_reports.item_id
      and items.status = 'lost'
      and items.owner_user_id <> (select auth.uid())
  )
);

create policy "Finder and owner read a report"
on public.finder_reports for select to authenticated
using (
  finder_user_id = (select auth.uid())
  or exists (
    select 1 from public.items
    where items.id = finder_reports.item_id
      and items.owner_user_id = (select auth.uid())
  )
);

create policy "Item owner resolves a report"
on public.finder_reports for update to authenticated
using (
  exists (
    select 1 from public.items
    where items.id = finder_reports.item_id
      and items.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.items
    where items.id = finder_reports.item_id
      and items.owner_user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Item photos are publicly readable"
on storage.objects for select
using (bucket_id = 'item-photos');

create policy "Users upload to their own item photo folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'item-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.record_skr_reward(report_id uuid, tx_signature text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_item_id uuid;
begin
  if tx_signature is null or char_length(tx_signature) < 32 then
    raise exception 'Invalid transaction signature';
  end if;

  select item_id into target_item_id
  from public.finder_reports
  where id = report_id;

  if target_item_id is null then
    raise exception 'Finder report not found';
  end if;

  update public.finder_reports
  set status = 'rewarded', resolved_at = now()
  where id = report_id;

  update public.items
  set status = 'returned', reward_transaction_signature = tx_signature
  where id = target_item_id;

  if not found then
    raise exception 'Item could not be updated';
  end if;
end;
$$;

create or replace function public.transfer_item_ownership(
  target_item_id uuid,
  new_wallet text,
  signed_proof text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.items%rowtype;
  recipient_user_id uuid;
begin
  select * into current_item
  from public.items
  where id = target_item_id
  for update;

  if current_item.id is null then
    raise exception 'Item not found';
  end if;
  if current_item.owner_user_id <> (select auth.uid()) then
    raise exception 'Only the current owner can transfer this item';
  end if;
  if new_wallet = current_item.owner_wallet then
    raise exception 'Recipient must be different from the current owner';
  end if;
  if signed_proof is null or char_length(signed_proof) < 32 then
    raise exception 'A wallet-signed transfer proof is required';
  end if;

  select id into recipient_user_id
  from public.profiles
  where wallet_address = new_wallet;

  if recipient_user_id is null then
    raise exception 'Recipient must connect to SeekerTag once before receiving an item';
  end if;

  update public.items
  set owner_user_id = recipient_user_id, owner_wallet = new_wallet
  where id = target_item_id;

  insert into public.ownership_events (item_id, action, from_wallet, to_wallet, proof)
  values (target_item_id, 'transferred', current_item.owner_wallet, new_wallet, signed_proof);
end;
$$;

revoke all on function public.transfer_item_ownership(uuid, text, text) from public;
grant execute on function public.transfer_item_ownership(uuid, text, text) to authenticated;
