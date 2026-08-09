import type { ConnectionHealth } from './connectionHealth';

export type NotificationClass = 'condition' | 'event';
export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';
export type NotificationKind = 'connection-health' | 'duplicate-accounts';

export type ConnectionNotificationSource = {
  id: string;
  institutionName: string | null;
  health: ConnectionHealth;
};

/** A notification that is true only while its current condition is true. */
export type DerivedNotification = {
  key: string;
  class: 'condition';
  kind: NotificationKind;
  severity: NotificationSeverity;
  icon: string;
  title: string;
  message: string;
  actionLabel: string;
  /** Expo Router path; kept as a string so core stays platform-agnostic. */
  href: string;
};

export type NotificationState = {
  notification_key: string;
  read_at: string | null;
  dismissed_until: string | null;
};

export type InAppNotification = DerivedNotification & {
  readAt: string | null;
  dismissedUntil: string | null;
  isUnread: boolean;
};

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
  success: 0,
};

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function connectionReconnectNotification(
  connections: ConnectionNotificationSource[],
): DerivedNotification {
  const critical = connections.some(
    ({ health }) => health.severity === 'critical',
  );
  const first = connections[0];
  const count = connections.length;

  return {
    key: 'condition:connection-reconnect',
    class: 'condition',
    kind: 'connection-health',
    severity: critical ? 'critical' : 'warning',
    icon: critical ? 'alert-circle-outline' : 'time-outline',
    title:
      count === 1
        ? `${first?.institutionName ?? 'A connection'} needs attention`
        : `${countLabel(count, 'connection')} need attention`,
    message:
      count === 1
        ? first?.health.detail ?? 'Reconnect to keep this connection updating.'
        : 'Reconnect the affected banks to keep balances and activity current.',
    actionLabel: 'Review connections',
    href: '/(tabs)/settings',
  };
}

function connectionStaleNotification(
  connections: ConnectionNotificationSource[],
): DerivedNotification {
  const first = connections[0];
  const count = connections.length;

  return {
    key: 'condition:connection-stale',
    class: 'condition',
    kind: 'connection-health',
    severity: 'warning',
    icon: 'time-outline',
    title:
      count === 1
        ? `${first?.institutionName ?? 'A connection'} is out of date`
        : `${countLabel(count, 'connection')} are out of date`,
    message:
      count === 1
        ? first?.health.detail ?? 'Balances and totals may be behind.'
        : 'These connections have not sent new data in five days. Balances and totals may be behind.',
    actionLabel: 'Review connections',
    href: '/(tabs)/settings',
  };
}

/**
 * Builds the first P11 condition set from current product state.
 *
 * The key is intentionally stable for a condition class. Read/dismiss state
 * belongs to the recipient, while the presence and copy of the condition come
 * from the latest connection/account data.
 */
export function buildDerivedNotifications(
  connections: ConnectionNotificationSource[],
  duplicateCount: number,
): DerivedNotification[] {
  const reconnect = connections.filter(
    ({ health }) => health.action === 'reconnect',
  );
  const stale = connections.filter(
    ({ health }) => health.label === 'Out of date',
  );
  const notifications: DerivedNotification[] = [];

  if (reconnect.length > 0) {
    notifications.push(connectionReconnectNotification(reconnect));
  }

  if (stale.length > 0) {
    notifications.push(connectionStaleNotification(stale));
  }

  if (duplicateCount > 0) {
    notifications.push({
      key: 'condition:duplicate-accounts',
      class: 'condition',
      kind: 'duplicate-accounts',
      severity: 'critical',
      icon: 'shield-checkmark-outline',
      title: countLabel(duplicateCount, 'possible duplicate account', 'possible duplicate accounts'),
      message:
        'Review the matches before they double-count balances and transactions.',
      actionLabel: 'Review duplicates',
      href: '/account/duplicates',
    });
  }

  return notifications.sort((first, second) => {
    const severity = SEVERITY_RANK[second.severity] - SEVERITY_RANK[first.severity];
    return severity || first.key.localeCompare(second.key);
  });
}

/**
 * Applies recipient interaction state to current conditions. A dismissed
 * condition remains in the store conceptually but is omitted until its
 * reminder time; when it returns it is unread again.
 */
export function applyNotificationStates(
  notifications: DerivedNotification[],
  states: NotificationState[],
  now: Date,
): InAppNotification[] {
  const stateByKey = new Map(
    states.map((state) => [state.notification_key, state]),
  );

  return notifications
    .map((notification) => {
      const state = stateByKey.get(notification.key);
      const dismissedUntil = state?.dismissed_until ?? null;
      const isDismissed = Boolean(
        dismissedUntil && new Date(dismissedUntil).getTime() > now.getTime(),
      );

      return {
        ...notification,
        readAt: state?.read_at ?? null,
        dismissedUntil,
        isUnread: !isDismissed && !state?.read_at,
        isDismissed,
      };
    })
    .filter((notification) => !notification.isDismissed)
    .sort((first, second) => {
      const severity =
        SEVERITY_RANK[second.severity] - SEVERITY_RANK[first.severity];
      if (severity) return severity;
      if (first.isUnread !== second.isUnread) return first.isUnread ? -1 : 1;
      return first.key.localeCompare(second.key);
    });
}

export function countUnreadNotifications(
  notifications: InAppNotification[],
): number {
  return notifications.filter((notification) => notification.isUnread).length;
}
