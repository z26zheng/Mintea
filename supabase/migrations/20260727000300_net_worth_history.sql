-- Do not invent a zero balance before a household's first real snapshot.
--
-- The chart requests broad preset ranges (for example, six months), but a
-- newly linked household may only have a snapshot from today. Starting the
-- generated series at p_start made every earlier day appear to be $0, which
-- produced a misleading full-net-worth gain or loss on first connection.
create or replace function public.net_worth_series(p_start date, p_end date)
returns table (
  day               date,
  assets_cents      bigint,
  liabilities_cents bigint,
  net_cents         bigint
)
language sql
stable
as $$
  with acct as (
    select a.id, a.is_asset
    from accounts a
    where a.household_id in (select current_household_ids())
      and a.deleted_at is null
      and a.include_in_net_worth
  ),
  bounds as (
    select min(ab.date) as first_snapshot
    from account_balances ab
    join acct on acct.id = ab.account_id
  ),
  days as (
    select generate_series(
      greatest(p_start, bounds.first_snapshot),
      p_end,
      interval '1 day'
    )::date as d
    from bounds
    where bounds.first_snapshot is not null
      and greatest(p_start, bounds.first_snapshot) <= p_end
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
