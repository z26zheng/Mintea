-- Mintea — deterministic transaction cleanup rules.
--
-- The first rule type is intentionally narrow: an exact bank description,
-- normalized only for case and whitespace. A user previews every historical
-- match before applying a rule, and future Plaid imports use the same
-- normalization. Similar-looking descriptions never match implicitly.

alter table public.transactions
  add column merchant_overridden boolean not null default false;

create or replace function public.normalize_transaction_match(value text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

revoke all on function public.normalize_transaction_match(text) from public;
grant execute on function public.normalize_transaction_match(text) to authenticated;

create table public.transaction_rules (
  id                               uuid primary key default gen_random_uuid(),
  household_id                     uuid not null references public.households (id) on delete cascade,
  name                             text not null,
  match_description                text not null,
  match_description_normalized     text not null,
  merchant_id                      uuid references public.merchants (id) on delete cascade,
  category_id                      uuid references public.categories (id) on delete cascade,
  enabled                          boolean not null default true,
  historical_application_count     bigint not null default 0,
  last_applied_at                  timestamptz,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  constraint transaction_rules_has_action
    check (merchant_id is not null or category_id is not null),
  constraint transaction_rules_match_not_blank
    check (match_description_normalized <> ''),
  unique (household_id, match_description_normalized)
);

create index transaction_rules_household_enabled_idx
  on public.transaction_rules (household_id, enabled, created_at desc);

create or replace function public.set_transaction_rule_match()
returns trigger
language plpgsql
as $$
begin
  new.match_description := trim(new.match_description);
  new.match_description_normalized :=
    public.normalize_transaction_match(new.match_description);

  if new.match_description_normalized = '' then
    raise exception 'A bank description is required';
  end if;

  return new;
end;
$$;

create or replace function public.validate_transaction_rule_scope()
returns trigger
language plpgsql
as $$
begin
  if new.merchant_id is not null and not exists (
    select 1
    from public.merchants merchant
    where merchant.id = new.merchant_id
      and merchant.household_id = new.household_id
  ) then
    raise exception 'Merchant does not belong to this household';
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.categories category
    where category.id = new.category_id
      and category.household_id = new.household_id
  ) then
    raise exception 'Category does not belong to this household';
  end if;

  return new;
end;
$$;

create trigger transaction_rules_normalize_match
before insert or update of match_description, match_description_normalized
on public.transaction_rules
for each row execute function public.set_transaction_rule_match();

create trigger transaction_rules_validate_scope
before insert or update of household_id, merchant_id, category_id
on public.transaction_rules
for each row execute function public.validate_transaction_rule_scope();

create trigger transaction_rules_updated_at
before update on public.transaction_rules
for each row execute function public.set_updated_at();

alter table public.transaction_rules enable row level security;

create policy transaction_rules_rw on public.transaction_rules
  for all to authenticated
  using (household_id in (select public.current_household_ids()))
  with check (household_id in (select public.current_household_ids()));

grant select, insert, update, delete on public.transaction_rules to authenticated;

