-- P6.1: family invitations, account ownership, and account privacy.
--
-- A household remains the family boundary. The new account fields are the
-- second authorization gate: a member can see a Family account, while only
-- its owner can see a Private account. Invitation acceptance is deliberately
-- server-side because moving a profile and its bootstrap household must be
-- atomic.

-- ------------------------------------------------------------ account scope

alter table public.plaid_items
  add column owner_user_id uuid references auth.users (id) on delete restrict;

alter table public.accounts
  add column owner_user_id uuid references auth.users (id) on delete restrict,
  add column visibility text not null default 'family'
    check (visibility in ('family', 'private'));

-- Existing households are households of one. Preserve that user's access to
-- every existing account and connection; new accounts default to Private below
-- so a future account is never silently published to a new family member.
update public.plaid_items as item
set owner_user_id = member.user_id
from public.household_members as member
where member.household_id = item.household_id
  and member.role = 'owner'
  and item.owner_user_id is null;

update public.accounts as account
set owner_user_id = member.user_id
from public.household_members as member
where member.household_id = account.household_id
  and member.role = 'owner'
  and account.owner_user_id is null;

-- A malformed pre-P6 household should fail the migration loudly instead of
-- creating an account whose privacy cannot be enforced.
do $$
begin
  if exists (select 1 from public.plaid_items where owner_user_id is null)
     or exists (select 1 from public.accounts where owner_user_id is null) then
    raise exception 'Every existing Plaid Item and account must have an owner';
  end if;
end;
$$;

alter table public.plaid_items
  alter column owner_user_id set not null;

alter table public.accounts
  alter column owner_user_id set not null,
  alter column visibility set default 'private';

create index accounts_owner_idx
  on public.accounts (owner_user_id)
  where deleted_at is null;

create index plaid_items_owner_idx
  on public.plaid_items (owner_user_id);

-- Direct inserts can omit the owner because the authenticated caller is the
-- owner. The fallback keeps migration tests and trusted server-side bootstrap
-- writes deterministic when no JWT claim exists.
create or replace function public.set_account_sharing_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_owner uuid;
  caller uuid := auth.uid();
  item_owner uuid;
begin
  if new.owner_user_id is null then
    select member.user_id
      into fallback_owner
      from public.household_members as member
     where member.household_id = new.household_id
       and member.role = 'owner'
     order by member.created_at, member.user_id
     limit 1;

    new.owner_user_id := coalesce(caller, fallback_owner);
  end if;

  if new.owner_user_id is null then
    raise exception 'An account owner is required';
  end if;

  if new.plaid_item_id is not null then
    select item.owner_user_id
      into item_owner
      from public.plaid_items as item
     where item.id = new.plaid_item_id;

    if item_owner is not null and item_owner <> new.owner_user_id then
      raise exception 'A linked account must belong to its connection owner';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id
       and caller is not null then
      raise exception 'Account ownership changes require an explicit transfer';
    end if;

    if new.visibility is distinct from old.visibility
       and caller is distinct from old.owner_user_id then
      raise exception 'Only the account owner can change its visibility';
    end if;
  end if;

  return new;
end;
$$;

create trigger accounts_set_sharing_defaults
before insert or update of household_id, plaid_item_id, owner_user_id, visibility
on public.accounts
for each row execute function public.set_account_sharing_defaults();

create or replace function public.set_plaid_item_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_owner uuid;
begin
  if new.owner_user_id is null then
    select member.user_id
      into fallback_owner
      from public.household_members as member
     where member.household_id = new.household_id
       and member.role = 'owner'
     order by member.created_at, member.user_id
     limit 1;

    new.owner_user_id := coalesce(auth.uid(), fallback_owner);
  end if;

  if new.owner_user_id is null then
    raise exception 'A connection owner is required';
  end if;

  return new;
end;
$$;

create trigger plaid_items_set_owner
before insert on public.plaid_items
for each row execute function public.set_plaid_item_owner();

