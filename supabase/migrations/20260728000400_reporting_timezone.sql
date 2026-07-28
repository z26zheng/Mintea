-- One reporting calendar for every daily financial datum.
--
-- Plaid functions run in UTC while the app renders in the user's local time.
-- Around UTC midnight that used to put a balance snapshot on tomorrow while
-- the dashboard still asked for today. A household-level IANA time zone is the
-- canonical reporting calendar shared by the database, Edge Functions, and UI.

alter table public.households
  add column timezone text not null default 'UTC';

-- PostgreSQL's own time-zone catalogue is the source of truth. Keeping this in
-- a function lets signup metadata and both table triggers share the same check.
create or replace function public.is_valid_reporting_timezone(p_timezone text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    ),
    false
  );
$$;

revoke all on function public.is_valid_reporting_timezone(text) from public;

create or replace function public.enforce_valid_reporting_timezone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_valid_reporting_timezone(new.timezone) then
    raise exception 'Invalid IANA time zone: %', new.timezone
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_reporting_timezone() from public;

create trigger households_valid_timezone
before insert or update of timezone on public.households
for each row execute function public.enforce_valid_reporting_timezone();

create trigger profiles_valid_timezone
before insert or update of timezone on public.profiles
for each row execute function public.enforce_valid_reporting_timezone();

update public.profiles
set timezone = 'UTC'
where not public.is_valid_reporting_timezone(timezone);

-- Preserve an existing owner's configured zone where one is valid. Existing
-- profiles currently default to UTC, but this also makes the migration safe for
-- installations that already populated the column.
update public.households as household
set timezone = coalesce(
  (
    select profile.timezone
    from public.household_members as member
    join public.profiles as profile on profile.id = member.user_id
    where member.household_id = household.id
      and member.role = 'owner'
      and public.is_valid_reporting_timezone(profile.timezone)
    order by member.created_at
    limit 1
  ),
  'UTC'
);

-- New clients include their device's IANA zone in signup metadata. Invalid or
-- missing metadata is untrusted input and safely falls back to UTC.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household uuid;
  reporting_timezone text;
begin
  reporting_timezone := nullif(new.raw_user_meta_data ->> 'timezone', '');

  if not public.is_valid_reporting_timezone(reporting_timezone) then
    reporting_timezone := 'UTC';
  end if;

  insert into public.households (name, timezone)
  values ('My Household', reporting_timezone)
  returning id into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household, new.id, 'owner');

  insert into public.profiles (
    id,
    household_id,
    display_name,
    timezone
  )
  values (
    new.id,
    new_household,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    ),
    reporting_timezone
  );

  perform public.seed_default_categories(new_household);

  return new;
end;
$$;

-- This is the only app write path for a reporting-zone change. It keeps the
-- household (canonical) and every member profile (convenient display/cache)
-- synchronized in one transaction and never accepts a caller-supplied id.
create or replace function public.set_reporting_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_valid_reporting_timezone(p_timezone) then
    raise exception 'Invalid IANA time zone: %', p_timezone
      using errcode = '22023';
  end if;

  select profile.household_id
  into target_household
  from public.profiles as profile
  join public.household_members as member
    on member.household_id = profile.household_id
   and member.user_id = auth.uid()
  where profile.id = auth.uid();

  if target_household is null then
    raise exception 'No household for this user' using errcode = '42501';
  end if;

  update public.households
  set timezone = p_timezone
  where id = target_household;

  update public.profiles
  set timezone = p_timezone
  where household_id = target_household;
end;
$$;

revoke all on function public.set_reporting_timezone(text) from public;
grant execute on function public.set_reporting_timezone(text) to authenticated;
