-- A billable real-time Plaid Balance request may run at most once per Item per
-- cooldown window. Edge Functions claim this timestamp with a conditional
-- update before calling Plaid, which makes the throttle effective even across
-- concurrent function instances.

alter table public.plaid_items
  add column last_balance_refreshed_at timestamptz;

comment on column public.plaid_items.last_balance_refreshed_at is
  'Last successful real-time /accounts/balance/get refresh; also used as the atomic in-flight claim.';
