import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { InAppNotification, NotificationSeverity } from '@mintea/core';

import { Card, IconBadge } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function toneForSeverity(
  severity: NotificationSeverity,
): 'accent' | 'neutral' | 'warning' | 'danger' {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'success':
      return 'accent';
    default:
      return 'neutral';
  }
}

export function NotificationCard({
  notification,
  busy,
  onOpen,
  onToggleRead,
  onDismiss,
}: {
  notification: InAppNotification;
  busy: boolean;
  onOpen: (notification: InAppNotification) => void;
  onToggleRead: (notification: InAppNotification) => void;
  onDismiss: (notification: InAppNotification) => void;
}) {
  const tone = toneForSeverity(notification.severity);
  const icon = notification.icon as IconName;

  return (
    <Card
      testID={`notification-${notification.key}`}
      className={`overflow-hidden ${
        notification.isUnread
          ? 'border-mint-300 dark:border-mint-700'
          : ''
      }`}
    >
      <Pressable
        onPress={() => onOpen(notification)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${notification.title}. ${notification.message}`}
        accessibilityState={{ disabled: busy }}
        className="flex-row items-start gap-3 p-4 hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800/70 dark:active:bg-ink-800"
      >
        <IconBadge name={icon} size={42} tone={tone} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start gap-2">
            <Text
              className={`min-w-0 flex-1 text-base text-ink-900 dark:text-ink-50 ${
                notification.isUnread ? 'font-bold' : 'font-semibold'
              }`}
            >
              {notification.title}
            </Text>
            {notification.isUnread ? (
              <View
                accessibilityLabel="Unread"
                className="mt-1.5 h-2.5 w-2.5 rounded-full bg-mint-600 dark:bg-mint-400"
              />
            ) : null}
          </View>
          <Text className="mt-1 text-sm leading-5 text-ink-600 dark:text-ink-300">
            {notification.message}
          </Text>
          <View className="mt-2 flex-row items-center gap-1.5">
            <Text className="text-sm font-semibold text-mint-700 dark:text-mint-300">
              {notification.actionLabel}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={14}
              color="#1FA678"
            />
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color="#88939F"
          accessibilityElementsHidden
        />
      </Pressable>

      <View className="flex-row items-center justify-end gap-4 border-t border-ink-100 px-4 py-2.5 dark:border-ink-800">
        <Pressable
          onPress={() => onToggleRead(notification)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={
            notification.isUnread ? 'Mark notification read' : 'Mark notification unread'
          }
          accessibilityState={{ disabled: busy }}
          className="py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500"
        >
          <Text className="text-sm font-semibold text-ink-500 dark:text-ink-400">
            {notification.isUnread ? 'Mark read' : 'Mark unread'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDismiss(notification)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Remind me tomorrow"
          accessibilityState={{ disabled: busy }}
          className="py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500"
        >
          <Text className="text-sm font-semibold text-ink-500 dark:text-ink-400">
            Remind tomorrow
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
