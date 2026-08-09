-- P11: durable notification records and the email outbox.
--
-- `notification_states` remains the recipient's interaction state. These
-- tables hold the source record and delivery bookkeeping so evaluating a
-- condition twice cannot create two emails, and a discrete family event is
-- not lost when nobody has the app open.

create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households (id) on delete cascade,
  recipient_user_id   uuid not null references auth.users (id) on delete cascade,
  notification_key    text not null check (length(trim(notification_key)) > 0),
  notification_class  text not null check (notification_class in ('condition', 'event')),
  notification_kind   text not null check (length(trim(notification_kind)) > 0),
  severity            text not null check (severity in ('critical', 'warning', 'info', 'success')),
  icon                text not null check (length(trim(icon)) > 0),
  title               text not null check (length(trim(title)) > 0),
  message             text not null check (length(trim(message)) > 0),
  action_label        text not null check (length(trim(action_label)) > 0),
  href                text not null check (length(trim(href)) > 0),
  payload             jsonb not null default '{}'::jsonb,
  version             integer not null default 1 check (version > 0),
  occurred_at         timestamptz not null default now(),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (recipient_user_id, notification_key)
);

create index notifications_recipient_active_idx
  on notifications (household_id, recipient_user_id, resolved_at, occurred_at desc);

create index notifications_household_kind_idx
  on notifications (household_id, notification_kind, resolved_at);

create trigger notifications_updated_at
before update on notifications
for each row execute function set_updated_at();

create table notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  notification_id     uuid not null references notifications (id) on delete cascade,
  recipient_user_id   uuid not null references auth.users (id) on delete cascade,
  channel             text not null check (channel in ('email')),
  status              text not null default 'pending'
                      check (status in ('pending', 'sending', 'sent', 'failed', 'suppressed')),
  notification_version integer not null default 1 check (notification_version > 0),
  idempotency_key     text not null unique,
  provider_id         text,
  attempts            integer not null default 0 check (attempts >= 0),
  available_at        timestamptz not null default now(),
  sent_at             timestamptz,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (notification_id, channel)
);

create index notification_deliveries_pending_idx
  on notification_deliveries (status, available_at, created_at);

create index notification_deliveries_recipient_idx
  on notification_deliveries (recipient_user_id, channel, status);

create trigger notification_deliveries_updated_at
before update on notification_deliveries
for each row execute function set_updated_at();

create table notification_preferences (
  user_id             uuid not null references auth.users (id) on delete cascade,
  notification_kind   text not null check (length(trim(notification_kind)) > 0),
  email_enabled       boolean not null default true,
  quiet_hours_start   time,
  quiet_hours_end     time,
  timezone            text not null default 'UTC',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (user_id, notification_kind),
  check (
    quiet_hours_start is null
    or quiet_hours_end is null
    or quiet_hours_start <> quiet_hours_end
  )
);

create trigger notification_preferences_updated_at
before update on notification_preferences
for each row execute function set_updated_at();

-- A hard bounce or complaint is global to the sending address. This table is
-- intentionally unreachable from client roles; a future provider webhook is
-- the only writer.
create table notification_email_suppressions (
  email       text primary key check (email = lower(email)),
  reason      text not null check (length(trim(reason)) > 0),
  source      text not null default 'provider',
  created_at  timestamptz not null default now()
);

alter table notifications enable row level security;
alter table notification_deliveries enable row level security;
alter table notification_preferences enable row level security;
alter table notification_email_suppressions enable row level security;

create policy notifications_recipient_read on notifications
  for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and household_id in (select current_household_ids())
  );

create policy notification_preferences_self_rw on notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on notifications to authenticated;
grant select, insert, update, delete on notification_preferences to authenticated;
revoke all on notification_deliveries from anon, authenticated;
revoke all on notification_email_suppressions from anon, authenticated;

