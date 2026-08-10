import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  breakdownByAccount,
  breakdownByCategory,
  breakdownByGroup,
  breakdownByMerchant,
  buildGroupTypeByCategoryId,
  comparePeriods,
  formatMonthLabel,
  monthlyTrend,
  profileQuery,
  reportPeriodQuery,
  summarizePeriod,
  type MonthlyTrendPoint,
  type DateRange,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useBreakpoint } from '../../lib/breakpoints';
import { useTheme } from '../../lib/theme';
import { useDismiss } from '../../lib/useDismiss';
import {
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  IconBadge,
  ModalHeader,
  Money,
  Reveal,
  Screen,
  SegmentedControl,
  Skeleton,
} from '../../components/ui';
import {
  FinancialChart,
  type FinancialChartType,
} from '../../components/FinancialChart';
import { RequireAuth } from '../../components/RequireAuth';

type Period = 'thisMonth' | 'lastMonth' | 'last3' | 'ytd';
type Grouping = 'category' | 'group' | 'merchant' | 'account';
type TrendMetric = 'income' | 'spending' | 'net';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last3', label: 'Last 3 months' },
  { value: 'ytd', label: 'This year' },
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

const TREND_MONTHS = 12;

function trendBoundsFor(todayIso: string): { range: DateRange; months: string[] } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - TREND_MONTHS + 1, 1),
  );
  const months: string[] = [];
  const cursor = new Date(start);

  while (cursor <= today) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return {
    range: { start: iso(start), end: todayIso },
    months,
  };
}

/**
 * Period bounds on the household calendar.
 *
 * Built in UTC from the household's own "today" rather than the device clock,
 * so a report says the same thing on a laptop in Seattle and a phone in Tokyo.
 */
