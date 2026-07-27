-- Mintea — row level security, signup bootstrap, and default category seed.
--
-- Authorization model: every table is scoped by `household_id`, and a user may
-- read/write a row only if they are a member of that household. The membership
-- lookup goes through a SECURITY DEFINER helper so that policies on
-- `household_members` don't recurse into themselves.

-- --------------------------------------------------------------- helper

create or replace function public.current_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid();
$$;

revoke all on function public.current_household_ids() from public;
grant execute on function public.current_household_ids() to authenticated;

-- --------------------------------------------------------------- enable RLS

alter table households         enable row level security;
alter table household_members  enable row level security;
alter table profiles           enable row level security;
alter table plaid_items        enable row level security;
alter table plaid_item_secrets enable row level security;
alter table accounts           enable row level security;
alter table account_balances   enable row level security;
alter table category_groups    enable row level security;
alter table categories         enable row level security;
alter table merchants          enable row level security;
alter table tags               enable row level security;
alter table transactions       enable row level security;
alter table transaction_tags   enable row level security;

-- `plaid_item_secrets` deliberately gets NO policies. RLS is on, so every
-- client JWT — anon and authenticated alike — sees zero rows and can write
-- none. Only the service role (which bypasses RLS) reaches it, and the service
-- role key exists solely as an Edge Function secret.

-- --------------------------------------------------------------- policies

create policy households_read on households
  for select to authenticated
  using (id in (select current_household_ids()));

create policy households_update on households
  for update to authenticated
  using (id in (select current_household_ids()))
  with check (id in (select current_household_ids()));

create policy household_members_read on household_members
  for select to authenticated
  using (user_id = (select auth.uid()) or household_id in (select current_household_ids()));

create policy profiles_read on profiles
  for select to authenticated
  using (id = (select auth.uid()) or household_id in (select current_household_ids()));

create policy profiles_update on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Plaid Items are created and destroyed by Edge Functions only; clients read.
create policy plaid_items_read on plaid_items
  for select to authenticated
  using (household_id in (select current_household_ids()));

-- Full read/write for the household on everything the user actually edits.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'account_balances', 'category_groups', 'categories',
    'merchants', 'tags', 'transactions', 'transaction_tags'
  ]
  loop
    execute format($f$
      create policy %1$s_rw on %1$s
        for all to authenticated
        using (household_id in (select current_household_ids()))
        with check (household_id in (select current_household_ids()));
    $f$, t);
  end loop;
end;
$$;

-- --------------------------------------------------------------- grants

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  accounts, account_balances, category_groups, categories,
  merchants, tags, transactions, transaction_tags
to authenticated;

grant select on households, household_members, profiles, plaid_items to authenticated;
grant update on households, profiles to authenticated;

-- --------------------------------------------------------------- net worth

-- Assets/liabilities/net for every day in a range. Accounts only get a
-- snapshot row on days their balance was observed, so this carries the last
-- known balance forward. SECURITY INVOKER, so RLS still applies.
create or replace function public.net_worth_series(p_start date, p_end date)
returns table (
  day              date,
  assets_cents     bigint,
  liabilities_cents bigint,
  net_cents        bigint
)
language sql
stable
as $$
  with days as (
    select generate_series(p_start, p_end, interval '1 day')::date as d
  ),
  acct as (
    select a.id, a.is_asset
    from accounts a
    where a.household_id in (select current_household_ids())
      and a.deleted_at is null
      and a.include_in_net_worth
  )
  select
    days.d,
    coalesce(sum(b.balance_cents) filter (where acct.is_asset), 0)::bigint,
    coalesce(sum(b.balance_cents) filter (where not acct.is_asset), 0)::bigint,
    coalesce(sum(b.balance_cents), 0)::bigint
  from days
  cross join acct
  left join lateral (
    select ab.balance_cents
    from account_balances ab
    where ab.account_id = acct.id
      and ab.date <= days.d
    order by ab.date desc
    limit 1
  ) b on true
  group by days.d
  order by days.d;
$$;

grant execute on function public.net_worth_series(date, date) to authenticated;

-- --------------------------------------------------------------- seed