-- The helper is the one place where account visibility is defined. It is
-- SECURITY DEFINER so dependent-table policies do not recurse through the
-- accounts policy, but it still scopes the result by the caller's membership.
create or replace function public.current_visible_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select account.id
    from public.accounts as account
   where account.household_id in (select public.current_household_ids())
     and account.deleted_at is null
     and (
       account.visibility = 'family'
       or account.owner_user_id = (select auth.uid())
     );
$$;

revoke all on function public.current_visible_account_ids() from public;
grant execute on function public.current_visible_account_ids() to authenticated;

-- ------------------------------------------------------------- invitations

create table public.family_invitations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email        text not null,
  role         text not null default 'member' check (role = 'member'),
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  invited_by   uuid not null references auth.users (id) on delete cascade,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create unique index family_invitations_active_email_idx
  on public.family_invitations (household_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index family_invitations_household_idx
  on public.family_invitations (household_id, created_at desc);

create index family_invitations_token_hash_idx
  on public.family_invitations (token_hash);

alter table public.family_invitations enable row level security;

create policy family_invitations_owner_read on public.family_invitations
  for select to authenticated
  using (
    household_id in (select public.current_household_ids())
    and exists (
      select 1
        from public.household_members as member
       where member.household_id = family_invitations.household_id
         and member.user_id = (select auth.uid())
         and member.role = 'owner'
    )
  );

revoke all on public.family_invitations from anon, authenticated;
grant select on public.family_invitations to authenticated;

-- -------------------------------------------------------------- family RPCs

create or replace function public.get_family_members()
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  role         text,
  joined_at    timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    member.user_id,
    auth_user.email,
    profile.display_name,
    member.role,
    member.created_at
  from public.household_members as member
  join public.profiles as profile on profile.id = member.user_id
  join auth.users as auth_user on auth_user.id = member.user_id
  where member.household_id = (
    select profile_for_caller.household_id
      from public.profiles as profile_for_caller
     where profile_for_caller.id = auth.uid()
  )
  order by (member.role = 'owner') desc, member.created_at, member.user_id;
$$;

revoke all on function public.get_family_members() from public;
grant execute on function public.get_family_members() to authenticated;

create or replace function public.create_family_invitation(
  p_email text,
  p_role text default 'member'
)
returns table (
  id         uuid,
  email      text,
  role       text,
  expires_at timestamptz,
  token      text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  raw_token text;
  invitation_id uuid;
  invitation_expiry timestamptz := now() + interval '7 days';
begin
  if caller is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;

  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  if p_role is distinct from 'member' then
    raise exception 'Only member invitations are available' using errcode = '22023';
  end if;

  select profile.household_id
    into target_household
    from public.profiles as profile
    join public.household_members as member
      on member.household_id = profile.household_id
     and member.user_id = profile.id
   where profile.id = caller
     and member.role = 'owner';

  if target_household is null then
    raise exception 'Only family owners can invite members' using errcode = '42501';
  end if;

  if exists (
    select 1
      from auth.users as auth_user
      join public.household_members as member on member.user_id = auth_user.id
     where member.household_id = target_household
       and lower(auth_user.email) = normalized_email
  ) then
    raise exception 'That person is already in your family' using errcode = '23505';
  end if;

  -- Reissuing an invite revokes the old token before creating a new one. This
  -- keeps one active credential per email and makes repeated taps safe.
  update public.family_invitations as invitation
     set revoked_at = now()
   where invitation.household_id = target_household
     and lower(invitation.email) = normalized_email
     and invitation.accepted_at is null
     and invitation.revoked_at is null;

  -- UUIDs are generated by the database, and concatenating two independent
  -- values gives a 256-bit bearer token. Only its SHA-256 digest is stored;
  -- the preimage is not recoverable from the database row and the token is
  -- never written to logs by this function.
  raw_token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  insert into public.family_invitations (
    household_id,
    email,
    role,
    token_hash,
    expires_at,
    invited_by
  )
  values (
    target_household,
    normalized_email,
    p_role,
    encode(sha256(convert_to(raw_token, 'utf8')), 'hex'),
    invitation_expiry,
    caller
  )
  returning family_invitations.id into invitation_id;

  return query
  select invitation.id, invitation.email, invitation.role,
         invitation.expires_at, raw_token
    from public.family_invitations as invitation
   where invitation.id = invitation_id;
end;
$$;

revoke all on function public.create_family_invitation(text, text) from public;
grant execute on function public.create_family_invitation(text, text) to authenticated;

create or replace function public.revoke_family_invitation(
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  affected integer;
begin
  update public.family_invitations as invitation
     set revoked_at = now()
   where invitation.id = p_invitation_id
     and invitation.accepted_at is null
     and invitation.revoked_at is null
     and exists (
       select 1
         from public.household_members as member
        where member.household_id = invitation.household_id
          and member.user_id = caller
          and member.role = 'owner'
     );

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.revoke_family_invitation(uuid) from public;
grant execute on function public.revoke_family_invitation(uuid) to authenticated;

create or replace function public.rename_family(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
  normalized_name text := btrim(coalesce(p_name, ''));
  result public.households;
begin
  if normalized_name = '' or length(normalized_name) > 80 then
    raise exception 'Family name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  select profile.household_id
    into target_household
    from public.profiles as profile
    join public.household_members as member
      on member.household_id = profile.household_id
     and member.user_id = profile.id
   where profile.id = caller
     and member.role = 'owner';

  if target_household is null then
    raise exception 'Only family owners can rename the family' using errcode = '42501';
  end if;

  update public.households
     set name = normalized_name
   where id = target_household
  returning * into result;

  return result;
end;
$$;

revoke all on function public.rename_family(text) from public;
grant execute on function public.rename_family(text) to authenticated;

create or replace function public.update_family_member_role(
  p_user_id uuid,
  p_role text
)
returns table (user_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
  current_role text;
  owner_count integer;
begin
  if p_role not in ('owner', 'member') then
    raise exception 'Family members can only be owners or members' using errcode = '22023';
  end if;

  select profile.household_id
    into target_household
    from public.profiles as profile
    join public.household_members as member
      on member.household_id = profile.household_id
     and member.user_id = profile.id
   where profile.id = caller
     and member.role = 'owner';

  if target_household is null then
    raise exception 'Only family owners can manage roles' using errcode = '42501';
  end if;

  select member.role
    into current_role
    from public.household_members as member
   where member.household_id = target_household
     and member.user_id = p_user_id
   for update;

  if current_role is null then
    raise exception 'Family member not found' using errcode = 'P0002';
  end if;

  if current_role = 'owner' and p_role = 'member' then
    select count(*)::integer
      into owner_count
      from public.household_members as member
     where member.household_id = target_household
       and member.role = 'owner';

    if owner_count <= 1 then
      raise exception 'A family must always have an owner' using errcode = '23514';
    end if;
  end if;

  update public.household_members as member
     set role = p_role
   where member.household_id = target_household
     and member.user_id = p_user_id;

  return query
  select member.user_id, member.role
    from public.household_members as member
   where member.household_id = target_household
     and member.user_id = p_user_id;
end;
$$;

revoke all on function public.update_family_member_role(uuid, text) from public;
grant execute on function public.update_family_member_role(uuid, text) to authenticated;

create or replace function public.accept_family_invitation(p_token text)
returns table (household_id uuid, role text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  invitation public.family_invitations;
  current_household uuid;
  source_member_role text;
  caller_email text;
  source_member_count integer;
  active_membership_count integer;
  source_environment text;
  target_environment text;
begin
  if caller is null then
    raise exception 'You must be signed in to accept an invitation' using errcode = '28000';
  end if;

  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'Invitation link is missing its token' using errcode = '22023';
  end if;

  select auth_user.email
    into caller_email
    from auth.users as auth_user
   where auth_user.id = caller;

  if caller_email is null then
    raise exception 'Signed-in user has no email address' using errcode = '28000';
  end if;

  select *
    into invitation
    from public.family_invitations
   where token_hash = encode(sha256(convert_to(btrim(p_token), 'utf8')), 'hex')
   for update;

  if not found then
    raise exception 'Invitation is invalid or expired' using errcode = '22023';
  end if;

  if invitation.accepted_at is not null then
    if invitation.accepted_by = caller
       and exists (
         select 1
           from public.household_members as member
          where member.household_id = invitation.household_id
            and member.user_id = caller
       ) then
      select count(*)::integer
        into active_membership_count
        from public.household_members as member
       where member.user_id = caller;

      if active_membership_count <> 1 then
        raise exception 'Your account must belong to exactly one family'
          using errcode = '55000';
      end if;

      return query select invitation.household_id, invitation.role;
      return;
    end if;
    raise exception 'Invitation has already been accepted' using errcode = '22023';
  end if;

  if invitation.revoked_at is not null or invitation.expires_at <= now() then
    raise exception 'Invitation is invalid or expired' using errcode = '22023';
  end if;

  if lower(caller_email) <> lower(invitation.email) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  select profile.household_id
    into current_household
    from public.profiles as profile
   where profile.id = caller
   for update;

  if current_household is null then
    raise exception 'Your Mintea profile is not ready yet' using errcode = 'P0002';
  end if;

  -- Lock the caller's current membership rows before checking the invariant.
  -- The profile lock above serializes normal joins for this user; this lock
  -- also makes the membership check explicit for any future membership path.
  perform 1
    from public.household_members as member
   where member.user_id = caller
   order by member.household_id
   for update;

  select count(*)::integer
    into active_membership_count
    from public.household_members as member
   where member.user_id = caller;

  if active_membership_count <> 1 then
    raise exception 'Your account must belong to exactly one family'
      using errcode = '55000';
  end if;

  if current_household = invitation.household_id then
    raise exception 'You are already in this family' using errcode = '23505';
  end if;

  select household.plaid_environment
    into source_environment
    from public.households as household
   where household.id = current_household;

  select household.plaid_environment
    into target_environment
    from public.households as household
   where household.id = invitation.household_id;

  if source_environment is distinct from target_environment then
    raise exception 'These families use different Plaid environments and cannot be joined'
      using errcode = '22023';
  end if;

  select count(*)::integer
    into source_member_count
    from public.household_members as member
   where member.household_id = current_household;

  select member.role
    into source_member_role
    from public.household_members as member
   where member.household_id = current_household
     and member.user_id = caller;

  -- P6.1 is intentionally limited to the empty bootstrap household. A
  -- populated household needs the P6.2 preview/migration/deduplication flow.
  if source_member_count <> 1
     or source_member_role is distinct from 'owner'
     or exists (
       select 1 from public.accounts as account
        where account.household_id = current_household
     ) then
    raise exception 'This account has financial data. Use the family migration flow instead.'
      using errcode = '55000';
  end if;

  -- Move the membership in the safe order. During this transaction the caller
  -- may briefly have no membership, but never has two memberships. A failure
  -- rolls the deletion back with the rest of the operation.
  delete from public.household_members as member
   where member.household_id = current_household
     and member.user_id = caller;

  if not found then
    raise exception 'Your current family membership was not found'
      using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, caller, invitation.role);

  update public.profiles
     set household_id = invitation.household_id,
         updated_at = now()
   where id = caller;

  select count(*)::integer
    into active_membership_count
    from public.household_members as member
   where member.user_id = caller;

  if active_membership_count <> 1 then
    raise exception 'Family join did not leave exactly one active membership'
      using errcode = '55000';
  end if;

  -- The signup trigger created this household only as a bootstrap container.
  -- Once the profile and membership move, its default categories and row are
  -- safe to remove without touching the target family.
  delete from public.households as household where household.id = current_household;

  update public.family_invitations as accepted_invitation
     set accepted_at = now(), accepted_by = caller
   where accepted_invitation.id = invitation.id;

  return query select invitation.household_id, invitation.role;
end;
$$;

revoke all on function public.accept_family_invitation(text) from public;
grant execute on function public.accept_family_invitation(text) to authenticated;

-- --------------------------------------------------------------- RLS rules

drop policy if exists households_update on public.households;
create policy households_owner_update on public.households
  for update to authenticated
  using (
    id in (select public.current_household_ids())
    and exists (
      select 1 from public.household_members as member
       where member.household_id = households.id
         and member.user_id = (select auth.uid())
         and member.role = 'owner'
    )
  )
  with check (id in (select public.current_household_ids()));

drop policy if exists plaid_items_read on public.plaid_items;
create policy plaid_items_read on public.plaid_items
  for select to authenticated
  using (
    household_id in (select public.current_household_ids())
    and (
      owner_user_id = (select auth.uid())
      or exists (
        select 1
          from public.accounts as account
         where account.plaid_item_id = plaid_items.id
           and account.household_id = plaid_items.household_id
           and account.deleted_at is null
           and account.visibility = 'family'
      )
    )
  );

drop policy if exists plaid_items_phone_update on public.plaid_items;
create policy plaid_items_phone_update on public.plaid_items
  for update to authenticated
  using (
    owner_user_id = (select auth.uid())
    and household_id in (select public.current_household_ids())
  )
  with check (
    owner_user_id = (select auth.uid())
    and household_id in (select public.current_household_ids())
  );

drop policy if exists accounts_rw on public.accounts;
create policy accounts_read on public.accounts
  for select to authenticated
  using (
    household_id in (select public.current_household_ids())
    and (
      visibility = 'family'
      or owner_user_id = (select auth.uid())
    )
  );

create policy accounts_insert on public.accounts
  for insert to authenticated
  with check (
    household_id in (select public.current_household_ids())
    and owner_user_id = (select auth.uid())
  );

create policy accounts_update on public.accounts
  for update to authenticated
  using (
    household_id in (select public.current_household_ids())
    and (visibility = 'family' or owner_user_id = (select auth.uid()))
  )
  with check (
    household_id in (select public.current_household_ids())
    and (visibility = 'family' or owner_user_id = (select auth.uid()))
  );

create policy accounts_delete on public.accounts
  for delete to authenticated
  using (
    household_id in (select public.current_household_ids())
    and owner_user_id = (select auth.uid())
  );

drop policy if exists account_balances_rw on public.account_balances;
create policy account_balances_rw on public.account_balances
  for all to authenticated
  using (account_id in (select public.current_visible_account_ids()))
  with check (
    account_id in (select public.current_visible_account_ids())
    and household_id in (select public.current_household_ids())
  );

drop policy if exists transactions_rw on public.transactions;
create policy transactions_rw on public.transactions
  for all to authenticated
  using (account_id in (select public.current_visible_account_ids()))
  with check (
    account_id in (select public.current_visible_account_ids())
    and household_id in (select public.current_household_ids())
  );

drop policy if exists transaction_tags_rw on public.transaction_tags;
create policy transaction_tags_rw on public.transaction_tags
  for all to authenticated
  using (
    transaction_id in (
      select transaction.id
        from public.transactions as transaction
       where transaction.account_id in (select public.current_visible_account_ids())
    )
  )
  with check (
    transaction_id in (
      select transaction.id
        from public.transactions as transaction
       where transaction.account_id in (select public.current_visible_account_ids())
    )
    and household_id in (select public.current_household_ids())
  );

drop policy if exists property_details_rw on public.property_details;
create policy property_details_rw on public.property_details
  for all to authenticated
  using (account_id in (select public.current_visible_account_ids()))
  with check (
    account_id in (select public.current_visible_account_ids())
    and household_id in (select public.current_household_ids())
  );
