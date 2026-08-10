import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type NotificationClass = 'condition' | 'event';
export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';

export type NotificationInput = {
  householdId: string;
  recipientUserId: string;
  notificationKey: string;
  notificationClass: NotificationClass;
  notificationKind: string;
  severity: NotificationSeverity;
  icon: string;
  title: string;
  message: string;
  actionLabel: string;
  href: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

type NotificationRow = {
  id: string;
  recipient_user_id: string;
  notification_key: string;
  notification_class: NotificationClass;
  notification_kind: string;
  severity: NotificationSeverity;
  icon: string;
  title: string;
  message: string;
  action_label: string;
  href: string;
  payload: Record<string, unknown>;
  version: number;
  occurred_at: string;
  resolved_at: string | null;
};

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message ?? fallback);
}

async function ensureDelivery(
  admin: SupabaseClient,
  notification: Pick<NotificationRow, 'id' | 'recipient_user_id' | 'version'>,
): Promise<void> {
  const { error } = await admin.from('notification_deliveries').upsert(
    {
      notification_id: notification.id,
      recipient_user_id: notification.recipient_user_id,
      channel: 'email',
      notification_version: notification.version,
      idempotency_key: `notification/${notification.id}/${notification.version}`,
    },
    { onConflict: 'notification_id,channel', ignoreDuplicates: true },
  );

  if (error) fail(error, 'Could not enqueue notification email');
}

/** Upserts a stable condition and reopens it with a new delivery version. */
export async function upsertConditionNotification(
  admin: SupabaseClient,
  input: NotificationInput,
): Promise<NotificationRow> {
  const { data: existing, error: lookupError } = await admin
    .from('notifications')
    .select('id, recipient_user_id, notification_key, version, resolved_at')
    .eq('recipient_user_id', input.recipientUserId)
    .eq('notification_key', input.notificationKey)
    .maybeSingle();

  if (lookupError) fail(lookupError, 'Could not load notification state');

  const nextVersion = existing && existing.resolved_at ? existing.version + 1 : existing?.version ?? 1;
  const { data: notification, error } = await admin
    .from('notifications')
    .upsert(
      {
        household_id: input.householdId,
        recipient_user_id: input.recipientUserId,
        notification_key: input.notificationKey,
        notification_class: input.notificationClass,
        notification_kind: input.notificationKind,
        severity: input.severity,
        icon: input.icon,
        title: input.title,
        message: input.message,
        action_label: input.actionLabel,
        href: input.href,
        payload: input.payload ?? {},
        version: nextVersion,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        resolved_at: null,
      },
      { onConflict: 'recipient_user_id,notification_key' },
    )
    .select(
      'id, recipient_user_id, notification_key, notification_class, notification_kind, severity, icon, title, message, action_label, href, payload, version, occurred_at, resolved_at',
    )
    .single();

  if (error || !notification) fail(error, 'Could not save notification');

  const typed = notification as NotificationRow;

  if (existing?.resolved_at) {
    const { error: deliveryError } = await admin
      .from('notification_deliveries')
      .update({
        status: 'pending',
        notification_version: typed.version,
        idempotency_key: `notification/${typed.id}/${typed.version}`,
        provider_id: null,
        attempts: 0,
        available_at: new Date().toISOString(),
        sent_at: null,
        last_error: null,
      })
      .eq('notification_id', typed.id)
      .eq('channel', 'email');

    if (deliveryError) fail(deliveryError, 'Could not reopen notification email');
  }

  await ensureDelivery(admin, typed);
  return typed;
}

/** Inserts a discrete event once; the database trigger creates its outbox row. */
export async function insertEventNotification(
  admin: SupabaseClient,
  input: NotificationInput,
): Promise<void> {
  const { error } = await admin.from('notifications').upsert(
    {
      household_id: input.householdId,
      recipient_user_id: input.recipientUserId,
      notification_key: input.notificationKey,
      notification_class: 'event',
      notification_kind: input.notificationKind,
      severity: input.severity,
      icon: input.icon,
      title: input.title,
      message: input.message,
      action_label: input.actionLabel,
      href: input.href,
      payload: input.payload ?? {},
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    },
    { onConflict: 'recipient_user_id,notification_key', ignoreDuplicates: true },
  );

  if (error) fail(error, 'Could not save notification event');
}

/** Resolves only the condition families owned by one evaluator. */
export async function resolveMissingConditions(
  admin: SupabaseClient,
  householdId: string,
  scopePrefixes: string[],
  activeKeys: Set<string>,
  now = new Date().toISOString(),
): Promise<number> {
  const { data, error } = await admin
    .from('notifications')
    .select('id, recipient_user_id, notification_key')
    .eq('household_id', householdId)
    .eq('notification_class', 'condition')
    .is('resolved_at', null);

  if (error) fail(error, 'Could not load active notification conditions');

  let resolved = 0;
  for (const row of data ?? []) {
    const key = row.notification_key as string;
    if (!scopePrefixes.some((prefix) => key.startsWith(prefix))) continue;
    if (activeKeys.has(`${row.recipient_user_id as string}::${key}`)) continue;

    const { error: updateError } = await admin
      .from('notifications')
      .update({ resolved_at: now })
      .eq('id', row.id as string)
      .is('resolved_at', null);
    if (updateError) fail(updateError, 'Could not resolve notification condition');

    const { error: deliveryError } = await admin
      .from('notification_deliveries')
      .update({ status: 'suppressed', last_error: 'Condition resolved before delivery' })
      .eq('notification_id', row.id as string)
      .eq('channel', 'email')
      .in('status', ['pending', 'failed']);
    if (deliveryError) fail(deliveryError, 'Could not close resolved email delivery');
    resolved += 1;
  }

  return resolved;
}
