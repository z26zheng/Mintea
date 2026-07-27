-- Mintea — Phase 1 schema
--
-- Conventions used throughout:
--
--   * Money is stored as integer minor units in `*_cents bigint`. No floats
--     anywhere. Exact arithmetic in both SQL and JS up to ~±$90 trillion.
--
--   * Transaction amounts are signed from the account's point of view:
--     NEGATIVE = money left the account (expense), POSITIVE = money arrived
--     (income). Plaid uses the opposite sign, so it is flipped once at ingest
--     and never again.
--
--   * Account balances are stored as their SIGNED CONTRIBUTION TO NET WORTH.
--     A checking account with $1,000 stores 100000; a credit card with $500
--     owed stores -50000. Net worth is therefore a plain SUM. The UI uses
--     `is_asset` plus abs() to render "$500 owed" instead of "-$500".
--
--   * Every row carries `household_id`. A household of one is created at
--     signup, which makes partner/shared access a later feature rather than a
--     migration that rewrites every RLS policy.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- households

create table households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'My Household',
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'member', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on household_members (user_id);

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  display_name text,
  currency     char(3) not null default 'USD',
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- --------------------------------------------------------------------- plaid

create type plaid_item_status as enum (
  'good', 'login_required', 'pending_expiration', 'error', 'revoked'
);

