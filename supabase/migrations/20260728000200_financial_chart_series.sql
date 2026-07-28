-- Daily balance and cash-flow history for the dashboard's selectable charts.
--
-- Balance columns deliberately remain null before the household's first real
-- snapshot. Cash flow can begin earlier because Plaid may import historical
-- transactions when an account is first connected.
create or replace function public.financial_chart_series(
  p_start date,
  p_end date
)
returns table (
  day                date,
  assets_cents       bigint,
  liabilities_cents  bigint,
  cash_cents         bigint,
  net_cents          bigint,
  cash_flow_cents    bigint
)
language sql
stable
set search_path = public
as $$
  with acct as (
    select a.id, a.type, a.is_asset
    from public.accounts a
    where a.household_id in (select public.current_household_ids())
      and a.deleted_at is null
      and a.include_in_net_worth
  ),
  balance_bounds as (
    select min(ab.date) as first_snapshot
    from public.account_balances ab
    join acct on acct.id = ab.account_id
  ),
  days as (
    select generate_series(p_start, p_end, interval '1 day')::date as d
    where p_start <= p_end
  ),
  balances as (
    select
      days.d,
      coalesce(
        sum(balance.balance_cents) filter (where acct.is_asset),
        0
      )::bigint as assets_cents,
      coalesce(
        sum(balance.balance_cents) filter (where not acct.is_asset),
        0
      )::bigint as liabilities_cents,
      coalesce(
        sum(balance.balance_cents)
          filter (where acct.type = 'depository' and acct.is_asset),
        0
      )::bigint as cash_cents,
      coalesce(sum(balance.balance_cents), 0)::bigint as net_cents
    from days
    cross join balance_bounds
    cross join acct
    left join lateral (
      select ab.balance_cents
      from public.account_balances ab
      where ab.account_id = acct.id
        and ab.date <= days.d
      order by ab.date desc
      limit 1
    ) balance on true
    where balance_bounds.first_snapshot is not null
      and days.d >= balance_bounds.first_snapshot
    group by days.d
  ),
  cash_flow as (
    select
      t.date as d,
      sum(t.amount_cents)::bigint as cash_flow_cents
    from public.transactions t
    left join public.categories c on c.id = t.category_id
    left join public.category_groups cg on cg.id = c.group_id
    where t.household_id in (
      select public.current_household_ids()
    )
      and t.date between p_start and p_end
      and not t.is_hidden
      and not t.is_pending
      -- Split children carry the categorized amounts; their parent does not.
      and not t.has_splits
      -- Exclude both automatically matched and manually categorized transfers.
      and t.transfer_pair_id is null
      and cg.type is distinct from 'transfer'
    group by t.date
  )
  select
    days.d,
    balances.assets_cents,
    balances.liabilities_cents,
    balances.cash_cents,
    balances.net_cents,
    coalesce(cash_flow.cash_flow_cents, 0)::bigint
  from days
  left join balances on balances.d = days.d
  left join cash_flow on cash_flow.d = days.d
  order by days.d;
$$;

revoke all on function public.financial_chart_series(date, date) from public;
grant execute on function public.financial_chart_series(date, date) to authenticated;
