import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  accountsQuery,
  accountsWithInstitutionsQuery,
  categoriesQuery,
  earliestBalanceQuery,
  formatMoney,
  hydrateTransactions,
  merchantsQuery,
  netWorthChange,
  netWorthQuery,
  resolveRange,
  summarizeNetWorth,
  syncPlaidItem,
  transactionsQuery,
  RANGE_PRESETS,
  type RangePreset,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  Card,
  Divider,
  EmptyState,
  Loading,
  Money,
  Title,
} from '../../components/ui';
import { NetWorthChart } from '../../components/NetWorthChart';
import { TransactionRow } from '../../components/TransactionRow';
import { LinkAccountButton } from '../../components/PlaidLink';

export default function Dashboard() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [preset, setPreset] = useState<RangePreset>('6M');
  const [refreshing, setRefreshing] = useState(false);

  const accounts = useQuery(accountsWithInstitutionsQuery(client));
  const earliest = useQuery(earliestBalanceQuery(client));

  const range = useMemo(
    () =>
      resolveRange(preset, {
        ...(earliest.data ? { earliest: earliest.data } : {}),
      }),
    [preset, earliest.data],
  );

  const netWorth = useQuery(netWorthQuery(client, range));

  const recent = useInfiniteQuery(transactionsQuery(client, {}));
  const categories = useQuery(categoriesQuery(client));
  const merchants = useQuery(merchantsQuery(client));
  const allAccounts = useQuery(accountsQuery(client));

  const reviewQueue = useInfiniteQuery(
    transactionsQuery(client, { needsReview: true }),
  );

  const transactions = useMemo(() => {
    if (!recent.data || !categories.data || !merchants.data || !allAccounts.data) {
      return [];
    }

    return hydrateTransactions(
      recent.data.pages.flatMap((page) => page.transactions).slice(0, 6),
      {
        categories: categories.data,
        merchants: merchants.data,
        accounts: allAccounts.data,
      },
    );
  }, [recent.data, categories.data, merchants.data, allAccounts.data]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncPlaidItem(client);
      await queryClient.invalidateQueries();
    } catch {
      // The accounts tab surfaces sync errors; pull-to-refresh stays quiet.
    } finally {
      setRefreshing(false);
    }
  };

  if (accounts.isPending) return <Loading />;

  const summary = summarizeNetWorth(accounts.data ?? []);
  const series = netWorth.data ?? [];
  const change = netWorthChange(series);
  const needsReview = reviewQueue.data?.pages[0]?.transactions.length ?? 0;

  if ((accounts.data?.length ?? 0) === 0) {
    return (
      <ScrollView className="flex-1 bg-ink-50 dark:bg-ink-950">
        <View className="w-full max-w-3xl self-center">
          <View className="px-4 pt-6">
            <Title>Welcome to Mintea</Title>
          </View>
          <EmptyState
            icon="🍵"
            title="Let's see the whole picture"
            message="Connect your bank to pull in balances and transactions, or start with a manual account."
            action={
              <View className="w-64 gap-3">
                <LinkAccountButton />
                <Pressable
                  onPress={() => router.push('/account/new')}
                  accessibilityRole="button"
                  className="py-2"
                >
                  <Text className="text-center text-sm font-semibold text-mint-600 dark:text-mint-400">
                    Add manually
                  </Text>
                </Pressable>
              </View>
            }
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-ink-50 dark:bg-ink-950"
      contentContainerClassName="pb-16"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
        />
      }
    >
      <View className="w-full max-w-3xl self-center">
        <View className="px-4 pt-6 pb-2">
          <Title>Dashboard</Title>
        </View>

        <Card className="mx-4 py-4 overflow-hidden">
          {netWorth.isPending ? (
            <View className="h-64 items-center justify-center">
              <Loading />
            </View>
          ) : series.length < 2 ? (
            <View className="px-4 py-8">
              <Text className="text-sm text-ink-500 dark:text-ink-400">
                Net worth
              </Text>
              <Money cents={summary.netCents} size="xl" className="mt-1" />
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-3">
                The chart fills in as balances are recorded each day.
              </Text>
            </View>
          ) : (
            <>
              <NetWorthChart series={series} />

              <View className="flex-row items-center px-4 pt-2 gap-2">
                <Text
                  className={`text-sm font-semibold ${
                    change.changeCents >= 0
                      ? 'text-positive dark:text-emerald-400'
                      : 'text-negative dark:text-red-400'
                  }`}
                >
                  {change.changeCents >= 0 ? '↑' : '↓'}{' '}
                  {formatMoney(Math.abs(change.changeCents))}
                </Text>
                {change.changeRatio !== null ? (
                  <Text className="text-sm text-ink-500 dark:text-ink-400">
                    ({(change.changeRatio * 100).toFixed(1)}%)
                  </Text>
                ) : null}
                <Text className="text-sm text-ink-500 dark:text-ink-400">
                  this period
                </Text>
              </View>
            </>
          )}

          <View className="flex-row gap-1.5 px-4 pt-4">
            {RANGE_PRESETS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setPreset(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: preset === option }}
                className={`flex-1 py-1.5 rounded-lg items-center ${
                  preset === option
                    ? 'bg-mint-600'
                    : 'bg-ink-100 dark:bg-ink-800'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    preset === option
                      ? 'text-white'
                      : 'text-ink-600 dark:text-ink-300'
                  }`}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <View className="flex-row gap-3 px-4 mt-4">
          <Card className="flex-1 p-4">
            <Text className="text-sm text-ink-500 dark:text-ink-400">Assets</Text>
            <Money cents={summary.assetsCents} size="lg" className="mt-1" />
          </Card>
          <Card className="flex-1 p-4">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              Liabilities
            </Text>
            <Money
              cents={Math.abs(summary.liabilitiesCents)}
              size="lg"
              className="mt-1"
            />
          </Card>
        </View>

        {needsReview > 0 ? (
          <Pressable
            onPress={() => router.push('/(tabs)/transactions')}
            accessibilityRole="button"
            className="mx-4 mt-4"
          >
            <Card className="p-4 flex-row items-center gap-3 border-mint-300 dark:border-mint-800 bg-mint-50 dark:bg-mint-950">
              <Text className="text-2xl">🔍</Text>
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                  {needsReview}
                  {needsReview === 50 ? '+' : ''} to review
                </Text>
                <Text className="text-sm text-ink-500 dark:text-ink-400">
                  Confirm categories on new transactions.
                </Text>
              </View>
              <Text className="text-ink-400">›</Text>
            </Card>
          </Pressable>
        ) : null}

        <View className="flex-row items-center justify-between px-5 mt-8 mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Recent activity
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/transactions')}
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
              See all
            </Text>
          </Pressable>
        </View>

        <Card className="mx-4 overflow-hidden">
          {transactions.length === 0 ? (
            <View className="p-6">
              <Text className="text-sm text-ink-500 dark:text-ink-400 text-center">
                No transactions yet.
              </Text>
            </View>
          ) : (
            transactions.map((transaction, index) => (
              <View key={transaction.id}>
                {index > 0 ? <Divider /> : null}
                <TransactionRow
                  transaction={transaction}
                  onPress={() => router.push(`/transaction/${transaction.id}`)}
                />
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}
