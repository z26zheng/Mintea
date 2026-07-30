import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { useBreakpoint } from '../../lib/breakpoints';
import { useTheme } from '../../lib/theme';
import {
  Card,
  Divider,
  EmptyState,
  Money,
  PageHeader,
  Reveal,
  Skeleton,
} from '../../components/ui';
import { MinteaMark } from '../../components/BrandMark';
import {
  FinancialChart,
  type FinancialChartType,
} from '../../components/FinancialChart';
import { TransactionRow } from '../../components/TransactionRow';
import { PlaidConnectOptions } from '../../components/PlaidConnectOptions';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function SummaryCard({
  label,
  cents,
  icon,
  compact,
}: {
  label: string;
  cents: number;
  icon: IconName;
  compact: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Card className="min-w-0 flex-1 p-4">
      <View className="mb-3 h-9 w-9 items-center justify-center rounded-xl bg-mint-50 dark:bg-mint-950">
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {label}
      </Text>
      <Money
        cents={cents}
        size="lg"
        hideCents={compact}
        className="mt-1"
      />
    </Card>
  );
}

function ActionCard({
  title,
  description,
  icon,
  onPress,
  accent = false,
}: {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
  accent?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500"
    >
      <Card
        className={`flex-row items-center gap-3 px-4 py-3.5 ${
          accent
            ? 'border-mint-300 bg-mint-50 dark:border-mint-800 dark:bg-mint-950'
            : ''
        }`}
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-xl ${
            accent
              ? 'bg-white dark:bg-mint-900'
              : 'bg-ink-100 dark:bg-ink-800'
          }`}
        >
          <Ionicons name={icon} size={20} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            {title}
          </Text>
          <Text
            numberOfLines={2}
            className="mt-0.5 text-sm leading-5 text-ink-500 dark:text-ink-400"
          >
            {description}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

function DashboardSkeleton({ large }: { large: boolean }) {
  return (
    <ScrollView
      className="flex-1 bg-ink-50 dark:bg-ink-950"
      contentContainerClassName="pb-16"
    >
      <View className="w-full max-w-6xl self-center">
        <View className="px-4 pt-8 pb-5">
          <Skeleton className="h-3 w-36" rounded="full" />
          <Skeleton className="mt-3 h-9 w-52" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" rounded="full" />
        </View>
        <View className={large ? 'flex-row gap-4 px-4' : ''}>
          <Card className={`${large ? 'flex-[1.7]' : 'mx-4'} overflow-hidden p-4`}>
            <Skeleton className="h-4 w-32" rounded="full" />
            <Skeleton className="mt-5 h-10 w-64 max-w-full" />
            <Skeleton className="mt-8 h-48 w-full" rounded="2xl" />
            <Skeleton className="mt-5 h-9 w-full" />
          </Card>
          <View
            className={`${large ? 'flex-1' : 'mt-4 px-4'} flex-row flex-wrap gap-3`}
          >
            <Skeleton className="h-32 min-w-[140px] flex-1" rounded="2xl" />
            <Skeleton className="h-32 min-w-[140px] flex-1" rounded="2xl" />
            <Skeleton className="h-20 w-full" rounded="2xl" />
            <Skeleton className="h-20 w-full" rounded="2xl" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export default function Dashboard() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { isCompact, isLarge } = useBreakpoint();

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

  if (accounts.isPending || profile.isPending) {
    return <DashboardSkeleton large={isLarge} />;
  }

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
        <View className="w-full max-w-5xl self-center">
          <PageHeader
            eyebrow="Welcome"
            title="Let's see the whole picture"
            subtitle="Connect an institution or add an account manually to build your financial overview."
            action={<MinteaMark size={40} />}
          />
          <EmptyState
            icon="✦"
            title="Your dashboard is ready"
            message="Balances, trends, reports, and recent activity will appear here as soon as an account is connected."
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
      <View className="w-full max-w-6xl self-center">
        <PageHeader
          eyebrow="Financial overview"
          title="Dashboard"
          subtitle="Your balances, trends, and the next things worth reviewing."
          action={<MinteaMark size={40} />}
        />

        <View className={isLarge ? 'flex-row items-start gap-4 px-4' : ''}>
          <Reveal className={isLarge ? 'flex-[1.7]' : ''}>
            <Card
              className={`${isLarge ? '' : 'mx-4'} overflow-hidden pb-4`}
              testID="dashboard-financial-trends"
            >
              <View className="h-1 bg-mint-500" />
              <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
                <View className="min-w-0 flex-1 pr-3">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Financial trends
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-xs text-ink-400 dark:text-ink-500"
                  >
                    Tap or drag across the chart for details
                  </Text>
                </View>

                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Chart type"
                  className="flex-row rounded-xl bg-ink-100 p-1 dark:bg-ink-800"
                >
                  {(['line', 'bar'] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setChartType(option)}
                      accessibilityRole="radio"
                      accessibilityLabel={`${option} chart`}
                      accessibilityState={{ checked: chartType === option }}
                      aria-checked={chartType === option}
                      className={`rounded-lg px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                        chartType === option
                          ? 'bg-white shadow-sm dark:bg-ink-700'
                          : 'hover:bg-white/60 dark:hover:bg-ink-700/60'
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

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 px-4 pb-4"
              >
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Financial metric"
                  className="flex-row gap-2"
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
                        className={`rounded-full px-3.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                          selected
                            ? 'bg-mint-600 shadow-sm shadow-mint-950/15'
                            : 'bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700'
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
              </ScrollView>

              {financialHistory.isPending ? (
                <View className="px-4 py-4">
                  <Skeleton className="h-4 w-28" rounded="full" />
                  <Skeleton className="mt-2 h-10 w-60 max-w-full" />
                  <Skeleton className="mt-6 h-44 w-full" rounded="2xl" />
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
                    className="mt-3 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500"
                  >
                    <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                      Try again
                    </Text>
                  </Pressable>
                </View>
              ) : chartSeries.length === 0 || headlineCents === null ? (
                <View className="px-4 py-8">
                  <View className="mb-4 h-11 w-11 items-center justify-center rounded-2xl bg-mint-50 dark:bg-mint-950">
                    <Ionicons
                      name="analytics-outline"
                      size={22}
                      color={colors.accent}
                    />
                  </View>
                  <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                    No {metricDefinition.label.toLowerCase()} history yet
                  </Text>
                  <Text className="text-sm text-ink-500 dark:text-ink-400 mt-2">
                    {metricDefinition.emptyMessage}
                  </Text>
                </View>
              ) : (
                <Reveal
                  key={`${metric}-${preset}-${chartType}`}
                  distance={4}
                >
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
                      Posted income minus spending. Transfers and hidden
                      transactions are excluded.
                    </Text>
                  ) : chartSeries.length > 1 ? (
                    <View className="flex-row flex-wrap items-center px-4 pt-2 gap-2">
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
                </Reveal>
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
                    className={`flex-1 items-center rounded-lg py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                      preset === option
                        ? 'bg-mint-600'
                        : 'bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700'
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
          </Reveal>

          <Reveal
            delay={70}
            className={`${isLarge ? 'flex-1' : 'mt-4 px-4'} gap-3`}
          >
            <View className="flex-row gap-3">
              <SummaryCard
                label="Assets"
                cents={summary.assetsCents}
                icon="trending-up"
                compact={isCompact}
              />
              <SummaryCard
                label="Liabilities"
                cents={Math.abs(summary.liabilitiesCents)}
                icon="card-outline"
                compact={isCompact}
              />
            </View>

            {needsReview > 0 ? (
              <ActionCard
                title={`${needsReview}${needsReview === 50 ? '+' : ''} to review`}
                description="Confirm categories on new transactions."
                icon="checkmark-done-outline"
                accent
                onPress={() => router.push('/(tabs)/transactions')}
              />
            ) : null}

            <ActionCard
              title="Reports"
              description="See income, spending, and where your money went."
              icon="pie-chart-outline"
              onPress={() => router.push('/reports' as Href)}
            />
          </Reveal>
        </View>

        <Reveal delay={130}>
          <View className="flex-row items-center justify-between px-5 mt-9 mb-2">
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Recent activity
              </Text>
              <Text className="mt-0.5 text-sm text-ink-400 dark:text-ink-500">
                Your latest posted and pending transactions
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/transactions')}
              accessibilityRole="button"
              className="rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500"
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
                    onPress={() =>
                      router.push(`/transaction/${transaction.id}`)
                    }
                  />
                </View>
              ))
            )}
          </Card>
        </Reveal>
      </View>
    </ScrollView>
  );
}
