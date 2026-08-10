import { invokeFunction, unwrap, type MinteaClient } from './client';
import { fetchAccounts, fetchPlaidItems, attachInstitutions } from './accounts';
import { fetchProfile } from './session';
import { assessConnection } from '../domain/connectionHealth';
import { findDuplicateAccountCandidates } from '../domain/dataTrust';
import {
  applyNotificationStates,
  buildDerivedNotifications,
  type InAppNotification,
  type StoredNotification,
} from '../domain/notifications';
import type { NotificationRow, NotificationStateRow } from '../types/database';

const DEFAULT_DERIVED_DISMISSAL_MS = 24 * 60 * 60 * 1000;

export type NotificationEvaluationResult = {
  evaluated: true;
  month: string;
  notificationsUpserted: number;
  conditionsResolved: number;
};

export type NotificationDispatchResult = {
  attempted: number;
  sent: number;
  suppressed: number;
  failed: number;
};

/** Runs the server-owned condition evaluators for the caller's household. */
export function evaluateNotifications(
  client: MinteaClient,
): Promise<NotificationEvaluationResult> {
  return invokeFunction<NotificationEvaluationResult>(
    client,
    'notification-evaluate',
  );
}

/** Drains the caller's email outbox using its current read/preferences state. */
export function dispatchNotificationEmails(
  client: MinteaClient,
): Promise<NotificationDispatchResult> {
  return invokeFunction<NotificationDispatchResult>(
    client,
    'notification-dispatch',
  );
}

/** Only recipient interaction state is persisted; conditions are recomputed. */
export async function fetchNotificationStates(
  client: MinteaClient,
): Promise<NotificationStateRow[]> {
  return unwrap(
    await client
      .from('notification_states')
      .select('*')
      .order('updated_at', { ascending: false }),
  );
}

/**
 * Reads the server-owned notification source records. The first P11 client
 * slice predates the durable table, so a missing table is treated as an empty
 * result and the immediate derived fallback below keeps older development
 * projects usable until their migrations are applied.
 */
export async function fetchStoredNotifications(
  client: MinteaClient,
): Promise<StoredNotification[]> {
  const { data, error } = await client
    .from('notifications')
    .select('*')
    .is('resolved_at', null)
    .order('occurred_at', { ascending: false });

  if (error || !data) return [];

  return (data as NotificationRow[]).map((row) => ({
    id: row.id,
    key: row.notification_key,
    class: row.notification_class,
    kind: row.notification_kind as StoredNotification['kind'],
    severity: row.severity,
    icon: row.icon,
    title: row.title,
    message: row.message,
    actionLabel: row.action_label,
    href: row.href,
    payload:
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    occurredAt: row.occurred_at,
    resolvedAt: row.resolved_at,
    version: row.version,
  }));
}

/**
 * Rebuilds the current notification centre from source-of-truth product data.
 * A fixed connection or reviewed duplicate disappears on the next refetch
 * without a cleanup job having to delete a notification row.
 */
export async function fetchInAppNotifications(
  client: MinteaClient,
  now = new Date(),
): Promise<InAppNotification[]> {
  const [accounts, items, states, stored] = await Promise.all([
    fetchAccounts(client),
    fetchPlaidItems(client),
    fetchNotificationStates(client),
    fetchStoredNotifications(client),
  ]);

  const accountsWithInstitutions = attachInstitutions(accounts, items);
  const connections = items.map((item) => ({
    id: item.id,
    institutionName: item.institution_name,
    health: assessConnection(item, now),
  }));
  const duplicateCount = findDuplicateAccountCandidates(
    accountsWithInstitutions,
  ).length;

  const derived = buildDerivedNotifications(connections, duplicateCount);
  const storedKeys = new Set(stored.map((notification) => notification.key));

  return applyNotificationStates(
    [
      ...stored,
      ...derived.filter((notification) => !storedKeys.has(notification.key)),
    ],
    states,
    now,
  );
}

async function saveNotificationState(
  client: MinteaClient,
  input: {
    notificationKey: string;
    readAt: string | null;
    dismissedUntil: string | null;
  },
): Promise<NotificationStateRow> {
  const [{ data: auth }, profile] = await Promise.all([
    client.auth.getUser(),
    fetchProfile(client),
  ]);

  if (!auth.user) throw new Error('Not signed in');

  return unwrap(
    await client
      .from('notification_states')
      .upsert(
        {
          household_id: profile.household_id,
          user_id: auth.user.id,
          notification_key: input.notificationKey,
          read_at: input.readAt,
          dismissed_until: input.dismissedUntil,
        },
        { onConflict: 'user_id,notification_key' },
      )
      .select()
      .single(),
  );
}

export function markNotificationRead(
  client: MinteaClient,
  notificationKey: string,
  now = new Date(),
): Promise<NotificationStateRow> {
  return saveNotificationState(client, {
    notificationKey,
    readAt: now.toISOString(),
    dismissedUntil: null,
  });
}

export function markNotificationUnread(
  client: MinteaClient,
  notificationKey: string,
): Promise<NotificationStateRow> {
  return saveNotificationState(client, {
    notificationKey,
    readAt: null,
    dismissedUntil: null,
  });
}

/** Temporarily hides a derived condition, then lets it return unread. */
export function dismissNotification(
  client: MinteaClient,
  notificationKey: string,
  now = new Date(),
): Promise<NotificationStateRow> {
  return saveNotificationState(client, {
    notificationKey,
    readAt: null,
    dismissedUntil: new Date(
      now.getTime() + DEFAULT_DERIVED_DISMISSAL_MS,
    ).toISOString(),
  });
}
