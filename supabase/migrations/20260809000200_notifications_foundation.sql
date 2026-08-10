-- P11: in-app notification interaction state.
--
-- Derived conditions are deliberately not stored here. The app computes them
-- from current connection/account state and uses this table only for the
-- signed-in recipient's read and temporary-dismiss choices.

create table notification_states (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  notification_key  text not null check (length(trim(notification_key)) > 0),
  read_at           timestamptz,
  dismissed_until   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, notification_key)
);

create index notification_states_recipient_idx
  on notification_states (household_id, user_id, updated_at desc);

create trigger notification_states_updated_at
before update on notification_states
for each row execute function set_updated_at();

alter table notification_states enable row level security;

create policy notification_states_rw on notification_states
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and household_id in (select current_household_ids())
  )
  with check (
    user_id = (select auth.uid())
    and household_id in (select current_household_ids())
  );

grant select, insert, update, delete on notification_states to authenticated;
