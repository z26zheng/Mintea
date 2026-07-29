import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
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
import { useDismiss } from '../../lib/useDismiss';
import {
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  Loading,
  ModalHeader,
  Money,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';

type Period = 'thisMonth' | 'lastMonth' | 'last3' | 'ytd';
type Grouping = 'category' | 'group';

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
      accessibilityState={{ selected: active }}
      className={`shrink-0 rounded-full border px-3 py-1.5 ${
        active
          ? 'border-mint-600 bg-mint-600'
          : 'border-ink-300 bg-white dark:border-ink-700 dark:bg-ink-900'
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
  tone = 'neutral',
}: {
  label: string;
  cents: number;
  hint?: string | null;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <View className="flex-1 min-w-[140px] px-4 py-3">
      <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {label}
      </Text>
      <Money
        cents={cents}
        size="lg"
        className={
          tone === 'positive'
            ? 'text-positive'
            : tone === 'negative'
              ? 'text-negative'
              : 'text-ink-900 dark:text-ink-50'
        }
      />
      {hint ? (
        <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{hint}</Text>
      ) : null}
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

  return (
    <Screen>
      <ModalHeader title="Reports" onClose={dismiss} />

      <ScrollView contentContainerClassName="pb-16">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 py-3 items-center"
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
          <Loading label="Building your report…" />
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

            <Card className="mx-4 flex-row flex-wrap">
              <Tile
                label="Income"
                cents={report.summary.incomeCents}
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
            </Card>

            <Card className="mx-4 mt-3 flex-row flex-wrap">
              <Tile
                label="Net cash flow"
                cents={report.summary.netCents}
                tone={report.summary.netCents >= 0 ? 'positive' : 'negative'}
              />
              <View className="flex-1 min-w-[140px] px-4 py-3">
                <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Saved
                </Text>
                <Text className="text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  {report.summary.savingsRate === null
                    ? '—'
                    : `${Math.round(report.summary.savingsRate * 100)}%`}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  {report.summary.savingsRate === null
                    ? 'No income this period'
                    : 'of income kept'}
                </Text>
              </View>
            </Card>

            <View className="flex-row items-center justify-between px-5 pb-2 pt-8">
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Where it went
              </Text>
              <View className="flex-row gap-2">
                <Pill
                  label="Category"
                  active={grouping === 'category'}
                  onPress={() => setGrouping('category')}
                />
                <Pill
                  label="Group"
                  active={grouping === 'group'}
                  onPress={() => setGrouping('group')}
                />
              </View>
            </View>

            <Card className="mx-4 overflow-hidden">
              {report.breakdown.rows.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    // Drilldown only makes sense per category; a group maps to
                    // many category ids and the list filters by one set.
                    onPress={() =>
                      grouping === 'category' && row.id !== 'uncategorized'
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
                    accessibilityRole={grouping === 'category' ? 'button' : 'text'}
                    accessibilityLabel={`${row.label}, ${Math.round(row.share * 100)} percent`}
                    className="px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
                  >
                    <View className="flex-row items-center gap-3">
                      <Text
                        numberOfLines={1}
                        className="min-w-0 flex-1 text-base text-ink-900 dark:text-ink-50"
                      >
                        {row.label}
                      </Text>
                      <Money cents={-row.amountCents} size="sm" />
                      <Text className="w-10 text-right text-sm text-ink-500 dark:text-ink-400">
                        {Math.round(row.share * 100)}%
                      </Text>
                    </View>

                    <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <View
                        className="h-full rounded-full bg-mint-600"
                        style={{ width: `${Math.max(row.share * 100, 1)}%` }}
                      />
                    </View>
                  </Pressable>
                </View>
              ))}
            </Card>

            <Text className="px-5 pt-4 text-xs leading-4 text-ink-400 dark:text-ink-500">
              Transfers between your own accounts are excluded, and a split is
              counted once through its parts.
            </Text>
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
