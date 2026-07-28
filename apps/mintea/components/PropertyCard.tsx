import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  equityGain,
  formatFullDate,
  formatMoney,
  propertyAddress,
  propertyQuery,
  refreshPropertyValue,
  valuationRange,
  type AccountRow,
} from '@mintea/core';

import { useClient } from '../lib/auth';
import { Card, Divider } from './ui';

/**
 * Valuation panel on a property's detail screen.
 *
 * Shows where the number came from and when, because an automatic estimate
 * that silently goes stale is worse than no estimate at all.
 */
export function PropertyCard({ account }: { account: AccountRow }) {
  const client = useClient();
  const queryClient = useQueryClient();

  const property = useQuery(propertyQuery(client, account.id));
  const [error, setError] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: () => refreshPropertyValue(client, account.id),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not refresh the value',
      ),
  });

  const details = property.data;
  if (!details) return null;

  const range = valuationRange(details);
  const gain = equityGain(details, account.current_balance_cents);
  const isAutomatic = details.valuation_source === 'rentcast';

  return (
    <Card className="overflow-hidden mb-5">
      <View className="p-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Property
        </Text>
        <Text className="text-base text-ink-900 dark:text-ink-50 mt-1">
          {propertyAddress(details)}
        </Text>

        {details.property_type ? (
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
            {[
              details.property_type,
              details.bedrooms ? `${details.bedrooms} bd` : null,
              details.bathrooms ? `${details.bathrooms} ba` : null,
              details.square_footage
                ? `${details.square_footage.toLocaleString()} sq ft`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>

      <Divider />

      <View className="p-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-sm text-ink-500 dark:text-ink-400">
            {isAutomatic ? 'Estimated value' : 'Value you set'}
          </Text>
          {range ? (
            <Text className="text-xs text-ink-400 dark:text-ink-500 tabular-nums">
              {formatMoney(range.lowCents, { hideCents: true })} –{' '}
              {formatMoney(range.highCents, { hideCents: true })}
            </Text>
          ) : null}
        </View>

        <Text className="text-2xl font-bold tabular-nums text-ink-900 dark:text-ink-50 mt-1">
          {formatMoney(account.current_balance_cents)}
        </Text>

        {gain ? (
          <Text className="text-sm mt-1">
            <Text
              className={
                gain.changeCents >= 0
                  ? 'text-positive dark:text-emerald-400 font-semibold'
                  : 'text-negative dark:text-red-400 font-semibold'
              }
            >
              {gain.changeCents >= 0 ? '↑' : '↓'}{' '}
              {formatMoney(Math.abs(gain.changeCents))} (
              {(Math.abs(gain.changeRatio) * 100).toFixed(1)}%)
            </Text>
            <Text className="text-ink-500 dark:text-ink-400">
              {' '}
              since purchase
              {details.purchase_date
                ? ` in ${formatFullDate(details.purchase_date)}`
                : ''}
            </Text>
          </Text>
        ) : null}

        <Text className="text-xs text-ink-400 dark:text-ink-500 mt-2">
          {details.last_valued_at
            ? `${isAutomatic ? 'Valued by RentCast' : 'Set'} ${formatFullDate(
                details.last_valued_at.slice(0, 10),
              )}`
            : 'Not valued yet'}
        </Text>

        {details.valuation_error ? (
          <View className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
            <Text className="text-sm text-amber-800 dark:text-amber-200">
              {details.valuation_error}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900">
            <Text className="text-sm text-red-700 dark:text-red-300">
              {error}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            setError(null);
            refresh.mutate();
          }}
          disabled={refresh.isPending}
          accessibilityRole="button"
          className="mt-4 self-start py-1"
        >
          <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
            {refresh.isPending
              ? 'Getting a valuation…'
              : isAutomatic
                ? 'Refresh valuation'
                : 'Get an automatic valuation'}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