function boundsFor(period: Period, todayIso: string): { current: DateRange; previous: DateRange } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  const monthRange = (offset: number): DateRange => ({
    start: iso(new Date(Date.UTC(year, month + offset, 1))),
    end: iso(new Date(Date.UTC(year, month + offset + 1, 0))),
  });

  if (period === 'thisMonth') {
    return { current: { ...monthRange(0), end: todayIso }, previous: monthRange(-1) };
  }
  if (period === 'lastMonth') {
    return { current: monthRange(-1), previous: monthRange(-2) };
  }
  if (period === 'last3') {
    return {
      current: { start: iso(new Date(Date.UTC(year, month - 2, 1))), end: todayIso },
      previous: {
        start: iso(new Date(Date.UTC(year, month - 5, 1))),
        end: iso(new Date(Date.UTC(year, month - 2, 0))),
      },
    };
  }

  return {
    current: { start: iso(new Date(Date.UTC(year, 0, 1))), end: todayIso },
    previous: {
      start: iso(new Date(Date.UTC(year - 1, 0, 1))),
      end: iso(new Date(Date.UTC(year - 1, month + 1, 0))),
    },
  };
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      aria-checked={active}
      className={`shrink-0 rounded-full border px-3.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
        active
          ? 'border-mint-600 bg-mint-600 shadow-sm shadow-mint-950/15'
          : 'border-ink-300 bg-white hover:border-mint-300 hover:bg-mint-50/50 active:bg-mint-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-800 dark:hover:bg-mint-950/30'
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-ink-600 dark:text-ink-300'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Tile({
  label,
  cents,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  cents: number;
  hint?: string | null;
  icon: IconName;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <Card className="min-w-[150px] flex-1 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <IconBadge
          name={icon}
          size={36}
          tone={tone === 'negative' ? 'warning' : 'accent'}
        />
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          {label}
        </Text>
      </View>
      <Money
        cents={cents}
        size="lg"
        className={
          tone === 'positive'
            ? 'text-positive dark:text-emerald-400'
            : tone === 'negative'
              ? 'text-ink-900 dark:text-ink-50'
              : 'text-ink-900 dark:text-ink-50'
        }
      />
      <Text
        numberOfLines={2}
        className="mt-1 min-h-8 text-xs leading-4 text-ink-500 dark:text-ink-400"
      >
        {hint ?? 'Current selected period'}
      </Text>
    </Card>
  );
}

function RateTile({ rate }: { rate: number | null }) {
  return (
    <Card className="min-w-[150px] flex-1 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <IconBadge name="leaf-outline" size={36} />
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Saved
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        className="text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50"
      >
        {rate === null ? '—' : `${Math.round(rate * 100)}%`}
      </Text>
      <Text className="mt-1 min-h-8 text-xs leading-4 text-ink-500 dark:text-ink-400">
        {rate === null ? 'No income this period' : 'Share of income kept'}
      </Text>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <View className="px-4 py-4">
      <View className="flex-row flex-wrap gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton
            key={index}
            className="h-36 min-w-[150px] flex-1"
            rounded="2xl"
          />
        ))}
      </View>
      <Skeleton className="mt-8 h-5 w-40" rounded="full" />
      <Skeleton className="mt-3 h-80 w-full" rounded="2xl" />
    </View>
  );
}

function trendValue(point: MonthlyTrendPoint, metric: TrendMetric): number {
  if (metric === 'income') return point.incomeCents;
  if (metric === 'spending') return point.spendingCents;
  return point.netCents;
}

function MonthlyTrendCard({
  points,
  metric,
  onMetricChange,
  chartType,
  onChartTypeChange,
  truncated,
}: {
  points: MonthlyTrendPoint[];
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  chartType: FinancialChartType;
  onChartTypeChange: (chartType: FinancialChartType) => void;
  truncated: boolean;
}) {
  const series = points.map((point) => ({
    date: `${point.month}-01`,
    valueCents: trendValue(point, metric),
  }));
  const latest = points[points.length - 1];
  const transactionCount = points.reduce(
    (total, point) => total + point.countedTransactions,
    0,
  );
  const metricLabel =
    metric === 'income' ? 'Income' : metric === 'spending' ? 'Spending' : 'Net cash flow';

  return (
    <Card className="mx-4 mt-4 overflow-hidden pb-4">
      <View className="h-1 bg-mint-500" />
      <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-4">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
            Monthly trend
          </Text>
          <Text className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
            Compare multiple periods
          </Text>
          <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Quiet months stay visible as zeroes.
          </Text>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Trend chart type"
          className="flex-row rounded-xl bg-ink-100 p-1 dark:bg-ink-800"
        >
          {(['line', 'bar'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => onChartTypeChange(option)}
              accessibilityRole="radio"
              accessibilityLabel={`${option} trend chart`}
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
        <SegmentedControl
          options={[
            { value: 'income' as const, label: 'Income' },
            { value: 'spending' as const, label: 'Spending' },
            { value: 'net' as const, label: 'Net flow' },
          ]}
          value={metric}
          onChange={onMetricChange}
          className="w-72"
        />
      </ScrollView>

      {truncated ? (
        <Text className="px-4 pb-2 text-sm text-amber-700 dark:text-amber-400">
          This trend reached the report row limit, so the comparison is partial.
        </Text>
      ) : null}

      <FinancialChart
        series={series}
        chartType={chartType}
        granularity="monthly"
        label={`${metricLabel} monthly trend`}
        headlineLabel={latest ? formatMonthLabel(`${latest.month}-01`) : 'Latest month'}
        headlineCents={latest ? trendValue(latest, metric) : 0}
        includeZero={metric === 'net'}
        height={210}
      />

      <View className="mt-4 px-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Monthly comparison
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pt-2"
        >
          {points.map((point) => (
            <View
              key={point.month}
              className="min-w-[104px] rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800"
            >
              <Text className="text-xs text-ink-500 dark:text-ink-400">
                {formatMonthLabel(`${point.month}-01`)}
              </Text>
              <Text className="mt-1 text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                {trendValue(point, metric) >= 0 ? '' : '−'}$
                {Math.abs(trendValue(point, metric) / 100).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-400 dark:text-ink-500">
                {point.countedTransactions.toLocaleString()} transactions
              </Text>
            </View>
          ))}
        </ScrollView>
        <Text className="mt-3 text-xs text-ink-500 dark:text-ink-400">
          {transactionCount.toLocaleString()} reportable transactions across {points.length}{' '}
          months.
        </Text>
      </View>
    </Card>
  );
}

function changeHint(currentCents: number, previousCents: number): string | null {
  const { deltaCents, deltaRatio } = comparePeriods(currentCents, previousCents);
  if (deltaCents === 0) return 'Same as last period';
  const direction = deltaCents > 0 ? 'more' : 'less';
  if (deltaRatio === null) return `${direction} than last period (nothing then)`;
  return `${Math.abs(Math.round(deltaRatio * 100))}% ${direction} than last period`;
}

function Reports() {
  const client = useClient();
  const router = useRouter();
  const dismiss = useDismiss('/' as Href);
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));
  const [period, setPeriod] = useState<Period>('thisMonth');
  const [grouping, setGrouping] = useState<Grouping>('category');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('spending');
  const [trendChartType, setTrendChartType] = useState<FinancialChartType>('line');

  const todayIso = new Date().toLocaleDateString('en-CA', {
    timeZone: profile.data?.timezone || 'UTC',
  });
  const bounds = useMemo(() => boundsFor(period, todayIso), [period, todayIso]);
  const trendBounds = useMemo(() => trendBoundsFor(todayIso), [todayIso]);

  const current = useQuery(reportPeriodQuery(client, bounds.current));
  const previous = useQuery(reportPeriodQuery(client, bounds.previous));
  const trendData = useQuery(reportPeriodQuery(client, trendBounds.range));

  const report = useMemo(() => {
    if (!current.data) return null;
    const types = buildGroupTypeByCategoryId(
      current.data.categories,
      current.data.groups,
    );

    return {
      summary: summarizePeriod(current.data.transactions, types),
      breakdown:
        grouping === 'category'
          ? breakdownByCategory(current.data.transactions, types)
          : grouping === 'group'
            ? breakdownByGroup(
                current.data.transactions,
                current.data.categories,
                current.data.groups,
              )
            : grouping === 'merchant'
              ? breakdownByMerchant(current.data.transactions, types)
              : breakdownByAccount(current.data.transactions, types),
    };
  }, [current.data, grouping]);

  const previousSummary = useMemo(() => {
    if (!previous.data) return null;
    return summarizePeriod(
      previous.data.transactions,
      buildGroupTypeByCategoryId(previous.data.categories, previous.data.groups),
    );
  }, [previous.data]);
  const leadingBreakdown = report?.breakdown.rows[0] ?? null;
  const trendPoints = useMemo(() => {
    if (!trendData.data) return [];
    return monthlyTrend(
      trendData.data.transactions,
      buildGroupTypeByCategoryId(trendData.data.categories, trendData.data.groups),
      trendBounds.months,
    );
  }, [trendData.data, trendBounds.months]);

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Reports"
        subtitle="Income, spending, and where your money went"
        onClose={dismiss}
      />

      <ScrollView
        contentContainerClassName="pb-20"
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 py-4 items-center"
          accessibilityRole="radiogroup"
          accessibilityLabel="Report period"
        >
          {PERIODS.map((option) => (
            <Pill
              key={option.value}
              label={option.label}
              active={period === option.value}
              onPress={() => setPeriod(option.value)}
            />
          ))}
        </ScrollView>

        {current.isPending ? (
          <ReportSkeleton />
        ) : current.isError ? (
          <ErrorNotice
            message={current.error.message}
            onRetry={() => current.refetch()}
          />
        ) : !report || report.summary.countedTransactions === 0 ? (
          <EmptyState
            icon="📊"
            title="Nothing to report yet"
            message="Transfers between your own accounts are left out, so a period with only transfers looks empty too."
          />
        ) : (
          <>
            {current.data?.truncated ? (
              <Text className="px-5 pb-1 text-sm text-amber-700 dark:text-amber-400">
                This period has more transactions than one report can hold, so
                the totals below are partial.
              </Text>
            ) : null}

            <Reveal className="flex-row flex-wrap gap-3 px-4">
              <Tile
                label="Income"
                cents={report.summary.incomeCents}
                icon="arrow-down-outline"
                tone="positive"
                hint={
                  previousSummary
                    ? changeHint(report.summary.incomeCents, previousSummary.incomeCents)
                    : null
                }
              />
              <Tile
                label="Spending"
                cents={report.summary.spendingCents}
                icon="arrow-up-outline"
                tone="negative"
                hint={
                  previousSummary
                    ? changeHint(
                        report.summary.spendingCents,
                        previousSummary.spendingCents,
                      )
                    : null
                }
              />
              <Tile
                label="Net cash flow"
                cents={report.summary.netCents}
                icon="pulse-outline"
                tone={report.summary.netCents >= 0 ? 'positive' : 'negative'}
              />
              <RateTile rate={report.summary.savingsRate} />
            </Reveal>

            <View className="flex-row flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-8">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                  Spending breakdown
                </Text>
                <Text className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
                  Where it went
                </Text>
              </View>
              <SegmentedControl
                options={[
                  { value: 'category', label: 'Category' },
                  { value: 'group', label: 'Group' },
                  { value: 'merchant', label: 'Merchant' },
                  { value: 'account', label: 'Account' },
                ]}
                value={grouping}
                onChange={setGrouping}
                className="w-full max-w-[34rem]"
              />
            </View>

            <View
              className={`gap-3 px-4 ${
                isLarge ? 'flex-row items-start' : ''
              }`}
            >
              <Card
                className={`overflow-hidden ${
                  isLarge ? 'min-w-0 flex-[1.65]' : ''
                }`}
              >
                {report.breakdown.rows.length === 0 ? (
                  <View className="items-center px-5 py-10">
                    <IconBadge name="pie-chart-outline" size={44} />
                    <Text className="mt-3 text-base font-semibold text-ink-900 dark:text-ink-50">
                      No spending this period
                    </Text>
                    <Text className="mt-1 text-center text-sm text-ink-500 dark:text-ink-400">
                      Income and transfers do not create a spending breakdown.
                    </Text>
                  </View>
                ) : (
                  report.breakdown.rows.map((row, index) => {
                    const drilldownParams =
                      row.id === 'uncategorized'
                        ? null
                        : grouping === 'category'
                          ? { categoryId: row.id }
                          : grouping === 'merchant'
                            ? { merchantId: row.id }
                            : grouping === 'account'
                              ? { accountId: row.id }
                              : null;
                    const canDrill = drilldownParams !== null;

                    return (
                      <View key={row.id}>
                        {index > 0 ? <Divider /> : null}
                        <Pressable
                          onPress={() => {
                            if (!drilldownParams) return;
                            router.push({
                              pathname: '/(tabs)/transactions',
                              params: {
                                ...drilldownParams,
                                startDate: bounds.current.start,
                                endDate: bounds.current.end,
                              },
                            });
                          }}
                          accessibilityRole={canDrill ? 'button' : 'text'}
                          accessibilityLabel={`${row.label}, ${Math.round(row.share * 100)} percent`}
                          className="px-4 py-3.5 hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint-500 dark:hover:bg-ink-800/70 dark:active:bg-ink-800"
                        >
                          <View className="flex-row items-center gap-3">
                            <View className="h-8 w-8 items-center justify-center rounded-full bg-ink-100 dark:bg-ink-800">
                              <Text className="text-xs font-semibold tabular-nums text-ink-500 dark:text-ink-400">
                                {index + 1}
                              </Text>
                            </View>
                            <View className="min-w-0 flex-1">
                              <Text
                                numberOfLines={1}
                                className="text-base font-medium text-ink-900 dark:text-ink-50"
                              >
                                {row.label}
                              </Text>
                              <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                                <View
                                  className="h-full rounded-full bg-mint-600"
                                  style={{
                                    width: `${Math.max(row.share * 100, 1)}%`,
                                  }}
                                />
                              </View>
                            </View>
                            <View className="items-end">
                              <Money cents={-row.amountCents} size="sm" />
                              <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                                {Math.round(row.share * 100)}%
                              </Text>
                            </View>
                            {canDrill ? (
                              <Ionicons
                                name="chevron-forward"
                                size={16}
                                color={colors.textMuted}
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </Card>

              <View className={isLarge ? 'min-w-0 flex-1 gap-3' : 'gap-3'}>
                {leadingBreakdown ? (
                  <Card className="overflow-hidden p-4">
                    <View className="absolute left-0 top-0 h-1 w-full bg-mint-500" />
                    <IconBadge name="trophy-outline" size={38} />
                    <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                      Largest {grouping}
                    </Text>
                    <Text
                      numberOfLines={2}
                      className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50"
                    >
                      {leadingBreakdown.label}
                    </Text>
                    <Money
                      cents={-leadingBreakdown.amountCents}
                      size="lg"
                      className="mt-2"
                    />
                    <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                      {Math.round(leadingBreakdown.share * 100)}% of spending
                    </Text>
                  </Card>
                ) : null}

                <Card className="p-4">
                  <View className="flex-row items-center gap-3">
                    <IconBadge name="information-circle-outline" size={38} />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        How this report works
                      </Text>
                      <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                        Transfers between your accounts are excluded. Split
                        transactions are counted once through their parts.
                      </Text>
                    </View>
                  </View>
                  <View className="mt-4 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800">
                    <Text className="text-xs text-ink-500 dark:text-ink-400">
                      {report.summary.countedTransactions.toLocaleString()}{' '}
                      transactions counted
                    </Text>
                  </View>
                </Card>
              </View>
            </View>
          </>
        )}

        {trendData.isPending ? (
          <View className="px-4 pt-4">
            <Skeleton className="h-72 w-full" rounded="2xl" />
          </View>
        ) : trendData.isError ? (
          <ErrorNotice
            message={trendData.error.message}
            onRetry={() => trendData.refetch()}
          />
        ) : trendPoints.some((point) => point.countedTransactions > 0) ? (
          <MonthlyTrendCard
            points={trendPoints}
            metric={trendMetric}
            onMetricChange={setTrendMetric}
            chartType={trendChartType}
            onChartTypeChange={setTrendChartType}
            truncated={trendData.data?.truncated ?? false}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

export default function ReportsRoute() {
  return (
    <RequireAuth>
      <Reports />
    </RequireAuth>
  );
}
