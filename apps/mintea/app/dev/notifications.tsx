import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colorScheme, useColorScheme } from 'nativewind';
import {
  applyNotificationStates,
  buildDerivedNotifications,
  countUnreadNotifications,
  type ConnectionNotificationSource,
  type NotificationState,
} from '@mintea/core';

import { NotificationCard } from '../../components/Notifications';
import { Button, EmptyState, PageHeader, Screen } from '../../components/ui';

const mockNow = new Date('2026-08-09T12:00:00.000Z');

const mockConnections: ConnectionNotificationSource[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    institutionName: 'First Community Bank',
    health: {
      severity: 'critical',
      label: 'Needs sign-in',
      detail:
        'Your bank needs you to sign in again before it will share new data.',
      action: 'reconnect',
    },
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    institutionName: 'Harbor Credit Union',
    health: {
      severity: 'warning',
      label: 'Out of date',
      detail: 'No new data for 7 days. Balances and totals may be behind.',
      action: null,
    },
  },
];

const initialStates: NotificationState[] = [
  {
    notification_key: 'condition:connection-stale',
    read_at: '2026-08-08T12:00:00.000Z',
    dismissed_until: null,
  },
];

function NotificationsFixture() {
  const { colorScheme: activeColorScheme } = useColorScheme();
  const [states, setStates] = useState<NotificationState[]>(initialStates);
  const [status, setStatus] = useState<string | null>(null);

  const notifications = useMemo(
    () =>
      applyNotificationStates(
        buildDerivedNotifications(mockConnections, 2),
        states,
        mockNow,
      ),
    [states],
  );
  const unreadCount = countUnreadNotifications(notifications);

  const reset = () => {
    setStates(initialStates);
    setStatus(null);
  };

  const updateState = (
    notificationKey: string,
    action: 'read' | 'unread' | 'dismiss',
  ) => {
    const nextState: NotificationState = {
      notification_key: notificationKey,
      read_at: action === 'read' ? mockNow.toISOString() : null,
      dismissed_until:
        action === 'dismiss'
          ? new Date(mockNow.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null,
    };

    setStates((current) => {
      const existing = current.some(
        (state) => state.notification_key === notificationKey,
      );
      return existing
        ? current.map((state) =>
            state.notification_key === notificationKey ? nextState : state,
          )
        : [...current, nextState];
    });
  };

  return (
    <Screen scroll>
      <PageHeader
        eyebrow="Development-only mock data"
        title="Notifications QA"
        subtitle="P11 notification conditions and recipient actions without a Supabase session."
        action={
          <View className="flex-row gap-2">
            <Pressable
              onPress={() =>
                colorScheme.set(
                  activeColorScheme === 'dark' ? 'light' : 'dark',
                )
              }
              accessibilityRole="button"
              accessibilityLabel={
                activeColorScheme === 'dark' ? 'Use light theme' : 'Use dark theme'
              }
              className="rounded-full border border-ink-300 px-3 py-2 dark:border-ink-700"
            >
              <Text className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                {activeColorScheme === 'dark' ? 'Light' : 'Dark'}
              </Text>
            </Pressable>
            <Button label="Reset fixtures" onPress={reset} variant="secondary" />
          </View>
        }
      />

      <View className="px-4">
        <View
          testID="notification-fixture-summary"
          className="mb-5 rounded-2xl border border-mint-200 bg-mint-50 p-4 dark:border-mint-900 dark:bg-mint-950"
        >
          <Text className="text-sm font-semibold text-mint-800 dark:text-mint-200">
            {notifications.length} current conditions · {unreadCount} unread
          </Text>
          <Text className="mt-1 text-sm leading-5 text-mint-700 dark:text-mint-300">
            Mock data includes a reconnect warning, duplicate-account review, and
            a previously read stale connection.
          </Text>
        </View>

        {status ? (
          <Text
            testID="notification-fixture-status"
            className="mb-4 rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700 dark:bg-ink-800 dark:text-ink-200"
          >
            {status}
          </Text>
        ) : null}

        {notifications.length === 0 ? (
          <EmptyState
            icon="✓"
            title="Everything is current"
            message="Reset the fixture to restore the mock conditions."
          />
        ) : (
          <View testID="notifications-fixture" className="gap-3 pb-12">
            {notifications.map((notification) => (
              <NotificationCard
                key={notification.key}
                notification={notification}
                busy={false}
                onOpen={(current) => {
                  if (current.isUnread) updateState(current.key, 'read');
                  setStatus(`Opened ${current.actionLabel} → ${current.href}`);
                }}
                onToggleRead={(current) =>
                  updateState(current.key, current.isUnread ? 'read' : 'unread')
                }
                onDismiss={(current) => {
                  updateState(current.key, 'dismiss');
                  setStatus(`${current.title} will return tomorrow`);
                }}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

export default function NotificationsFixtureRoute() {
  if (!__DEV__) return <Redirect href="/" />;

  return <NotificationsFixture />;
}
