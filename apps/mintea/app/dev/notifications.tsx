import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colorScheme, useColorScheme } from 'nativewind';
import {
  applyNotificationStates,
  buildBudgetNotifications,
  buildDerivedNotifications,
  buildFamilyMembershipNotification,
  countUnreadNotifications,
  dispatchNotificationEmails,
  evaluateNotifications,
  type ConnectionNotificationSource,
  type NotificationDisplay,
  type NotificationState,
} from '@mintea/core';

import { NotificationCard } from '../../components/Notifications';
import { Button, EmptyState, PageHeader, Screen } from '../../components/ui';
import { useClient } from '../../lib/auth';

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

const mockBudgetNotifications = buildBudgetNotifications(
  [
    {
      categoryId: 'category-dining',
      categoryName: 'Dining out',
      month: '2026-08-01',
      plannedCents: 30000,
      spentCents: 38750,
    },
  ],
  { month: '2026-08-01', unallocatedCents: 142500 },
);

function NotificationsFixture() {
  const client = useClient();
  const { colorScheme: activeColorScheme } = useColorScheme();
  const [states, setStates] = useState<NotificationState[]>(initialStates);
  const [budgetActive, setBudgetActive] = useState(false);
  const [familyEvents, setFamilyEvents] = useState<Array<'joined' | 'left'>>([]);
  const [emailQueue, setEmailQueue] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  const notifications = useMemo(
    () => {
      const base: NotificationDisplay[] = buildDerivedNotifications(mockConnections, 2);
      const budget = budgetActive ? mockBudgetNotifications : [];
      const events = familyEvents.map((event, index) =>
        buildFamilyMembershipNotification(event, `${event}-${index + 1}`),
      );
      return applyNotificationStates([...base, ...budget, ...events], states, mockNow);
    },
    [budgetActive, familyEvents, states],
  );
  const unreadCount = countUnreadNotifications(notifications);

  const reset = () => {
    setStates(initialStates);
    setBudgetActive(false);
    setFamilyEvents([]);
    setEmailQueue([]);
    setStatus(null);
  };

  const queueEmails = () => {
    const unread = notifications.filter((notification) => notification.isUnread);
    setEmailQueue(unread.map((notification) => notification.key));
    setStatus(
      unread.length === 0
        ? 'No unread notification emails to queue.'
        : `${unread.length} notification emails queued in log-only mode. No provider request was made.`,
    );
  };

  const runLiveEvaluation = async () => {
    setLiveBusy(true);
    setStatus('Running the live notification evaluator…');
    try {
      const result = await evaluateNotifications(client);
      setStatus(
        `Live evaluator completed: ${result.notificationsUpserted} notifications upserted and ${result.conditionsResolved} conditions resolved.`,
      );
    } catch (error) {
      setStatus(
        `Live evaluator failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      setLiveBusy(false);
    }
  };

  const dispatchLiveEmails = async () => {
    setLiveBusy(true);
    setStatus('Dispatching live notification emails…');
    try {
      const result = await dispatchNotificationEmails(client);
      setStatus(
        `Live dispatcher completed: ${result.sent} sent, ${result.suppressed} suppressed, ${result.failed} failed.`,
      );
    } catch (error) {
      setStatus(
        `Live dispatcher failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      setLiveBusy(false);
    }
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
          testID="notification-trigger-controls"
          className="mb-5 gap-2 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
        >
          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            Trigger mock email paths
          </Text>
          <Text className="text-sm leading-5 text-ink-500 dark:text-ink-400">
            These controls exercise the same notification shapes used by the
            server evaluator. Delivery is intentionally log-only in local E2E.
          </Text>
          <View className="mt-2 gap-2">
            <Button
              label="Trigger over-budget and unallocated income"
              onPress={() => {
                setBudgetActive(true);
                setStatus('Budget conditions triggered.');
              }}
              variant="secondary"
            />
            <Button
              label="Trigger family member joined"
              onPress={() => {
                setFamilyEvents((current) => [...current, 'joined']);
                setStatus('Family member joined event triggered.');
              }}
              variant="secondary"
            />
            <Button
              label="Trigger family member left"
              onPress={() => {
                setFamilyEvents((current) => [...current, 'left']);
                setStatus('Family member left event triggered.');
              }}
              variant="secondary"
            />
            <Button
              label="Queue notification emails (log-only)"
              onPress={queueEmails}
              variant="primary"
            />
          </View>
          {emailQueue.length > 0 ? (
            <Text
              testID="notification-email-queue"
              className="mt-2 text-sm font-semibold text-mint-700 dark:text-mint-300"
            >
              {emailQueue.length} queued: {emailQueue.join(', ')}
            </Text>
          ) : null}
        </View>

        <View
          testID="notification-live-controls"
          className="mb-5 gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
        >
          <Text className="text-base font-semibold text-amber-900 dark:text-amber-100">
            Live delivery test
          </Text>
          <Text className="text-sm leading-5 text-amber-800 dark:text-amber-200">
            Uses the signed-in household and the deployed development email
            functions. This path can contact the configured provider.
          </Text>
          <View className="mt-2 gap-2">
            <Button
              label="Run live notification evaluator"
              onPress={runLiveEvaluation}
              loading={liveBusy}
              variant="secondary"
            />
            <Button
              label="Dispatch live notification emails"
              onPress={dispatchLiveEmails}
              loading={liveBusy}
              variant="primary"
            />
          </View>
        </View>

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