create or replace function public.seed_default_categories(target_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  spec jsonb := $json$[
    {"name": "Income", "type": "income", "categories": [
      {"name": "Paycheck",        "icon": "💵"},
      {"name": "Bonus",           "icon": "🎉"},
      {"name": "Business Income", "icon": "💼"},
      {"name": "Interest",        "icon": "🏦"},
      {"name": "Dividends",       "icon": "📈"},
      {"name": "Other Income",    "icon": "➕"}
    ]},
    {"name": "Housing", "type": "expense", "categories": [
      {"name": "Rent",             "icon": "🏠"},
      {"name": "Mortgage",         "icon": "🏡"},
      {"name": "Home Improvement", "icon": "🔨"},
      {"name": "Home Insurance",   "icon": "🛡️"},
      {"name": "Property Tax",     "icon": "🧾"}
    ]},
    {"name": "Auto & Transport", "type": "expense", "categories": [
      {"name": "Gas",              "icon": "⛽"},
      {"name": "Auto Payment",     "icon": "🚗"},
      {"name": "Auto Insurance",   "icon": "🛡️"},
      {"name": "Auto Maintenance", "icon": "🔧"},
      {"name": "Parking",          "icon": "🅿️"},
      {"name": "Public Transit",   "icon": "🚆"},
      {"name": "Rideshare",        "icon": "🚕"}
    ]},
    {"name": "Food & Dining", "type": "expense", "categories": [
      {"name": "Groceries",       "icon": "🛒"},
      {"name": "Restaurants",     "icon": "🍽️"},
      {"name": "Coffee Shops",    "icon": "☕"},
      {"name": "Alcohol & Bars",  "icon": "🍻"}
    ]},
    {"name": "Bills & Utilities", "type": "expense", "categories": [
      {"name": "Electric",          "icon": "💡"},
      {"name": "Gas & Water",       "icon": "🚿"},
      {"name": "Internet & Cable",  "icon": "🌐"},
      {"name": "Phone",             "icon": "📱"},
      {"name": "Trash",             "icon": "🗑️"}
    ]},
    {"name": "Shopping", "type": "expense", "categories": [
      {"name": "Clothing",      "icon": "👕"},
      {"name": "Electronics",   "icon": "💻"},
      {"name": "Home & Garden", "icon": "🪴"},
      {"name": "Hobbies",       "icon": "🎨"},
      {"name": "Gifts",         "icon": "🎁"}
    ]},
    {"name": "Entertainment", "type": "expense", "categories": [
      {"name": "Streaming", "icon": "📺"},
      {"name": "Movies",    "icon": "🎬"},
      {"name": "Music",     "icon": "🎵"},
      {"name": "Events",    "icon": "🎟️"},
      {"name": "Games",     "icon": "🎮"}
    ]},
    {"name": "Health & Wellness", "type": "expense", "categories": [
      {"name": "Doctor",           "icon": "🩺"},
      {"name": "Dentist",          "icon": "🦷"},
      {"name": "Pharmacy",         "icon": "💊"},
      {"name": "Fitness",          "icon": "🏋️"},
      {"name": "Health Insurance", "icon": "🛡️"}
    ]},
    {"name": "Travel", "type": "expense", "categories": [
      {"name": "Flights",  "icon": "✈️"},
      {"name": "Hotels",   "icon": "🏨"},
      {"name": "Vacation", "icon": "🏖️"}
    ]},
    {"name": "Personal", "type": "expense", "categories": [
      {"name": "Personal Care", "icon": "💇"},
      {"name": "Education",     "icon": "🎓"},
      {"name": "Childcare",     "icon": "🧸"},
      {"name": "Pets",          "icon": "🐾"},
      {"name": "Subscriptions", "icon": "🔁"}
    ]},
    {"name": "Financial", "type": "expense", "categories": [
      {"name": "Financial Fees", "icon": "🏧"},
      {"name": "Loan Repayment", "icon": "📉"},
      {"name": "Taxes",          "icon": "🧾"},
      {"name": "Charity",        "icon": "❤️"}
    ]},
    {"name": "Transfers", "type": "transfer", "categories": [
      {"name": "Transfer",            "icon": "🔄", "system_key": "transfer"},
      {"name": "Credit Card Payment", "icon": "💳", "system_key": "credit_card_payment"},
      {"name": "Balance Adjustment",  "icon": "⚖️", "system_key": "balance_adjustment"},
      {"name": "Investments",         "icon": "📊"}
    ]},
    {"name": "Other", "type": "expense", "categories": [
      {"name": "Uncategorized", "icon": "❓", "system_key": "uncategorized"},
      {"name": "Miscellaneous", "icon": "📦"}
    ]}
  ]$json$::jsonb;
  grp    jsonb;
  cat    jsonb;
  gid    uuid;
  gorder integer := 0;
  corder integer;
begin
  for grp in select * from jsonb_array_elements(spec)
  loop
    insert into category_groups (household_id, name, type, display_order, is_system)
    values (target_household, grp ->> 'name', (grp ->> 'type')::category_type, gorder, true)
    returning id into gid;

    corder := 0;
    for cat in select * from jsonb_array_elements(grp -> 'categories')
    loop
      insert into categories (
        household_id, group_id, name, icon, display_order, system_key, is_system
      )
      values (
        target_household,
        gid,
        cat ->> 'name',
        cat ->> 'icon',
        corder,
        cat ->> 'system_key',
        (cat ->> 'system_key') is not null
      );
      corder := corder + 1;
    end loop;

    gorder := gorder + 1;
  end loop;
end;
$$;

-- --------------------------------------------------------------- bootstrap

-- Every new auth user gets a household of one, a profile, and the default
-- category tree, in the same transaction as the signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household uuid;
begin
  insert into households (name) values ('My Household') returning id into new_household;

  insert into household_members (household_id, user_id, role)
  values (new_household, new.id, 'owner');

  insert into profiles (id, household_id, display_name)
  values (
    new.id,
    new_household,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );

  perform public.seed_default_categories(new_household);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