create or replace function public.transaction_rule_preview(
  p_transaction_id uuid
)
returns table (
  match_description text,
  matched_transaction_count bigint,
  existing_rule_id uuid,
  existing_rule_enabled boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  source_transaction public.transactions%rowtype;
  normalized_match text;
begin
  select transaction_row.*
  into source_transaction
  from public.transactions transaction_row
  where transaction_row.id = p_transaction_id
    and transaction_row.deleted_at is null
    and transaction_row.parent_id is null
    and transaction_row.household_id in (
      select public.current_household_ids()
    );

  if not found then
    raise exception 'Transaction not found';
  end if;

  match_description :=
    coalesce(
      nullif(trim(source_transaction.original_description), ''),
      source_transaction.description
    );
  normalized_match := public.normalize_transaction_match(match_description);

  if normalized_match = '' then
    raise exception 'This transaction has no description to match';
  end if;

  select
    count(*)::bigint,
    rule.id,
    rule.enabled
  into
    matched_transaction_count,
    existing_rule_id,
    existing_rule_enabled
  from public.transactions candidate
  left join public.transaction_rules rule
    on rule.household_id = source_transaction.household_id
   and rule.match_description_normalized = normalized_match
  where candidate.household_id = source_transaction.household_id
    and candidate.deleted_at is null
    and candidate.parent_id is null
    and public.normalize_transaction_match(
      coalesce(
        nullif(trim(candidate.original_description), ''),
        candidate.description
      )
    ) = normalized_match
  group by rule.id, rule.enabled;

  return next;
end;
$$;

create or replace function public.save_transaction_rule(
  p_transaction_id uuid,
  p_merchant_id uuid,
  p_category_id uuid,
  p_apply_to_existing boolean default true
)
returns table (
  rule_id uuid,
  matched_transaction_count bigint,
  updated_transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_transaction public.transactions%rowtype;
  source_match text;
  normalized_match text;
  action_name text;
  affected_count bigint := 0;
begin
  if p_merchant_id is null and p_category_id is null then
    raise exception 'Choose a merchant or category before creating a rule';
  end if;

  select transaction_row.*
  into source_transaction
  from public.transactions transaction_row
  where transaction_row.id = p_transaction_id
    and transaction_row.deleted_at is null
    and transaction_row.parent_id is null
    and transaction_row.household_id in (
      select public.current_household_ids()
    )
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if p_merchant_id is not null and not exists (
    select 1
    from public.merchants merchant
    where merchant.id = p_merchant_id
      and merchant.household_id = source_transaction.household_id
  ) then
    raise exception 'Merchant does not belong to this household';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.household_id = source_transaction.household_id
  ) then
    raise exception 'Category does not belong to this household';
  end if;

  source_match :=
    coalesce(
      nullif(trim(source_transaction.original_description), ''),
      source_transaction.description
    );
  normalized_match := public.normalize_transaction_match(source_match);

  if normalized_match = '' then
    raise exception 'This transaction has no description to match';
  end if;

  select concat_ws(
    ' and ',
    case
      when p_merchant_id is not null
      then 'Merchant: ' || (select name from public.merchants where id = p_merchant_id)
    end,
    case
      when p_category_id is not null
      then 'Category: ' || (select name from public.categories where id = p_category_id)
    end
  )
  into action_name;

  insert into public.transaction_rules (
    household_id,
    name,
    match_description,
    match_description_normalized,
    merchant_id,
    category_id,
    enabled
  )
  values (
    source_transaction.household_id,
    action_name,
    source_match,
    normalized_match,
    p_merchant_id,
    p_category_id,
    true
  )
  on conflict (household_id, match_description_normalized)
  do update set
    name = excluded.name,
    match_description = excluded.match_description,
    merchant_id = excluded.merchant_id,
    category_id = excluded.category_id,
    enabled = true
  returning id into rule_id;

  select count(*)::bigint
  into matched_transaction_count
  from public.transactions candidate
  where candidate.household_id = source_transaction.household_id
    and candidate.deleted_at is null
    and candidate.parent_id is null
    and public.normalize_transaction_match(
      coalesce(
        nullif(trim(candidate.original_description), ''),
        candidate.description
      )
    ) = normalized_match;

  if p_apply_to_existing then
    update public.transactions candidate
    set
      merchant_id = case
        when p_merchant_id is not null then p_merchant_id
        else candidate.merchant_id
      end,
      merchant_overridden = case
        when p_merchant_id is not null then true
        else candidate.merchant_overridden
      end,
      category_id = case
        when p_category_id is not null and not candidate.has_splits
          then p_category_id
        else candidate.category_id
      end,
      needs_review = false
    where candidate.household_id = source_transaction.household_id
      and candidate.deleted_at is null
      and candidate.parent_id is null
      and public.normalize_transaction_match(
        coalesce(
          nullif(trim(candidate.original_description), ''),
          candidate.description
        )
      ) = normalized_match;

    get diagnostics affected_count = row_count;
  end if;

  updated_transaction_count := affected_count;

  update public.transaction_rules
  set
    historical_application_count =
      historical_application_count + affected_count,
    last_applied_at = case
      when p_apply_to_existing then now()
      else last_applied_at
    end
  where id = rule_id;

  return next;
end;
$$;

revoke all on function public.transaction_rule_preview(uuid) from public;
revoke all on function public.save_transaction_rule(uuid, uuid, uuid, boolean) from public;
grant execute on function public.transaction_rule_preview(uuid) to authenticated;
grant execute on function public.save_transaction_rule(uuid, uuid, uuid, boolean)
  to authenticated;
