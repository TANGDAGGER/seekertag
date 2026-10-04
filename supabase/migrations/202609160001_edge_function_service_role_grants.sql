-- Explicit backend privileges required by the wallet-auth and confirm-reward Edge Functions.
-- Client roles remain revoked and all user-facing mutations still cross the verified-wallet RPC boundary.

grant select, insert, update, delete
on table public.wallet_auth_challenges
to service_role;

grant select, insert, update, delete
on table public.wallet_auth_bindings
to service_role;

grant select, insert
on table public.profiles
to service_role;

grant select
on table public.items, public.finder_reports
to service_role;

