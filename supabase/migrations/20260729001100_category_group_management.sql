-- Category group management.
--
-- Groups have been creatable from `packages/core` since the schema landed, but
-- nothing reachable from the app could rename, reorder or remove one. The
-- reason to be careful about the last of those is the cascade already in the
-- schema:
--
--   category_groups --on delete cascade--> categories
--   categories      --on delete set null--> transactions.category_id
--   categories      --on delete cascade--> transaction_rules
--
-- So a plain `delete from category_groups` silently destroys every category in
-- the group, uncategorises every transaction that used them, and deletes any
-- cleanup rules referencing them. The money survives; years of categorisation
-- do not, with no warning and no undo.
--
-- Rather than rely on every client remembering that, deletion goes through a
-- function that refuses to run unless the group is empty or its categories
-- have somewhere to go.

-- ------------------------------------------------------------------- naming

create or replace function public.normalize_group_name(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'), '')
$$;

create or replace function public.set_group_name()
returns trigger
language plpgsql
as $$
begin
  new.name := public.normalize_group_name(new.name);

  if new.name is null then
    raise exception 'A group needs a name';
  end if;

  if length(new.name) > 40 then
    raise exception 'Group names are limited to 40 characters';
  end if;

  return new;
end;
$$;

drop trigger if exists category_groups_set_name on public.category_groups;
create trigger category_groups_set_name
before insert or update of name on public.category_groups
for each row execute function public.set_group_name();

-- The existing `unique (household_id, name)` is case sensitive, which would let
-- "Travel" and "travel" coexist and read as a duplicate to everyone but Postgres.
create unique index if not exists category_groups_household_name_lower_idx
  on public.category_groups (household_id, lower(name));

-- ------------------------------------------------------------------ deleting

/**
 * Removes a group, relocating whatever it holds.
 *
 * `p_move_to_group_id` is where the group's categories go. It is required
 * whenever the group still has any: a group is a container, and removing a
 * container should not destroy its contents. Passing null is only valid for an
 * already-empty group.
 *
 * Returns how many categories moved, so the caller can report what happened
 * rather than guessing.
 */
create or replace function public.delete_category_group(
  p_group_id uuid,
  p_move_to_group_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household uuid;
  v_moved integer := 0;
  v_remaining integer;
begin
  select household_id into v_household
  from category_groups
  where id = p_group_id
    and household_id in (select current_household_ids());

  if v_household is null then
    raise exception 'Group not found';
  end if;

  select count(*) into v_remaining from categories where group_id = p_group_id;

  if v_remaining > 0 then
    if p_move_to_group_id is null then
      raise exception 'This group still has % categories; choose where they should go', v_remaining;
    end if;

    if p_move_to_group_id = p_group_id then
      raise exception 'A group cannot be moved into itself';
    end if;

    -- Same household, or the move would leak categories across households.
    if not exists (
      select 1 from category_groups
      where id = p_move_to_group_id
        and household_id = v_household
    ) then
      raise exception 'Destination group not found';
    end if;

    update categories
    set group_id = p_move_to_group_id, updated_at = now()
    where group_id = p_group_id;

    get diagnostics v_moved = row_count;
  end if;

  delete from category_groups where id = p_group_id;

  return v_moved;
end;
$$;

-- -------------------------------------------------------------- reordering

/**
 * Applies a new order in one statement.
 *
 * Writing `display_order` one row at a time leaves the list briefly holding
 * duplicate positions, which renders as groups jumping around. This sets them
 * all together, and ignores any id that is not the caller's.
 */
create or replace function public.reorder_category_groups(p_group_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  update category_groups g
  set display_order = ordered.position - 1
  from (
    select id, row_number() over () as position
    from unnest(p_group_ids) as id
  ) ordered
  where g.id = ordered.id
    and g.household_id in (select current_household_ids());

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.delete_category_group(uuid, uuid) to authenticated;
grant execute on function public.reorder_category_groups(uuid[]) to authenticated;
