import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  breakdownByCategory,
  breakdownByGroup,
  buildGroupTypeByCategoryId,
  comparePeriods,
  profileQuery,
  reportPeriodQuery,
  summarizePeriod,
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
import { RequireAuth } from '../../components/RequireAuth';

type Period = 'thisMonth' | 'lastMonth' | 'last3' | 'ytd';
type Grouping = 'category' | 'group';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last3', label: 'Last 3 months' },
  { value: 'ytd', label: 'This year' },
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

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

  const todayIso = new Date().toLocaleDateString('en-CA', {
    timeZone: profile.data?.timezone || 'UTC',
  });
  const bounds = useMemo(() => boundsFor(period, todayIso), [period, todayIso]);

  const current = useQuery(reportPeriodQuery(client, bounds.current));
  const previous = useQuery(reportPeriodQuery(client, bounds.previous));

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
          : breakdownByGroup(
              current.data.transactions,
              current.data.categories,
              current.data.groups,
            ),
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
                ]}
                value={grouping}
                onChange={setGrouping}
                className="w-52"
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
                    const canDrill =
                      grouping === 'category' && row.id !== 'uncategorized';

                    return (
                      <View key={row.id}>
                        {index > 0 ? <Divider /> : null}
                        <Pressable
                          // Drilldown only makes sense per category; a group maps
                          // to many category ids and the list filters by one set.
                          onPress={() =>
                            canDrill
                              ? router.push({
                                  pathname: '/(tabs)/transactions',
                                  params: {
                                    categoryId: row.id,
                                    startDate: bounds.current.start,
                                    endDate: bounds.current.end,
                                  },
                                })
                              : undefined
                          }
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
                      Largest {grouping === 'category' ? 'category' : 'group'}
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