create table plaid_items (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references households (id) on delete cascade,
  plaid_item_id        text not null unique,
  plaid_institution_id text,
  institution_name     text,
  institution_logo     text,
  status               plaid_item_status not null default 'good',
  error_code           text,
  error_message        text,
  transactions_cursor  text,
  last_synced_at       timestamptz,
  consent_expires_at   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index plaid_items_household_idx on plaid_items (household_id);

-- Plaid access tokens. RLS is enabled on this table and NO policies are ever
-- created for it, so no client JWT can read a row. Only the service role, used
-- exclusively inside Edge Functions, can touch it.
create table plaid_item_secrets (
  item_id      uuid primary key references plaid_items (id) on delete cascade,
  access_token text not null,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ accounts

create type account_type as enum (
  'depository', 'credit', 'loan', 'investment', 'other'
);

create table accounts (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references households (id) on delete cascade,
  -- SET NULL, not CASCADE: disconnecting an institution must not delete the
  -- accounts (and by extension every transaction ever imported from them).
  -- `plaid-remove` soft-deletes the accounts and drops the Item; the history
  -- survives as an orphaned-but-intact record.
  plaid_item_id           uuid references plaid_items (id) on delete set null,
  plaid_account_id        text,
  name                    text not null,
  official_name           text,
  mask                    text,
  type                    account_type not null default 'other',
  subtype                 text,
  currency                char(3) not null default 'USD',
  -- Signed contribution to net worth; see header note.
  current_balance_cents   bigint not null default 0,
  available_balance_cents bigint,
  limit_cents             bigint,
  -- Assets count positive toward net worth, liabilities negative. Derived from
  -- `type` on Plaid import, but user-settable for manual accounts (a house is
  -- an asset, a mortgage is not).
  is_asset                boolean not null default true,
  is_manual               boolean not null default false,
  is_hidden               boolean not null default false,
  include_in_net_worth    boolean not null default true,
  display_order           integer not null default 0,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (plaid_item_id, plaid_account_id)
);

create index accounts_household_idx on accounts (household_id) where deleted_at is null;

-- Daily balance snapshots. One row per account per day; the net worth chart
-- reads straight off this table.
create table account_balances (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households (id) on delete cascade,
  account_id    uuid not null references accounts (id) on delete cascade,
  date          date not null,
  balance_cents bigint not null,
  created_at    timestamptz not null default now(),
  unique (account_id, date)
);

create index account_balances_household_date_idx on account_balances (household_id, date);

-- ---------------------------------------------------------------- categories

create type category_type as enum ('income', 'expense', 'transfer');

create table category_groups (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households (id) on delete cascade,
  name          text not null,
  type          category_type not null default 'expense',
  display_order integer not null default 0,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index category_groups_household_idx on category_groups (household_id);

create table categories (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households (id) on delete cascade,
  group_id            uuid not null references category_groups (id) on delete cascade,
  name                text not null,
  icon                text not null default '💸',
  color               text,
  display_order       integer not null default 0,
  -- System categories cannot be deleted. `system_key` gives the app a stable
  -- handle on the ones it depends on ('uncategorized', 'transfer', …) instead
  -- of matching on a user-renameable name.
  is_system           boolean not null default false,
  system_key          text,
  exclude_from_budget boolean not null default false,
  rollover_enabled    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (household_id, system_key)
);

create index categories_household_idx on categories (household_id);
create index categories_group_idx on categories (group_id);

-- ----------------------------------------------------------------- merchants

create table merchants (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households (id) on delete cascade,
  name                text not null,
  logo_url            text,
  default_category_id uuid references categories (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (household_id, name)
);

-- ---------------------------------------------------------------------- tags

create table tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name         text not null,
  color        text not null default '#74808E',
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

-- -------------------------------------------------------------- transactions

create table transactions (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references households (id) on delete cascade,
  account_id           uuid not null references accounts (id) on delete cascade,
  plaid_transaction_id text unique,
  date                 date not null,
  authorized_date      date,
  -- Negative = money out of the account. See header note.
  amount_cents         bigint not null,
  currency             char(3) not null default 'USD',
  merchant_id          uuid references merchants (id) on delete set null,
  -- `description` is user-editable and drives the UI; `original_description`
  -- preserves whatever the bank actually sent, for rules and for "reset".
  description          text not null,
  original_description text,
  category_id          uuid references categories (id) on delete set null,
  notes                text,
  is_pending           boolean not null default false,
  is_hidden            boolean not null default false,
  needs_review         boolean not null default true,
  -- Splits: children point at their parent. A parent with children is excluded
  -- from totals (its children carry the real categorisation).
  parent_id            uuid references transactions (id) on delete cascade,
  has_splits           boolean not null default false,
  -- Transfer matching: two transactions in different accounts that are the same
  -- movement of money. Both rows point at each other.
  transfer_pair_id     uuid references transactions (id) on delete set null,
  plaid_category       jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index transactions_household_date_idx on transactions (household_id, date desc, id desc);
create index transactions_account_date_idx on transactions (account_id, date desc);
create index transactions_category_idx on transactions (category_id);
create index transactions_merchant_idx on transactions (merchant_id);
create index transactions_parent_idx on transactions (parent_id) where parent_id is not null;
create index transactions_review_idx on transactions (household_id, date desc) where needs_review;
create index transactions_description_trgm_idx on transactions using gin (description gin_trgm_ops);

create table transaction_tags (
  household_id   uuid not null references households (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  tag_id         uuid not null references tags (id) on delete cascade,
  primary key (transaction_id, tag_id)
);

create index transaction_tags_tag_idx on transaction_tags (tag_id);

-- ------------------------------------------------------------------ triggers

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at     before update on profiles     for each row execute function set_updated_at();
create trigger plaid_items_updated_at  before update on plaid_items  for each row execute function set_updated_at();
create trigger accounts_updated_at     before update on accounts     for each row execute function set_updated_at();
create trigger categories_updated_at   before update on categories   for each row execute function set_updated_at();
create trigger transactions_updated_at before update on transactions for each row execute function set_updated_at();

-- Keep `has_splits` accurate without the app having to remember to do it.
create or replace function sync_parent_has_splits()
returns trigger
language plpgsql
as $$
declare
  new_parent uuid;
  old_parent uuid;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT, so each is
  -- only read for the operations where it actually exists.
  if tg_op in ('INSERT', 'UPDATE') then
    new_parent := new.parent_id;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    old_parent := old.parent_id;
  end if;

  if new_parent is not null then
    update transactions t
       set has_splits = exists (select 1 from transactions c where c.parent_id = new_parent)
     where t.id = new_parent;
  end if;

  -- An UPDATE can move a child between parents; the old parent needs fixing too.
  if old_parent is not null and old_parent is distinct from new_parent then
    update transactions t
       set has_splits = exists (select 1 from transactions c where c.parent_id = old_parent)
     where t.id = old_parent;
  end if;

  return null;
end;
$$;

-- Note: the UPDATE above touches only `has_splits`, and this trigger is scoped
-- to `UPDATE OF parent_id`, so it cannot re-enter itself.

create trigger transactions_sync_splits
after insert or update of parent_id or delete on transactions
for each row execute function sync_parent_has_splits();
