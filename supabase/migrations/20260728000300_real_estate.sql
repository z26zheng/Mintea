-- Real estate as a first-class account type.
--
-- A property is an ordinary account (so it flows through net worth, the
-- balance history and the accounts list unchanged) with a companion
-- `property_details` row holding the address and valuation state.
--
-- The mortgage stays a separate `loan` account. Netting them into one row
-- would lose the ability to see equity, and Plaid already delivers the loan
-- side on its own.

-- ALTER TYPE ... ADD VALUE is allowed inside a transaction, but the new label
-- cannot be *used* until it commits. Nothing below references 'real_estate',
-- so this is safe in a single migration.
alter type account_type add value if not exists 'real_estate';

create table property_details (
  account_id   uuid primary key references accounts (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,

  -- Address exactly as the user typed it, plus whatever the valuation
  -- provider normalised it to. Keeping both means a failed lookup can be
  -- retried against the original input rather than a mangled rewrite.
  address_line      text not null,
  city              text,
  state             text,
  postal_code       text,
  formatted_address text,
  latitude          double precision,
  longitude         double precision,

  -- Attributes improve AVM accuracy when supplied, and RentCast fills in what
  -- it can when they're left blank.
  property_type  text,
  bedrooms       numeric(4, 1),
  bathrooms      numeric(4, 1),
  square_footage integer,

  -- What the user paid. Used to reconstruct a value curve back to the
  -- purchase date; without it the net worth chart shows a flat line and then
  -- a step on the day the property was added.
  purchase_price_cents bigint,
  purchase_date        date,

  -- Valuation state. `manual` means the user set the number themselves and
  -- automatic refreshes must not overwrite it.
  valuation_source         text not null default 'manual'
    check (valuation_source in ('manual', 'rentcast')),
  last_valuation_cents      bigint,
  last_valuation_low_cents  bigint,
  last_valuation_high_cents bigint,
  last_valued_at            timestamptz,
  -- Surfaced in the UI so a silently stale valuation is impossible.
  valuation_error           text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_details_household_idx on property_details (household_id);

create trigger property_details_updated_at
before update on property_details
for each row execute function set_updated_at();

alter table property_details enable row level security;

create policy property_details_rw on property_details
  for all to authenticated
  using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

grant select, insert, update, delete on property_details to authenticated;
