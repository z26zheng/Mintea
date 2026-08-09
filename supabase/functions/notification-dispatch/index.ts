import { handler, json } from '../_shared/http.ts';
import { sendEmail } from '../_shared/email.ts';
import { notificationEmail } from '../_shared/emailTemplates.ts';
import { requireCaller } from '../_shared/supabase.ts';

type DeliveryRow = {
  id: string;
  notification_id: string;
  attempts: number;
  idempotency_key: string;
};
type NotificationRow = {
  id: string;
  recipient_user_id: string;
  notification_key: string;
  notification_kind: string;
  title: string;
  message: string;
  action_label: string;
  href: string;
  resolved_at: string | null;
};
type PreferenceRow = {
  email_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

const APP_URL = () =>
  (Deno.env.get('MINTEA_APP_URL')?.trim() || 'https://mintea-seven.vercel.app').replace(/\/$/, '');

function timeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

function localMinutes(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

function isQuietHours(now: Date, preference: PreferenceRow | null): boolean {
  if (!preference) return false;
  const start = timeToMinutes(preference.quiet_hours_start);
  const end = timeToMinutes(preference.quiet_hours_end);
  const current = localMinutes(now, preference.timezone);
  if (start === null || end === null || current === null || start === end) return false;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

async function suppress(
  admin: any,
  deliveryId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin
    .from('notification_deliveries')
    .update({ status: 'suppressed', last_error: reason })
    .eq('id', deliveryId);
  if (error) throw new Error(error.message);
}

async function dispatchOne(
  admin: any,
  delivery: DeliveryRow,
  callerUserId: string,
): Promise<'sent' | 'suppressed' | 'failed' | 'skipped'> {
  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select(
      'id, recipient_user_id, notification_key, notification_kind, title, message, action_label, href, resolved_at',
    )
    .eq('id', delivery.notification_id)
    .eq('recipient_user_id', callerUserId)
    .maybeSingle();
  if (notificationError) throw new Error(notificationError.message);
  if (!notification) return 'skipped';

  const row = notification as NotificationRow;
  const { data: claimed, error: claimError } = await admin
    .from('notification_deliveries')
    .update({ status: 'sending', attempts: delivery.attempts + 1, last_error: null })
    .eq('id', delivery.id)
    .in('status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return 'skipped';

  const finish = async (status: string, fields: Record<string, unknown> = {}) => {
    const { error } = await admin
      .from('notification_deliveries')
      .update({ status, ...fields })
      .eq('id', delivery.id);
    if (error) throw new Error(error.message);
  };

  const { data: state, error: stateError } = await admin
    .from('notification_states')
    .select('read_at, dismissed_until')
    .eq('user_id', callerUserId)
    .eq('notification_key', row.notification_key)
    .maybeSingle();
  if (stateError) throw new Error(stateError.message);
  const dismissedUntil = state?.dismissed_until ? new Date(state.dismissed_until as string) : null;
  if (
    row.resolved_at ||
    state?.read_at ||
    (dismissedUntil && dismissedUntil.getTime() > Date.now())
  ) {
    await finish('suppressed', { last_error: row.resolved_at ? 'Condition resolved' : 'Already handled in app' });
    return 'suppressed';
  }

  const { data: preference, error: preferenceError } = await admin
    .from('notification_preferences')
    .select('email_enabled, quiet_hours_start, quiet_hours_end, timezone')
    .eq('user_id', callerUserId)
    .eq('notification_kind', row.notification_kind)
    .maybeSingle();
  if (preferenceError) throw new Error(preferenceError.message);
  const typedPreference = (preference as PreferenceRow | null) ?? null;

  if (typedPreference && !typedPreference.email_enabled) {
    await finish('suppressed', { last_error: 'Email disabled for this notification kind' });
    return 'suppressed';
  }

  const now = new Date();
  if (isQuietHours(now, typedPreference)) {
    await finish('pending', {
      available_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      last_error: 'Held for quiet hours',
    });
    return 'skipped';
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(callerUserId);
  if (authError || !authUser.user?.email) {
    await finish('failed', { last_error: 'Recipient has no email address' });
    return 'failed';
  }
  const email = authUser.user.email.toLowerCase();

  const { data: suppression, error: suppressionError } = await admin
    .from('notification_email_suppressions')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (suppressionError) throw new Error(suppressionError.message);
  if (suppression) {
    await finish('suppressed', { last_error: 'Recipient email is suppressed' });
    return 'suppressed';
  }

  try {
    const content = notificationEmail({
      title: row.title,
      message: row.message,
      action: {
        label: row.action_label,
        url: `${APP_URL()}${row.href.startsWith('/') ? row.href : `/${row.href}`}`,
      },
    });
    const sent = await sendEmail({
      to: email,
      subject: `Mintea: ${row.title}`,
      html: content.html,
      text: content.text,
      idempotencyKey: delivery.idempotency_key,
    });
    await finish('sent', {
      provider_id: sent.id,
      sent_at: new Date().toISOString(),
      last_error: null,
    });
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed';
    const next = delivery.attempts >= 5 ? 'suppressed' : 'failed';
    await finish(next, {
      last_error: message.slice(0, 500),
      available_at: new Date(Date.now() + Math.min(60, 2 ** delivery.attempts) * 60 * 1000).toISOString(),
    });
    return 'failed';
  }
}

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const abandonedBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { error: recoveryError } = await caller.admin
      .from('notification_deliveries')
      .update({ status: 'failed', last_error: 'Recovered an abandoned email attempt' })
      .eq('recipient_user_id', caller.userId)
      .eq('channel', 'email')
      .eq('status', 'sending')
      .lt('updated_at', abandonedBefore);
    if (recoveryError) throw new Error(recoveryError.message);

    const { data: deliveries, error } = await caller.admin
      .from('notification_deliveries')
      .select('id, notification_id, attempts, idempotency_key')
      .eq('recipient_user_id', caller.userId)
      .eq('channel', 'email')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 5)
      .lte('available_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(25);
    if (error) throw new Error(error.message);

    const results = { attempted: 0, sent: 0, suppressed: 0, failed: 0 };
    for (const delivery of (deliveries ?? []) as DeliveryRow[]) {
      const result = await dispatchOne(caller.admin, delivery, caller.userId);
      if (result === 'skipped') continue;
      results.attempted += 1;
      results[result] += 1;
    }

    return json(results);
  }),
);
