import type { MinteaClient } from './client';
import { unwrap } from './client';
import { fetchAccounts, fetchPlaidItems, attachInstitutions } from './accounts';
import { fetchProfile } from './session';
import { assessConnection } from '../domain/connectionHealth';
import { findDuplicateAccountCandidates } from '../domain/dataTrust';
import {
  applyNotificationStates,
  buildDerivedNotifications,
  type InAppNotification,
} from '../domain/notifications';
import type { NotificationStateRow } from '../types/database';

const DEFAULT_DERIVED_DISMISSAL_MS = 24 * 60 * 60 * 1000;

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
 * Rebuilds the current notification centre from source-of-truth product data.
 * A fixed connection or reviewed duplicate disappears on the next refetch
 * without a cleanup job having to delete a notification row.
 */
export async function fetchInAppNotifications(
  client: MinteaClient,
  now = new Date(),
): Promise<InAppNotification[]> {
  const [accounts, items, states] = await Promise.all([
    fetchAccounts(client),
    fetchPlaidItems(client),
    fetchNotificationStates(client),
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

  return applyNotificationStates(
    buildDerivedNotifications(connections, duplicateCount),
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
