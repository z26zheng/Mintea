-- Tags: make the existing `tags` / `transaction_tags` tables reachable.
--
-- Both tables have existed since the initial schema but were never surfaced,
-- so this migration supplies the guarantees a user-facing feature needs:
-- case-insensitive uniqueness, normalized names, usage counts, and atomic
-- assignment. Every function is SECURITY INVOKER and relies on the existing
-- household RLS policies, matching the transaction-rule functions.

-- --------------------------------------------------------------- normalization

/**
 * Tag names are compared case-insensitively with collapsed whitespace, so
 * "Tax Deductible", "tax  deductible" and " Tax Deductible " are one tag.
 * Without this a household accumulates near-identical tags that silently split
 * its own filters.
 */
create or replace function public.normalize_tag_name(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'), '')
$$;

grant execute on function public.normalize_tag_name(text) to authenticated;

create or replace function public.set_tag_name()
returns trigger
language plpgsql
as $$
begin
  new.name := public.normalize_tag_name(new.name);

  if new.name is null then
    raise exception 'Tag name cannot be blank'
      using errcode = 'check_violation';
  end if;

  if length(new.name) > 40 then
    raise exception 'Tag name cannot be longer than 40 characters'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tags_normalize_name
before insert or update of name on tags
for each row execute function public.set_tag_name();

-- Existing rows predate normalization. There is no tag UI yet, so in practice
-- this is a no-op, but the index below would fail on any case-variant pair.
update tags set name = public.normalize_tag_name(name) where name is not null;

-- The original `unique (household_id, name)` is case sensitive, which would let
-- "Travel" and "travel" coexist and split a filter in two.
create unique index tags_household_name_lower_idx
  on tags (household_id, lower(name));

-- ------------------------------------------------------------------- counts

/**
 * Tag list with the number of live transactions carrying each tag.
 *
 * The count drives the delete confirmation, so it deliberately mirrors what
 * the transaction list shows: removed rows and split children are excluded,
 * because a user reading "12 transactions" then seeing 9 would not trust it.
 */
create or replace function public.tag_usage_counts()
returns table (
  tag_id            uuid,
  transaction_count bigint
)
language sql
stable
as $$
  select
    t.id,
    count(tt.transaction_id) filter (
      where tx.id is not null
        and tx.deleted_at is null
        and tx.parent_id is null
    )::bigint
  from tags t
  left join transaction_tags tt on tt.tag_id = t.id
  left join transactions tx on tx.id = tt.transaction_id
  where t.household_id in (select current_household_ids())
  group by t.id;
$$;

grant execute on function public.tag_usage_counts() to authenticated;

-- --------------------------------------------------------------- assignment

/**
 * Replaces one transaction's tags in a single statement pair.
 *
 * The client previously deleted then inserted over two round trips; an error
 * between them left the transaction with no tags at all.
 */
create or replace function public.set_transaction_tags(
  p_transaction_id uuid,
  p_tag_ids uuid[]
)
returns void
language plpgsql
as $$
declare
  target_household uuid;
  valid_tags       integer;
  requested        integer := coalesce(array_length(p_tag_ids, 1), 0);
begin
  select household_id into target_household
  from transactions
  where id = p_transaction_id
    and deleted_at is null
    and household_id in (select current_household_ids());

  if target_household is null then
    raise exception 'Transaction not found'
      using errcode = 'no_data_found';
  end if;

  -- Every tag must belong to the same household. Without this check a caller
  -- could attach another household's tag id by guessing it.
  if requested > 0 then
    select count(*) into valid_tags
    from tags
    where id = any (p_tag_ids)
      and household_id = target_household;

    if valid_tags <> requested then
      raise exception 'Unknown tag for this household'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  delete from transaction_tags where transaction_id = p_transaction_id;

  if requested > 0 then
    insert into transaction_tags (household_id, transaction_id, tag_id)
    select target_household, p_transaction_id, unnest(p_tag_ids);
  end if;
end;
$$;

grant execute on function public.set_transaction_tags(uuid, uuid[])
  to authenticated;

/**
 * Adds or removes one tag across a selection, atomically.
 *
 * Returns the number of transactions actually changed so the UI can report
 * "Tagged 12" rather than optimistically claiming the whole selection — rows
 * outside the household, removed, or already tagged are skipped.
 */
create or replace function public.bulk_tag_transactions(
  p_tag_id uuid,
  p_transaction_ids uuid[],
  p_attach boolean
)
returns integer
language plpgsql
as $$
declare
  target_household uuid;
  changed          integer := 0;
begin
  select household_id into target_household
  from tags
  where id = p_tag_id
    and household_id in (select current_household_ids());

  if target_household is null then
    raise exception 'Tag not found'
      using errcode = 'no_data_found';
  end if;

  if coalesce(array_length(p_transaction_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_attach then
    with eligible as (
      select id
      from transactions
      where id = any (p_transaction_ids)
        and household_id = target_household
        and deleted_at is null
    ),
    inserted as (
      insert into transaction_tags (household_id, transaction_id, tag_id)
      select target_household, eligible.id, p_tag_id
      from eligible
      -- Already-tagged rows are not an error; they simply do not count as a
      -- change.
      on conflict (transaction_id, tag_id) do nothing
      returning transaction_id
    )
    select count(*) into changed from inserted;
  else
    with eligible as (
      select id
      from transactions
      where id = any (p_transaction_ids)
        and household_id = target_household
    ),
    removed as (
      delete from transaction_tags
      where tag_id = p_tag_id
        and transaction_id in (select id from eligible)
      returning transaction_id
    )
    select count(*) into changed from removed;
  end if;

  return changed;
end;
$$;

grant execute on function public.bulk_tag_transactions(uuid, uuid[], boolean)
  to authenticated;
