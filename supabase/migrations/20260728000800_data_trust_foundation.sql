-- Data Trust foundation: reviewed duplicate-account merges and reversible
-- transfer pairing.
--
-- Duplicate detection remains client-side and conservative. These functions
-- enforce the same identity invariants again at the database boundary, preview
-- the exact impact, and perform every merge as one transaction.

alter table public.accounts
  add column merged_into_account_id uuid references public.accounts (id) on delete set null,
  add column merged_at timestamptz,
  add column merged_by_user_id uuid references auth.users (id) on delete set null,
  add constraint accounts_cannot_merge_into_self
    check (merged_into_account_id is null or merged_into_account_id <> id);

create index accounts_merged_into_idx
  on public.accounts (merged_into_account_id)
  where merged_into_account_id is not null;

-- ---------------------------------------------------------------- merge preview

create or replace function public.account_merge_preview(
  p_source_account_id uuid,
  p_destination_account_id uuid
)
returns table (
  source_transaction_count bigint,
  overlapping_transaction_count bigint,
  transaction_count_to_move bigint,
  source_balance_count bigint,
  balance_dates_to_copy bigint,
  source_item_will_be_empty boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  source_account public.accounts%rowtype;
  destination_account public.accounts%rowtype;
  same_institution boolean;
begin
  if p_source_account_id = p_destination_account_id then
    raise exception 'Choose two different accounts' using errcode = '22023';
  end if;

  select *
    into source_account
    from public.accounts
   where id = p_source_account_id
     and deleted_at is null
     and household_id in (select public.current_household_ids());

  if not found then
    raise exception 'Source account not found' using errcode = 'P0002';
  end if;

  select *
    into destination_account
    from public.accounts
   where id = p_destination_account_id
     and deleted_at is null
     and household_id in (select public.current_household_ids());

  if not found then
    raise exception 'Destination account not found' using errcode = 'P0002';
  end if;

  if source_account.household_id <> destination_account.household_id
     or source_account.type <> destination_account.type
     or source_account.currency <> destination_account.currency
     or source_account.is_asset <> destination_account.is_asset then
    raise exception 'These accounts are not safe to merge' using errcode = '22023';
  end if;

  if source_account.is_manual
     or destination_account.is_manual
     or source_account.plaid_item_id is null
     or destination_account.plaid_item_id is null
     or source_account.plaid_item_id = destination_account.plaid_item_id
     or source_account.mask is null
     or destination_account.mask is null
     or regexp_replace(lower(source_account.mask), '[^a-z0-9]+', '', 'g')
        <> regexp_replace(lower(destination_account.mask), '[^a-z0-9]+', '', 'g') then
    raise exception 'Only matching linked accounts can be merged'
      using errcode = '22023';
  end if;

  select (
    case
      when source_item.plaid_institution_id is not null
       and destination_item.plaid_institution_id is not null
        then source_item.plaid_institution_id = destination_item.plaid_institution_id
      else
        regexp_replace(
          lower(coalesce(source_item.institution_name, '')),
          '[^a-z0-9]+',
          '',
          'g'
        ) <> ''
        and regexp_replace(
          lower(coalesce(source_item.institution_name, '')),
          '[^a-z0-9]+',
          '',
          'g'
        ) = regexp_replace(
          lower(coalesce(destination_item.institution_name, '')),
          '[^a-z0-9]+',
          '',
          'g'
        )
    end
  )
    into same_institution
    from public.plaid_items source_item
    join public.plaid_items destination_item
      on destination_item.id = destination_account.plaid_item_id
   where source_item.id = source_account.plaid_item_id;

  if not coalesce(same_institution, false) then
    raise exception 'The accounts are from different institutions'
      using errcode = '22023';
  end if;

  return query
  with source_ranked as (
    select
      transaction.id,
      row_number() over (
        partition by
          transaction.date,
          transaction.amount_cents,
          transaction.currency,
          transaction.is_pending,
          regexp_replace(
            lower(coalesce(transaction.original_description, transaction.description)),
            '[^a-z0-9]+',
            '',
            'g'
          )
        order by transaction.created_at, transaction.id
      ) as occurrence
    from public.transactions transaction
    where transaction.account_id = p_source_account_id
      and transaction.parent_id is null
      and transaction.deleted_at is null
  ),
  destination_ranked as (
    select
      transaction.id,
      transaction.date,
      transaction.amount_cents,
      transaction.currency,
      transaction.is_pending,
      regexp_replace(
        lower(coalesce(transaction.original_description, transaction.description)),
        '[^a-z0-9]+',
        '',
        'g'
      ) as normalized_description,
      row_number() over (
        partition by
          transaction.date,
          transaction.amount_cents,
          transaction.currency,
          transaction.is_pending,
          regexp_replace(
            lower(coalesce(transaction.original_description, transaction.description)),
            '[^a-z0-9]+',
            '',
            'g'
          )
        order by transaction.created_at, transaction.id
      ) as occurrence
    from public.transactions transaction
    where transaction.account_id = p_destination_account_id
      and transaction.parent_id is null
      and transaction.deleted_at is null
  ),
  source_identified as (
    select
      source_ranked.id,
      transaction.date,
      transaction.amount_cents,
      transaction.currency,
      transaction.is_pending,
      regexp_replace(
        lower(coalesce(transaction.original_description, transaction.description)),
        '[^a-z0-9]+',
        '',
        'g'
      ) as normalized_description,
      source_ranked.occurrence
    from source_ranked
    join public.transactions transaction on transaction.id = source_ranked.id
  ),
  overlap as (
    select source.id
    from source_identified source
    join destination_ranked destination
      on destination.date = source.date
     and destination.amount_cents = source.amount_cents
     and destination.currency = source.currency
     and destination.is_pending = source.is_pending
     and destination.normalized_description = source.normalized_description
     and destination.occurrence = source.occurrence
  ),
  transaction_counts as (
    select
      (select count(*) from source_ranked)::bigint as source_count,
      (select count(*) from overlap)::bigint as overlap_count
  ),
  balance_counts as (
    select
      count(*)::bigint as source_count,
      count(*) filter (
        where not exists (
          select 1
          from public.account_balances destination_balance
          where destination_balance.account_id = p_destination_account_id
            and destination_balance.date = source_balance.date
        )
      )::bigint as missing_count
    from public.account_balances source_balance
    where source_balance.account_id = p_source_account_id
  )
  select
    transaction_counts.source_count,
    transaction_counts.overlap_count,
    transaction_counts.source_count - transaction_counts.overlap_count,
    balance_counts.source_count,
    balance_counts.missing_count,
    source_account.plaid_item_id is not null
      and not exists (
        select 1
        from public.accounts sibling
        where sibling.plaid_item_id = source_account.plaid_item_id
          and sibling.id <> source_account.id
          and sibling.deleted_at is null
      )
  from transaction_counts
  cross join balance_counts;
end;
$$;

-- ---------------------------------------------------------------- account merge

create or replace function public.merge_duplicate_accounts(
  p_source_account_id uuid,
  p_destination_account_id uuid
)
returns table (
  source_transaction_count bigint,
  overlapping_transaction_count bigint,
  transaction_count_to_move bigint,
  source_balance_count bigint,
  balance_dates_to_copy bigint,
  source_item_will_be_empty boolean
)
language plpgsql
set search_path = public
as $$
declare
  source_account public.accounts%rowtype;
  destination_account public.accounts%rowtype;
  preview record;
  locked_account_count integer;
  source_duplicate_ids uuid[] := array[]::uuid[];
  destination_duplicate_ids uuid[] := array[]::uuid[];
  archived_at timestamptz := now();
begin
  -- Lock first, then validate. Doing this in the opposite order leaves a small
  -- race where an account can change between the safety check and the lock.
  perform 1
    from public.accounts
   where id in (p_source_account_id, p_destination_account_id)
     and household_id in (select public.current_household_ids())
   order by id
   for update;

  get diagnostics locked_account_count = row_count;
  if locked_account_count <> 2 then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;

  select *
    into preview
    from public.account_merge_preview(
      p_source_account_id,
      p_destination_account_id
    );

  select *
    into source_account
    from public.accounts
   where id = p_source_account_id
     and deleted_at is null;

  select *
    into destination_account
    from public.accounts
   where id = p_destination_account_id
     and deleted_at is null;

  if source_account.id is null or destination_account.id is null then
    raise exception 'An account changed before the merge could finish'
      using errcode = '40001';
  end if;

  with source_ranked as (
    select
      transaction.id,
      transaction.date,
      transaction.amount_cents,
      transaction.currency,
      transaction.is_pending,
      regexp_replace(
        lower(coalesce(transaction.original_description, transaction.description)),
        '[^a-z0-9]+',
        '',
        'g'
      ) as normalized_description,
      row_number() over (
        partition by
          transaction.date,
          transaction.amount_cents,
          transaction.currency,
          transaction.is_pending,
          regexp_replace(
            lower(coalesce(transaction.original_description, transaction.description)),
            '[^a-z0-9]+',
            '',
            'g'
          )
        order by transaction.created_at, transaction.id
      ) as occurrence
    from public.transactions transaction
    where transaction.account_id = p_source_account_id
      and transaction.parent_id is null
      and transaction.deleted_at is null
  ),
  destination_ranked as (
    select
      transaction.id,
      transaction.date,
      transaction.amount_cents,
      transaction.currency,
      transaction.is_pending,
      regexp_replace(
        lower(coalesce(transaction.original_description, transaction.description)),
        '[^a-z0-9]+',
        '',
        'g'
      ) as normalized_description,
      row_number() over (
        partition by
          transaction.date,
          transaction.amount_cents,
          transaction.currency,
          transaction.is_pending,
          regexp_replace(
            lower(coalesce(transaction.original_description, transaction.description)),
            '[^a-z0-9]+',
            '',
            'g'
          )
        order by transaction.created_at, transaction.id
      ) as occurrence
    from public.transactions transaction
    where transaction.account_id = p_destination_account_id
      and transaction.parent_id is null
      and transaction.deleted_at is null
  ),
  overlap as (
    select
      source.id as source_id,
      destination.id as destination_id
    from source_ranked source
    join destination_ranked destination
      on destination.date = source.date
     and destination.amount_cents = source.amount_cents
     and destination.currency = source.currency
     and destination.is_pending = source.is_pending
     and destination.normalized_description = source.normalized_description
     and destination.occurrence = source.occurrence
  )
  select
    coalesce(array_agg(source_id order by source_id), array[]::uuid[]),
    coalesce(array_agg(destination_id order by source_id), array[]::uuid[])
    into source_duplicate_ids, destination_duplicate_ids
    from overlap;

  -- Keep destination edits, while filling genuinely missing metadata and
  -- retaining the safest combined visibility/review state.
  with pairs as (
    select
      source.id as source_id,
      destination.id as destination_id
    from unnest(source_duplicate_ids) with ordinality source(id, position)
    join unnest(destination_duplicate_ids) with ordinality destination(id, position)
      using (position)
  )
  update public.transactions destination
     set notes = coalesce(destination.notes, source.notes),
         category_id = coalesce(destination.category_id, source.category_id),
         merchant_id = coalesce(destination.merchant_id, source.merchant_id),
         is_hidden = destination.is_hidden or source.is_hidden,
         needs_review = destination.needs_review and source.needs_review,
         description = case
           when destination.description = coalesce(
             destination.original_description,
             destination.description
           )
            and source.description is distinct from coalesce(
              source.original_description,
              source.description
            )
             then source.description
           else destination.description
         end
    from pairs
    join public.transactions source on source.id = pairs.source_id
   where destination.id = pairs.destination_id;

  with pairs as (
    select
      source.id as source_id,
      destination.id as destination_id
    from unnest(source_duplicate_ids) with ordinality source(id, position)
    join unnest(destination_duplicate_ids) with ordinality destination(id, position)
      using (position)
  )
  insert into public.transaction_tags (household_id, transaction_id, tag_id)
  select
    destination.household_id,
    pairs.destination_id,
    source_tag.tag_id
  from pairs
  join public.transactions destination on destination.id = pairs.destination_id
  join public.transaction_tags source_tag
    on source_tag.transaction_id = pairs.source_id
  on conflict (transaction_id, tag_id) do nothing;

  -- Preserve an existing source transfer only when the destination duplicate
  -- is not already paired; otherwise unlink the archived side cleanly.
  with pairs as (
    select
      source.id as source_id,
      destination.id as destination_id
    from unnest(source_duplicate_ids) with ordinality source(id, position)
    join unnest(destination_duplicate_ids) with ordinality destination(id, position)
      using (position)
  ),
  transferable as (
    select
      pairs.source_id,
      pairs.destination_id,
      source.transfer_pair_id
    from pairs
    join public.transactions source on source.id = pairs.source_id
    join public.transactions destination on destination.id = pairs.destination_id
    join public.transactions counterpart on counterpart.id = source.transfer_pair_id
    where source.transfer_pair_id is not null
      and destination.transfer_pair_id is null
      and counterpart.deleted_at is null
  )
  update public.transactions counterpart
     set transfer_pair_id = transferable.destination_id
    from transferable
   where counterpart.id = transferable.transfer_pair_id;

  with pairs as (
    select
      source.id as source_id,
      destination.id as destination_id
    from unnest(source_duplicate_ids) with ordinality source(id, position)
    join unnest(destination_duplicate_ids) with ordinality destination(id, position)
      using (position)
  )
  update public.transactions destination
     set transfer_pair_id = source.transfer_pair_id
    from pairs
    join public.transactions source on source.id = pairs.source_id
    join public.transactions counterpart on counterpart.id = source.transfer_pair_id
   where destination.id = pairs.destination_id
     and destination.transfer_pair_id is null
     and source.transfer_pair_id is not null
     and counterpart.deleted_at is null;

  update public.transactions counterpart
     set transfer_pair_id = null
   where counterpart.transfer_pair_id = any(source_duplicate_ids);

  insert into public.account_balances (
    household_id,
    account_id,
    date,
    balance_cents
  )
  select
    source_balance.household_id,
    p_destination_account_id,
    source_balance.date,
    source_balance.balance_cents
  from public.account_balances source_balance
  where source_balance.account_id = p_source_account_id
  on conflict (account_id, date) do nothing;

  -- A unique source transaction can keep its transfer when the counterpart is
  -- still on a different account after the move. If the counterpart already
  -- lives on the destination account, unlink both rows first so the merge
  -- cannot create an impossible same-account transfer.
  with invalid_pair_ids as (
    select source.id
    from public.transactions source
    join public.transactions counterpart
      on counterpart.id = source.transfer_pair_id
    where source.account_id = p_source_account_id
      and source.deleted_at is null
      and source.transfer_pair_id is not null
      and not (source.id = any(source_duplicate_ids))
      and counterpart.account_id = p_destination_account_id

    union

    select source.transfer_pair_id
    from public.transactions source
    join public.transactions counterpart
      on counterpart.id = source.transfer_pair_id
    where source.account_id = p_source_account_id
      and source.deleted_at is null
      and source.transfer_pair_id is not null
      and not (source.id = any(source_duplicate_ids))
      and counterpart.account_id = p_destination_account_id
  )
  update public.transactions transaction
     set transfer_pair_id = null
   where transaction.id in (select id from invalid_pair_ids);

  -- Move unique roots and their children. Overlapping roots and their split
  -- children remain on the archived account as a recoverable tombstone.
  update public.transactions transaction
     set account_id = p_destination_account_id
   where transaction.account_id = p_source_account_id
     and transaction.deleted_at is null
     and not (transaction.id = any(source_duplicate_ids))
     and (
       transaction.parent_id is null
       or not (transaction.parent_id = any(source_duplicate_ids))
     );

  update public.transactions transaction
     set deleted_at = coalesce(transaction.deleted_at, archived_at),
         is_hidden = true,
         transfer_pair_id = null
   where transaction.account_id = p_source_account_id
     and (
       transaction.id = any(source_duplicate_ids)
       or transaction.parent_id = any(source_duplicate_ids)
     );

  update public.accounts
     set deleted_at = archived_at,
         is_hidden = true,
         include_in_net_worth = false,
         merged_into_account_id = p_destination_account_id,
         merged_at = archived_at,
         merged_by_user_id = auth.uid()
   where id = p_source_account_id;

  return query
  select
    preview.source_transaction_count,
    preview.overlapping_transaction_count,
    preview.transaction_count_to_move,
    preview.source_balance_count,
    preview.balance_dates_to_copy,
    preview.source_item_will_be_empty;
end;
$$;

-- -------------------------------------------------------------- transfer match

create or replace function public.transfer_candidates(
  p_transaction_id uuid
)
returns table (
  id uuid,
  account_id uuid,
  account_name text,
  date date,
  amount_cents bigint,
  currency char(3),
  description text,
  days_apart integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  source_transaction public.transactions%rowtype;
begin
  select transaction.*
    into source_transaction
    from public.transactions transaction
    join public.accounts account on account.id = transaction.account_id
   where transaction.id = p_transaction_id
     and transaction.household_id in (select public.current_household_ids())
     and transaction.deleted_at is null
     and not transaction.is_hidden
     and not transaction.is_pending
     and transaction.parent_id is null
     and not transaction.has_splits
     and transaction.transfer_pair_id is null
     and transaction.amount_cents <> 0
     and account.deleted_at is null;

  if not found then
    return;
  end if;

  return query
  select
    candidate.id,
    candidate.account_id,
    account.name,
    candidate.date,
    candidate.amount_cents,
    candidate.currency,
    candidate.description,
    abs(candidate.date - source_transaction.date)
  from public.transactions candidate
  join public.accounts account on account.id = candidate.account_id
  where candidate.household_id = source_transaction.household_id
    and candidate.id <> source_transaction.id
    and candidate.account_id <> source_transaction.account_id
    and candidate.deleted_at is null
    and not candidate.is_hidden
    and not candidate.is_pending
    and candidate.parent_id is null
    and not candidate.has_splits
    and candidate.transfer_pair_id is null
    and candidate.currency = source_transaction.currency
    and candidate.amount_cents = -source_transaction.amount_cents
    and abs(candidate.date - source_transaction.date) <= 7
    and account.deleted_at is null
  order by
    abs(candidate.date - source_transaction.date),
    candidate.date desc,
    candidate.created_at desc,
    candidate.id
  limit 10;
end;
$$;

create or replace function public.link_transfer_pair(
  p_transaction_id uuid,
  p_counterpart_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  source_transaction public.transactions%rowtype;
  counterpart public.transactions%rowtype;
  locked_transaction_count integer;
begin
  if p_transaction_id = p_counterpart_id then
    raise exception 'Choose two different transactions' using errcode = '22023';
  end if;

  perform 1
    from public.transactions
   where id in (p_transaction_id, p_counterpart_id)
     and household_id in (select public.current_household_ids())
   order by id
   for update;

  get diagnostics locked_transaction_count = row_count;
  if locked_transaction_count <> 2 then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;

  select *
    into source_transaction
    from public.transactions
   where id = p_transaction_id
     and household_id in (select public.current_household_ids());

  select *
    into counterpart
    from public.transactions
   where id = p_counterpart_id
     and household_id in (select public.current_household_ids());

  if source_transaction.id is null or counterpart.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;

  if source_transaction.household_id <> counterpart.household_id
     or source_transaction.account_id = counterpart.account_id
     or source_transaction.currency <> counterpart.currency
     or source_transaction.amount_cents <> -counterpart.amount_cents
     or abs(source_transaction.date - counterpart.date) > 7
     or source_transaction.deleted_at is not null
     or counterpart.deleted_at is not null
     or source_transaction.is_hidden
     or counterpart.is_hidden
     or source_transaction.is_pending
     or counterpart.is_pending
     or source_transaction.parent_id is not null
     or counterpart.parent_id is not null
     or source_transaction.has_splits
     or counterpart.has_splits then
    raise exception 'These transactions are not a valid transfer pair'
      using errcode = '22023';
  end if;

  if source_transaction.transfer_pair_id = counterpart.id
     and counterpart.transfer_pair_id = source_transaction.id then
    return;
  end if;

  if source_transaction.transfer_pair_id is not null
     or counterpart.transfer_pair_id is not null then
    raise exception 'One of these transactions is already linked'
      using errcode = '23505';
  end if;

  update public.transactions
     set transfer_pair_id = case
       when id = source_transaction.id then counterpart.id
       else source_transaction.id
     end
   where id in (source_transaction.id, counterpart.id);
end;
$$;

create or replace function public.unlink_transfer_pair(
  p_transaction_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  source_transaction public.transactions%rowtype;
begin
  select *
    into source_transaction
    from public.transactions
   where id = p_transaction_id
     and household_id in (select public.current_household_ids())
   for update;

  if source_transaction.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;

  if source_transaction.transfer_pair_id is null then
    return;
  end if;

  perform 1
    from public.transactions
   where id = source_transaction.transfer_pair_id
   for update;

  update public.transactions
     set transfer_pair_id = null
   where id in (source_transaction.id, source_transaction.transfer_pair_id)
     and household_id = source_transaction.household_id;
end;
$$;

-- Editing a paired row in a way that changes the identity of the movement
-- should not leave a misleading match behind. Description/category/notes edits
-- keep the pair; amount/date/currency or reporting-state edits unlink
-- both sides automatically.
create or replace function public.prepare_transfer_unlink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.transfer_pair_id is null then
    return new;
  end if;

  if new.transfer_pair_id is null
     or (
       new.transfer_pair_id = old.transfer_pair_id
       and (
         new.date is distinct from old.date
         or new.amount_cents is distinct from old.amount_cents
         or new.currency is distinct from old.currency
         or new.is_pending is distinct from old.is_pending
         or new.is_hidden is distinct from old.is_hidden
         or new.deleted_at is distinct from old.deleted_at
         or new.parent_id is distinct from old.parent_id
         or new.has_splits is distinct from old.has_splits
       )
     ) then
    new.transfer_pair_id := null;
  end if;

  return new;
end;
$$;

create trigger transactions_prepare_invalid_transfer_unlink
before update on public.transactions
for each row
execute function public.prepare_transfer_unlink();

-- The counterpart update is deferred until the outer statement has finished.
-- An immediate row trigger would collide with `unlink_transfer_pair`, whose
-- single UPDATE intentionally touches both rows.
create or replace function public.complete_transfer_unlink()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_pair_id uuid;
begin
  select transfer_pair_id
    into current_pair_id
    from public.transactions
   where id = new.id;

  if found and current_pair_id is null then
    update public.transactions
       set transfer_pair_id = null
     where id = old.transfer_pair_id
       and transfer_pair_id = old.id;
  end if;

  return null;
end;
$$;

create constraint trigger transactions_aa_complete_transfer_unlink
after update on public.transactions
deferrable initially deferred
for each row
when (old.transfer_pair_id is not null)
execute function public.complete_transfer_unlink();

-- A deferred constraint sees both sides after a multi-row update has finished.
-- It also prevents a direct table update from creating an asymmetric pair and
-- protects reports even if a future client bypasses the RPC helpers.
create or replace function public.assert_transfer_pair_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_transaction public.transactions%rowtype;
  counterpart public.transactions%rowtype;
begin
  select *
    into current_transaction
    from public.transactions
   where id = new.id;

  if not found or current_transaction.transfer_pair_id is null then
    return null;
  end if;

  select *
    into counterpart
    from public.transactions
   where id = current_transaction.transfer_pair_id;

  if not found
     or counterpart.transfer_pair_id is distinct from current_transaction.id
     or counterpart.household_id <> current_transaction.household_id
     or counterpart.account_id = current_transaction.account_id
     or counterpart.currency <> current_transaction.currency
     or counterpart.amount_cents <> -current_transaction.amount_cents
     or abs(counterpart.date - current_transaction.date) > 7
     or counterpart.deleted_at is not null
     or current_transaction.deleted_at is not null
     or counterpart.is_hidden
     or current_transaction.is_hidden
     or counterpart.is_pending
     or current_transaction.is_pending
     or counterpart.parent_id is not null
     or current_transaction.parent_id is not null
     or counterpart.has_splits
     or current_transaction.has_splits then
    raise exception 'Transfer pair integrity check failed'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger transactions_transfer_pair_insert_integrity
after insert on public.transactions
deferrable initially deferred
for each row
when (new.transfer_pair_id is not null)
execute function public.assert_transfer_pair_integrity();

create constraint trigger transactions_transfer_pair_update_integrity
after update on public.transactions
deferrable initially deferred
for each row
when (
  new.transfer_pair_id is not null
  or old.transfer_pair_id is not null
)
execute function public.assert_transfer_pair_integrity();

revoke all on function public.account_merge_preview(uuid, uuid) from public;
revoke all on function public.merge_duplicate_accounts(uuid, uuid) from public;
revoke all on function public.transfer_candidates(uuid) from public;
revoke all on function public.link_transfer_pair(uuid, uuid) from public;
revoke all on function public.unlink_transfer_pair(uuid) from public;
revoke all on function public.prepare_transfer_unlink() from public;
revoke all on function public.complete_transfer_unlink() from public;
revoke all on function public.assert_transfer_pair_integrity() from public;

grant execute on function public.account_merge_preview(uuid, uuid) to authenticated;
grant execute on function public.merge_duplicate_accounts(uuid, uuid) to authenticated;
grant execute on function public.transfer_candidates(uuid) to authenticated;
grant execute on function public.link_transfer_pair(uuid, uuid) to authenticated;
grant execute on function public.unlink_transfer_pair(uuid) to authenticated;