-- Every source record gets one durable email outbox row. Whether it is sent is
-- decided later by the dispatcher after checking read state, preferences and
-- suppression. That ordering is what prevents an in-app read from becoming a
-- redundant email.
create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_deliveries (
    notification_id,
    recipient_user_id,
    channel,
    notification_version,
    idempotency_key
  )
  values (
    new.id,
    new.recipient_user_id,
    'email',
    new.version,
    'notification/' || new.id::text || '/' || new.version::text
  )
  on conflict (notification_id, channel) do nothing;

  return new;
end;
$$;

create trigger notifications_enqueue_email
after insert on notifications
for each row execute function public.enqueue_notification_email();

-- Family membership is a database event, not a UI event. The trigger covers
-- invitation acceptance and any future server-side join path. The first
-- bootstrap member is deliberately ignored, so account creation does not send
-- a misleading "member joined" message.
create or replace function public.queue_family_member_joined_notification()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  family_member record;
  event_key text;
begin
  if (
    select count(*)
      from public.household_members
     where household_id = new.household_id
  ) < 2 then
    return new;
  end if;

  event_key := 'event:family-member-joined:'
    || new.household_id::text || ':'
    || new.user_id::text || ':'
    || to_char(new.created_at, 'YYYYMMDDHH24MISSMS');

  for family_member in
    select member.user_id
      from public.household_members as member
     where member.household_id = new.household_id
  loop
    insert into public.notifications (
      household_id,
      recipient_user_id,
      notification_key,
      notification_class,
      notification_kind,
      severity,
      icon,
      title,
      message,
      action_label,
      href,
      payload,
      occurred_at
    )
    values (
      new.household_id,
      family_member.user_id,
      event_key,
      'event',
      'family-membership',
      'info',
      'people-outline',
      'A family member joined',
      'Someone joined your family on Mintea.',
      'Review family',
      '/family',
      jsonb_build_object('member_user_id', new.user_id),
      new.created_at
    )
    on conflict (recipient_user_id, notification_key) do nothing;
  end loop;

  return new;
end;
$$;

create trigger household_members_notification_joined
after insert on household_members
for each row execute function public.queue_family_member_joined_notification();

-- A leave is emitted for the members who remain. If the household itself is
-- being deleted, there are no remaining recipients and the loop is empty.
create or replace function public.queue_family_member_left_notification()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  family_member record;
  event_key text;
begin
  event_key := 'event:family-member-left:'
    || old.household_id::text || ':'
    || old.user_id::text || ':'
    || to_char(old.created_at, 'YYYYMMDDHH24MISSMS');

  for family_member in
    select member.user_id
      from public.household_members as member
     where member.household_id = old.household_id
       and member.user_id <> old.user_id
  loop
    insert into public.notifications (
      household_id,
      recipient_user_id,
      notification_key,
      notification_class,
      notification_kind,
      severity,
      icon,
      title,
      message,
      action_label,
      href,
      payload,
      occurred_at
    )
    values (
      old.household_id,
      family_member.user_id,
      event_key,
      'event',
      'family-membership',
      'info',
      'person-remove-outline',
      'A family member left',
      'A member is no longer part of your family on Mintea.',
      'Review family',
      '/family',
      jsonb_build_object('member_user_id', old.user_id),
      now()
    )
    on conflict (recipient_user_id, notification_key) do nothing;
  end loop;

  return old;
end;
$$;

create trigger household_members_notification_left
after delete on household_members
for each row execute function public.queue_family_member_left_notification();

-- Make the notification id available to interaction rows created before the
-- event was evaluated. The key remains the public compatibility handle.
alter table notification_states
  add column notification_id uuid references notifications (id) on delete cascade;

create index notification_states_notification_idx
  on notification_states (notification_id);

comment on table notifications is
  'P11 source records: active conditions and durable discrete events, one recipient per row.';
comment on table notification_deliveries is
  'P11 durable channel outbox and provider retry/dedup state.';
comment on table notification_states is
  'P11 per-recipient interaction state linked to a source notification when available.';
