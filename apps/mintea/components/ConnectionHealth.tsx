import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  plaidItemsQuery,
  summarizeConnections,
  type ConnectionHealth,
  type ConnectionSeverity,
} from '@mintea/core';

import { useClient } from '../lib/auth';
import { Badge } from './ui';

export const CONNECTION_TONE: Record<
  ConnectionSeverity,
  'accent' | 'neutral' | 'warning' | 'danger'
> = {
  ok: 'accent',
  info: 'neutral',
  warning: 'warning',
  critical: 'danger',
};

export function ConnectionBadge({ health }: { health: ConnectionHealth }) {
  return <Badge label={health.label} tone={CONNECTION_TONE[health.severity]} />;
}

/** The explanation under a connection's name. Colour tracks severity. */
export function ConnectionDetail({ health }: { health: ConnectionHealth }) {
  return (
    <Text
      className={`mt-0.5 text-sm ${
        health.severity === 'critical'
          ? 'text-negative'
          : health.severity === 'warning'
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-ink-500 dark:text-ink-400'
      }`}
    >
      {health.detail}
    </Text>
  );
}

/**
 * Household-wide connection warning.
 *
 * Lives where the user already looks at their money, because finding out that
 * a balance is stale should not require a trip into Settings — the whole point
 * is that a stale number looks exactly like a fresh one.
 */
export function ConnectionsBanner({ now }: { now?: Date }) {
  const client = useClient();
  const router = useRouter();
  const items = useQuery(plaidItemsQuery(client));

  const summary = summarizeConnections(items.data ?? [], now ?? new Date());
  if (!summary.message) return null;

  const critical = summary.severity === 'critical';

  return (
    <View
      accessibilityRole="alert"
      testID="connections-banner"
      className={`mx-4 mt-3 flex-row items-start gap-3 rounded-xl border p-3 ${
        critical
          ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
          : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
      }`}
    >
      <Ionicons
        name={critical ? 'alert-circle' : 'time-outline'}
        size={18}
        color={critical ? '#DC2626' : '#B45309'}
      />

      <View className="min-w-0 flex-1">
        <Text
          className={`text-sm ${
            critical
              ? 'text-red-700 dark:text-red-300'
              : 'text-amber-800 dark:text-amber-300'
          }`}
        >
          {summary.message}
        </Text>

        <Text
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/settings')}
          className={`mt-1 text-sm font-semibold ${
            critical
              ? 'text-red-700 dark:text-red-300'
              : 'text-amber-800 dark:text-amber-300'
          }`}
        >
          Review connections
        </Text>
      </View>
    </View>
  );
}
