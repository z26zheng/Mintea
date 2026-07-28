import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  accountGroupKey,
  accountsQuery,
  ACCOUNT_GROUP_LABELS,
  bulkUpdateTransactions,
  categoriesQuery,
  categoryTreeQuery,
  formatMoney,
  formatTransactionDate,
  hydrateTransactions,
  merchantsQuery,
  parseMoney,
  profileQuery,
  resolveRange,
  sumCents,
  toIsoDateInTimeZone,
  transactionsQuery,
  type CategoryRow,
  type TransactionFilters,
  type TransactionView,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  Money,
  Title,
} from '../../components/ui';
import { TransactionRow } from '../../components/TransactionRow';
import { CategoryPicker } from '../../components/CategoryPicker';
import {
  AmountSheet,
  ChoiceSheet,
  FilterChip,
  MultiSelectSheet,
  type SelectOption,
} from '../../components/FilterSheet';

type Section = { title: string; total: number; data: TransactionView[] };

type Direction = 'all' | 'income' | 'expense';
type Period = 'all' | '1M' | '3M' | '6M' | 'YTD' | '1Y';
type SheetName = null | 'accounts' | 'categories' | 'direction' | 'period' | 'amount';

const DIRECTION_OPTIONS: Array<{
  value: Direction;
  label: string;
  description?: string;
}> = [
  { value: 'all', label: 'All transactions' },
  { value: 'income', label: 'Money in', description: 'Deposits, income, refunds' },
  { value: 'expense', label: 'Money out', description: 'Spending and payments' },
];

const DIRECTION_LABELS: Record<Direction, string> = {
  all: 'Any type',
  income: 'Money in',
  expense: 'Money out',
};

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: '1M', label: 'Last month' },
  { value: '3M', label: 'Last 3 months' },
  { value: '6M', label: 'Last 6 months' },
  { value: 'YTD', label: 'This year' },
  { value: '1Y', label: 'Last 12 months' },
];

const PERIOD_LABELS: Record<Period, string> = {
  all: 'Any date',
  '1M': 'Last month',
  '3M': 'Last 3 months',
  '6M': 'Last 6 months',
  YTD: 'This year',
  '1Y': 'Last 12 months',
};

function groupByDate(transactions: TransactionView[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const transaction of transactions) {
    const title = formatTransactionDate(transaction.date);

    if (!current || current.title !== title) {
      current = { title, total: 0, data: [] };
      sections.push(current);
    }

    current.data.push(transaction);
    current.total += transaction.amount_cents;
  }

  return sections;
}

