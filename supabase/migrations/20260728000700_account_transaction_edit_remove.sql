-- Durable user edits and soft removal for accounts and transactions.
--
-- Plaid can send a transaction again after it changes or after a cursor reset.
-- Keeping a tombstone prevents a user-removed transaction from silently
-- returning, while the override flags keep user-edited dates and amounts from
-- being replaced by a later Plaid modification.

alter table public.transactions
  add column date_overridden boolean not null default false,
  add column amount_overridden boolean not null default false,
  add column deleted_at timestamptz;

create index transactions_active_household_date_idx
  on public.transactions (household_id, date desc, id desc)
  where deleted_at is null;

-- Split children carry the categorized cash flow, so their reporting date must
-- follow a date edit made on the parent.
create or replace function public.sync_split_child_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is null and new.date is distinct from old.date then
    update public.transactions
       set date = new.date,
           date_overridden = new.date_overridden
     where parent_id = new.id;
  end if;

  return null;
end;
$$;

create trigger transactions_sync_split_date
after update of date on public.transactions
for each row execute function public.sync_split_child_date();

-- Remove one account from Mintea without disconnecting every account that
-- shares its Plaid Item. The account row remains as a tombstone so sync can
-- recognize and ignore that Plaid account in the future.
create or replace function public.soft_delete_account(p_account_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  removed_at timestamptz := now();
begin
  update public.accounts
     set deleted_at = coalesce(deleted_at, removed_at),
         is_hidden = true,
         include_in_net_worth = false
   where id = p_account_id
     and household_id in (select public.current_household_ids());

  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;

  update public.transactions
     set deleted_at = coalesce(deleted_at, removed_at),
         is_hidden = true
   where account_id = p_account_id
     and household_id in (select public.current_household_ids());
end;
$$;

-- A split child is not meaningful without its siblings. Removing any member
-- of a split therefore removes the parent and every child as one transaction.
create or replace function public.soft_delete_transaction(
  p_transaction_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  root_id uuid;
  removed_at timestamptz := now();
begin
  select coalesce(parent_id, id)
    into root_id
    from public.transactions
   where id = p_transaction_id
     and deleted_at is null
     and household_id in (select public.current_household_ids());

  if root_id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;

  update public.transactions
     set deleted_at = removed_at,
         is_hidden = true
   where (id = root_id or parent_id = root_id)
     and household_id in (select public.current_household_ids());
end;
$$;

revoke all on function public.soft_delete_account(uuid) from public;
revoke all on function public.soft_delete_transaction(uuid) from public;
grant execute on function public.soft_delete_account(uuid) to authenticated;
grant execute on function public.soft_delete_transaction(uuid) to authenticated;
