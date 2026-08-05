-- P3.1: monthly category plans. Rollovers and targets intentionally arrive in
-- later migrations: this table records one clear promise per category/month.

create table budget_category_plans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households (id) on delete cascade,
  category_id   uuid not null references categories (id) on delete cascade,
  month         date not null check (month = date_trunc('month', month)::date),
  planned_cents bigint not null check (planned_cents >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (category_id, month)
);

create index budget_category_plans_household_month_idx
  on budget_category_plans (household_id, month);

create trigger budget_category_plans_updated_at
before update on budget_category_plans
for each row execute function set_updated_at();

alter table budget_category_plans enable row level security;

create policy budget_category_plans_rw on budget_category_plans
  for all to authenticated
  using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

grant select, insert, update, delete on budget_category_plans to authenticated;