export default function Transactions() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [direction, setDirection] = useState<Direction>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [amount, setAmount] = useState({ min: '', max: '' });
  const [openSheet, setOpenSheet] = useState<SheetName>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);

  // Debounce so each keystroke doesn't fire a query.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const categories = useQuery(categoriesQuery(client));
  const categoryTree = useQuery(categoryTreeQuery(client));
  const merchants = useQuery(merchantsQuery(client));
  const accounts = useQuery(accountsQuery(client));
  const profile = useQuery(profileQuery(client));

  const dateRange = useMemo(() => {
    if (period === 'all') return null;

    // Resolved in the household's calendar so a filter boundary agrees with
    // the dates the syncs actually wrote.
    const timeZone = profile.data?.timezone;
    return resolveRange(period, {
      ...(timeZone
        ? { todayIso: toIsoDateInTimeZone(new Date(), timeZone) }
        : {}),
    });
  }, [period, profile.data?.timezone]);

  const filters = useMemo<TransactionFilters>(() => {
    const minCents = parseMoney(amount.min);
    const maxCents = parseMoney(amount.max);

    return {
      ...(search ? { search } : {}),
      ...(reviewOnly ? { needsReview: true } : {}),
      ...(accountIds.length ? { accountIds } : {}),
      ...(categoryIds.length ? { categoryIds } : {}),
      ...(direction !== 'all' ? { direction } : {}),
      ...(dateRange ? { startDate: dateRange.start, endDate: dateRange.end } : {}),
      ...(minCents !== null ? { minCents } : {}),
      ...(maxCents !== null ? { maxCents } : {}),
    };
  }, [search, reviewOnly, accountIds, categoryIds, direction, dateRange, amount]);

  const page = useInfiniteQuery(transactionsQuery(client, filters));

  // Accounts are grouped in the picker the same way the accounts tab groups
  // them — with 40+ of them, a flat alphabetical list is unusable.
  const accountOptions = useMemo<SelectOption[]>(
    () =>
      (accounts.data ?? []).map((account) => ({
        id: account.id,
        label: account.name,
        ...(account.mask ? { sublabel: `••${account.mask}` } : {}),
        group: ACCOUNT_GROUP_LABELS[accountGroupKey(account)],
      })),
    [accounts.data],
  );

  const categoryOptions = useMemo<SelectOption[]>(
    () =>
      (categoryTree.data ?? []).flatMap((group) =>
        group.categories.map((category) => ({
          id: category.id,
          label: `${category.icon} ${category.name}`,
          group: group.name,
        })),
      ),
    [categoryTree.data],
  );

  const activeFilterCount =
    (reviewOnly ? 1 : 0) +
    (accountIds.length ? 1 : 0) +
    (categoryIds.length ? 1 : 0) +
    (direction !== 'all' ? 1 : 0) +
    (period !== 'all' ? 1 : 0) +
    (amount.min || amount.max ? 1 : 0);

  const clearFilters = () => {
    setReviewOnly(false);
    setAccountIds([]);
    setCategoryIds([]);
    setDirection('all');
    setPeriod('all');
    setAmount({ min: '', max: '' });
  };

  const accountLabel =
    accountIds.length === 0
      ? 'All accounts'
      : accountIds.length === 1
        ? (accounts.data?.find((a) => a.id === accountIds[0])?.name ?? '1 account')
        : `${accountIds.length} accounts`;

  const categoryLabel =
    categoryIds.length === 0
      ? 'All categories'
      : categoryIds.length === 1
        ? (categories.data?.find((c) => c.id === categoryIds[0])?.name ??
          '1 category')
        : `${categoryIds.length} categories`;

  const amountLabel = (() => {
    const min = parseMoney(amount.min);
    const max = parseMoney(amount.max);
    if (min === null && max === null) return 'Any amount';
    if (min !== null && max !== null) {
      return `${formatMoney(min, { hideCents: true })}–${formatMoney(max, { hideCents: true })}`;
    }
    if (min !== null) return `${formatMoney(min, { hideCents: true })}+`;
    return `Under ${formatMoney(max!, { hideCents: true })}`;
  })();

  const transactions = useMemo(() => {
    if (!page.data || !categories.data || !merchants.data || !accounts.data) {
      return [];
    }

    return hydrateTransactions(
      page.data.pages.flatMap((result) => result.transactions),
      {
        categories: categories.data,
        merchants: merchants.data,
        accounts: accounts.data,
      },
    );
  }, [page.data, categories.data, merchants.data, accounts.data]);

  const sections = useMemo(() => groupByDate(transactions), [transactions]);

  const categorize = useMutation({
    mutationFn: (category: CategoryRow) =>
      bulkUpdateTransactions(client, [...selected], {
        category_id: category.id,
        needs_review: false,
      }),
    onSuccess: async () => {
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const markReviewed = useMutation({
    mutationFn: () =>
      bulkUpdateTransactions(client, [...selected], { needs_review: false }),
    onSuccess: async () => {
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const toggleSelect = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectionMode = selected.size > 0;
  const isLoading = page.isPending || categories.isPending || accounts.isPending;

  return (
    <View className="flex-1 bg-ink-50 dark:bg-ink-950">
      <View className="w-full max-w-3xl self-center flex-1">
        <View className="px-4 pt-6 pb-3 flex-row items-center justify-between">
          <Title>Transactions</Title>
          <Pressable
            onPress={() => router.push('/transaction/new')}
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
            className="p-2 rounded-full active:bg-ink-100 dark:active:bg-ink-800"
          >
            <Ionicons name="add" size={24} color={colors.accent} />
          </Pressable>
        </View>

        <View className="px-4 pb-2">
          <View className="flex-row items-center bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 rounded-xl h-11 px-3 gap-2">
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search transactions"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              className="flex-1 text-base text-ink-900 dark:text-ink-50"
            />
            {searchInput ? (
              <Pressable onPress={() => setSearchInput('')} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* One row, horizontally scrollable. Each chip summarises its own
            state and opens a sheet, so the bar stays one line deep no matter
            how many accounts or categories exist. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // items-center: a horizontal ScrollView stretches children to its
          // full height by default, which turned the pills into tall ovals.
          contentContainerClassName="px-4 pb-3 gap-2 items-center"
        >
          <FilterChip
            label={accountLabel}
            active={accountIds.length > 0}
            onPress={() => setOpenSheet('accounts')}
          />
          <FilterChip
            label={categoryLabel}
            active={categoryIds.length > 0}
            onPress={() => setOpenSheet('categories')}
          />
          <FilterChip
            label={DIRECTION_LABELS[direction]}
            active={direction !== 'all'}
            onPress={() => setOpenSheet('direction')}
          />
          <FilterChip
            label={PERIOD_LABELS[period]}
            active={period !== 'all'}
            onPress={() => setOpenSheet('period')}
          />
          <FilterChip
            label={amountLabel}
            active={Boolean(amount.min || amount.max)}
            onPress={() => setOpenSheet('amount')}
          />
          <FilterChip
            label="Needs review"
            active={reviewOnly}
            showChevron={false}
            onPress={() => setReviewOnly((value) => !value)}
          />
        </ScrollView>

        {activeFilterCount > 0 ? (
          <View className="flex-row items-center gap-2 px-4 pb-3">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </Text>
            <Pressable onPress={clearFilters} accessibilityRole="button" hitSlop={8}>
              <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                Clear all
              </Text>
            </Pressable>
          </View>
        ) : null}

        {page.isError ? (
          <ErrorNotice
            message={page.error.message}
            onRetry={() => page.refetch()}
          />
        ) : null}

        {isLoading ? (
          <Loading label="Loading transactions…" />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled
            contentContainerClassName="pb-32"
            onEndReached={() => {
              if (page.hasNextPage && !page.isFetchingNextPage) {
                page.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            renderSectionHeader={({ section }) => (
              <View className="flex-row items-center justify-between px-4 py-2 bg-ink-50 dark:bg-ink-950">
                <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  {section.title}
                </Text>
                <Money
                  cents={section.total}
                  size="sm"
                  colorize="income-only"
                  className="text-ink-400 dark:text-ink-500"
                />
              </View>
            )}
            renderItem={({ item }) => (
              <TransactionRow
                transaction={item}
                selectionMode={selectionMode}
                selected={selected.has(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
                onPress={() => router.push(`/transaction/${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="🧾"
                title={
                  search || activeFilterCount > 0
                    ? 'Nothing matches'
                    : 'No transactions yet'
                }
                message={
                  search || activeFilterCount > 0
                    ? 'Try widening or clearing your filters.'
                    : 'Connect an account, or add a transaction by hand.'
                }
              />
            }
            ListFooterComponent={
              page.isFetchingNextPage ? (
                <View className="py-6">
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : null
            }
          />
        )}
      </View>

      {selectionMode ? (
        <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-ink-900 border-t border-ink-200 dark:border-ink-800 px-4 py-3">
          <View className="w-full max-w-3xl self-center flex-row items-center gap-3">
            <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>

            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                {selected.size} selected
              </Text>
              <Money
                cents={sumCents(
                  transactions
                    .filter((item) => selected.has(item.id))
                    .map((item) => item.amount_cents),
                )}
                size="sm"
                className="text-ink-500 dark:text-ink-400"
              />
            </View>

            <Pressable
              onPress={() => markReviewed.mutate()}
              className="px-3 py-2 rounded-lg active:bg-ink-100 dark:active:bg-ink-800"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-ink-600 dark:text-ink-300">
                Reviewed
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setPicking(true)}
              className="px-4 py-2 rounded-lg bg-mint-600 active:bg-mint-700"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-white">
                Categorize
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <CategoryPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(category) => categorize.mutate(category)}
        title={`Categorize ${selected.size}`}
      />

      <MultiSelectSheet
        visible={openSheet === 'accounts'}
        title="Accounts"
        options={accountOptions}
        selected={accountIds}
        onChange={setAccountIds}
        onClose={() => setOpenSheet(null)}
        searchPlaceholder="Search accounts"
      />

      <MultiSelectSheet
        visible={openSheet === 'categories'}
        title="Categories"
        options={categoryOptions}
        selected={categoryIds}
        onChange={setCategoryIds}
        onClose={() => setOpenSheet(null)}
        searchPlaceholder="Search categories"
      />

      <ChoiceSheet
        visible={openSheet === 'direction'}
        title="Type"
        options={DIRECTION_OPTIONS}
        value={direction}
        onChange={setDirection}
        onClose={() => setOpenSheet(null)}
      />

      <ChoiceSheet
        visible={openSheet === 'period'}
        title="Date range"
        options={PERIOD_OPTIONS}
        value={period}
        onChange={setPeriod}
        onClose={() => setOpenSheet(null)}
      />

      <AmountSheet
        visible={openSheet === 'amount'}
        min={amount.min}
        max={amount.max}
        onChange={setAmount}
        onClose={() => setOpenSheet(null)}
      />
    </View>
  );
}
