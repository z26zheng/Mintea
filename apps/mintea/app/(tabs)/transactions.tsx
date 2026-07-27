import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
  accountsQuery,
  bulkUpdateTransactions,
  categoriesQuery,
  formatTransactionDate,
  hydrateTransactions,
  merchantsQuery,
  sumCents,
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

type Section = { title: string; total: number; data: TransactionView[] };

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
  const [accountId, setAccountId] = useState<string | null>(null);
  const [showAccountFilter, setShowAccountFilter] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);

  // Debounce so each keystroke doesn't fire a query.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo<TransactionFilters>(
    () => ({
      ...(search ? { search } : {}),
      ...(reviewOnly ? { needsReview: true } : {}),
      ...(accountId ? { accountIds: [accountId] } : {}),
    }),
    [search, reviewOnly, accountId],
  );

  const page = useInfiniteQuery(transactionsQuery(client, filters));
  const categories = useQuery(categoriesQuery(client));
  const merchants = useQuery(merchantsQuery(client));
  const accounts = useQuery(accountsQuery(client));

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

        <View className="flex-row gap-2 px-4 pb-3">
          <FilterChip
            label="Needs review"
            active={reviewOnly}
            onPress={() => setReviewOnly((value) => !value)}
          />
          <FilterChip
            label={
              accountId
                ? (accounts.data?.find((a) => a.id === accountId)?.name ??
                  'Account')
                : 'All accounts'
            }
            active={accountId !== null}
            onPress={() => setShowAccountFilter((value) => !value)}
          />
        </View>

        {showAccountFilter ? (
          <View className="px-4 pb-3 flex-row flex-wrap gap-2">
            <FilterChip
              label="All"
              active={accountId === null}
              onPress={() => {
                setAccountId(null);
                setShowAccountFilter(false);
              }}
            />
            {accounts.data?.map((account) => (
              <FilterChip
                key={account.id}
                label={account.name}
                active={accountId === account.id}
                onPress={() => {
                  setAccountId(account.id);
                  setShowAccountFilter(false);
                }}
              />
            ))}
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
                  search || reviewOnly || accountId
                    ? 'Nothing matches'
                    : 'No transactions yet'
                }
                message={
                  search || reviewOnly || accountId
                    ? 'Try clearing your filters.'
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
    </View>
  );
}

function FilterChip({
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-3 py-1.5 rounded-full border ${
        active
          ? 'bg-mint-600 border-mint-600'
          : 'bg-white dark:bg-ink-900 border-ink-300 dark:border-ink-700'
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-ink-600 dark:text-ink-300'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
