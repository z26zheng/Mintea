import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  accountsQuery,
  accountsWithInstitutionsQuery,
  buildFinancialChartSeries,
  categoriesQuery,
  chartGranularityForPreset,
  earliestFinancialActivityQuery,
  financialChartChange,
  financialChartQuery,
  financialMetricHeadline,
  FINANCIAL_METRIC_DEFINITIONS,
  FINANCIAL_METRICS,
  formatMoney,
  hydrateTransactions,
  merchantsQuery,
  profileQuery,
  resolveRange,
  summarizeNetWorth,
  syncPlaidItem,
  toIsoDateInTimeZone,
  transactionsQuery,
  RANGE_PRESETS,
  type FinancialMetric,
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
import {
  FinancialChart,
  type FinancialChartType,
} from '../../components/FinancialChart';
import { TransactionRow } from '../../components/TransactionRow';
import { PlaidConnectOptions } from '../../components/PlaidConnectOptions';

export default function Dashboard() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [preset, setPreset] = useState<RangePreset>('6M');
  const [metric, setMetric] = useState<FinancialMetric>('netWorth');
  const [chartType, setChartType] = useState<FinancialChartType>('line');
  const [refreshing, setRefreshing] = useState(false);

  const accounts = useQuery(accountsWithInstitutionsQuery(client));
  const earliest = useQuery(earliestFinancialActivityQuery(client));
  const profile = useQuery(profileQuery(client));
  const reportingToday = toIsoDateInTimeZone(
    new Date(),
    profile.data?.timezone ?? 'UTC',
  );

  const range = useMemo(
    () =>
      resolveRange(preset, {
        todayIso: reportingToday,
        ...(earliest.data ? { earliest: earliest.data } : {}),
      }),
    [preset, earliest.data, reportingToday],
  );

  const financialHistory = useQuery(financialChartQuery(client, range));

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

  const granularity = chartGranularityForPreset(preset);
  const chartSeries = useMemo(
    () =>
      buildFinancialChartSeries(
        financialHistory.data ?? [],
        metric,
        granularity,
      ),
    [financialHistory.data, granularity, metric],
  );

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

  if (accounts.isPending || profile.isPending) return <Loading />;

  const summary = summarizeNetWorth(accounts.data ?? []);
  const metricDefinition = FINANCIAL_METRIC_DEFINITIONS[metric];
  const headlineCents = financialMetricHeadline(chartSeries, metric);
  const change = financialChartChange(chartSeries);
  const favorableChange =
    metric === 'liabilities'
      ? change.changeCents <= 0
      : change.changeCents >= 0;
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
                <PlaidConnectOptions />
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
          <View className="flex-row items-center justify-between px-4 pb-3">
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Financial trends
              </Text>
              <Text className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">
                Tap or drag across the chart for details
              </Text>
            </View>

            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Chart type"
              className="flex-row rounded-lg bg-ink-100 dark:bg-ink-800 p-0.5"
            >
              {(['line', 'bar'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setChartType(option)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option} chart`}
                  accessibilityState={{ checked: chartType === option }}
                  aria-checked={chartType === option}
                  className={`px-2.5 py-1.5 rounded-md ${
                    chartType === option
                      ? 'bg-white dark:bg-ink-700'
                      : ''
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      chartType === option
                        ? 'text-mint-700 dark:text-mint-300'
                        : 'text-ink-500 dark:text-ink-400'
                    }`}
                  >
                    {option === 'line' ? 'Line' : 'Bars'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Financial metric"
            className="flex-row flex-wrap gap-2 px-4 pb-4"
          >
            {FINANCIAL_METRICS.map((option) => {
              const selected = metric === option;
              const definition = FINANCIAL_METRIC_DEFINITIONS[option];

              return (
                <Pressable
                  key={option}
                  onPress={() => setMetric(option)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${definition.label} metric`}
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  className={`px-3 py-2 rounded-full ${
                    selected
                      ? 'bg-mint-600'
                      : 'bg-ink-100 dark:bg-ink-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected
                        ? 'text-white'
                        : 'text-ink-600 dark:text-ink-300'
                    }`}
                  >
                    {definition.shortLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {financialHistory.isPending ? (
            <View className="h-64 items-center justify-center">
              <Loading />
            </View>
          ) : financialHistory.isError ? (
            <View className="px-4 py-8 items-start">
              <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                Could not load financial history
              </Text>
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                {financialHistory.error instanceof Error
                  ? financialHistory.error.message
                  : 'Try loading the chart again.'}
              </Text>
              <Pressable
                onPress={() => financialHistory.refetch()}
                accessibilityRole="button"
                className="mt-3 py-1"
              >
                <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : chartSeries.length === 0 || headlineCents === null ? (
            <View className="px-4 py-8">
              <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                No {metricDefinition.label.toLowerCase()} history yet
              </Text>
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-3">
                {metricDefinition.emptyMessage}
              </Text>
            </View>
          ) : (
            <>
              <FinancialChart
                series={chartSeries}
                chartType={chartType}
                granularity={granularity}
                label={metricDefinition.label}
                headlineLabel={metricDefinition.periodLabel}
                headlineCents={headlineCents}
                includeZero={metric === 'cashFlow'}
              />

              {metric === 'cashFlow' ? (
                <Text className="text-xs text-ink-500 dark:text-ink-400 px-4 pt-2">
                  Posted income minus spending. Transfers and hidden transactions
                  are excluded.
                </Text>
              ) : chartSeries.length > 1 ? (
                <View className="flex-row items-center px-4 pt-2 gap-2">
                  <Text
                    className={`text-sm font-semibold ${
                      favorableChange
                        ? 'text-positive dark:text-emerald-400'
                        : 'text-negative dark:text-red-400'
                    }`}
                  >
                    {change.changeCents >= 0 ? '↑' : '↓'}{' '}
                    {formatMoney(Math.abs(change.changeCents))}
                  </Text>
                  {change.changeRatio !== null ? (
                    <Text className="text-sm text-ink-500 dark:text-ink-400">
                      ({Math.abs(change.changeRatio * 100).toFixed(1)}%)
                    </Text>
                  ) : null}
                  <Text className="text-sm text-ink-500 dark:text-ink-400">
                    this period
                  </Text>
                </View>
              ) : null}
            </>
          )}

          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Financial chart date range"
            className="flex-row gap-1.5 px-4 pt-4"
          >
            {RANGE_PRESETS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setPreset(option)}
                accessibilityRole="radio"
                accessibilityLabel={`${option} financial chart range`}
                accessibilityState={{ checked: preset === option }}
                aria-checked={preset === option}
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

        <Pressable
          onPress={() => router.push('/reports' as Href)}
          accessibilityRole="button"
          className="mx-4 mt-4"
        >
          <Card className="flex-row items-center gap-3 px-4 py-3">
            <Text className="text-xl">📊</Text>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-medium text-ink-900 dark:text-ink-50">
                Reports
              </Text>
              <Text className="text-sm text-ink-500 dark:text-ink-400">
                Income, spending and where it went.
              </Text>
            </View>
            <Text className="text-ink-400">›</Text>
          </Card>
        </Pressable>

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
