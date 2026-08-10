import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissNotification,
  markNotificationRead,
  markNotificationUnread,
  notificationsQuery,
  queryKeys,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
} from '../../components/ui';
import { NotificationCard } from '../../components/Notifications';

type NotificationAction = 'read' | 'unread' | 'dismiss';

export default function Notifications() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useQuery(notificationsQuery(client));
  const [actionError, setActionError] = useState<string | null>(null);

  const stateMutation = useMutation({
    mutationFn: ({ key, action }: { key: string; action: NotificationAction }) => {
      if (action === 'read') return markNotificationRead(client, key);
      if (action === 'unread') return markNotificationUnread(client, key);
      return dismissNotification(client, key);
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (caught) => {
      setActionError(
        caught instanceof Error
          ? caught.message
          : 'Could not update this notification',
      );
    },
  });

  const openNotification = async (key: string, href: string, unread: boolean) => {
    if (unread) {
      try {
        await stateMutation.mutateAsync({ key, action: 'read' });
      } catch {
        return;
      }
    }
    router.push(href as Href);
  };

  if (notifications.isPending) return <Loading label="Checking your notifications…" />;

  if (notifications.isError) {
    return (
      <ErrorNotice
        message={notifications.error.message}
        onRetry={() => notifications.refetch()}
      />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-ink-50 dark:bg-ink-950"
      contentContainerClassName="pb-20"
      showsVerticalScrollIndicator={false}
    >
      <View className="w-full max-w-3xl self-center">
        <PageHeader
          eyebrow="Your money"
          title="Notifications"
          subtitle="The things that need your attention, computed from your current data."
        />

        {actionError ? <ErrorNotice message={actionError} /> : null}

        {notifications.data.length === 0 ? (
          <EmptyState
            icon="✓"
            title="Everything is current"
            message="When a connection needs attention or Mintea finds a possible duplicate, it will appear here."
          />
        ) : (
          <View testID="notifications-center" className="gap-3 px-4">
            {notifications.data.map((notification) => (
              <NotificationCard
                key={notification.key}
                notification={notification}
                busy={stateMutation.isPending}
                onOpen={(current) =>
                  void openNotification(
                    current.key,
                    current.href,
                    current.isUnread,
                  )
                }
                onToggleRead={(current) =>
                  stateMutation.mutate({
                    key: current.key,
                    action: current.isUnread ? 'read' : 'unread',
                  })
                }
                onDismiss={(current) =>
                  stateMutation.mutate({
                    key: current.key,
                    action: 'dismiss',
                  })
                }
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
