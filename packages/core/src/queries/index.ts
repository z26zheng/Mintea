/**
 * Query definitions shared by every platform.
 *
 * These are `queryOptions` factories rather than hooks, which keeps this
 * package free of JSX and of any React context of its own. The app calls
 * `useQuery(accountsQuery(client))` and owns the provider tree.
 */
import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query';

import type { MinteaClient } from '../db/client';
import { fetchProfile } from '../db/session';
import {
  attachInstitutions,
  fetchAccounts,
  fetchPlaidItems,
} from '../db/accounts';
import {
  buildCategoryTree,
  fetchCategories,
  fetchCategoryGroups,
  fetchMerchants,
} from '../db/categories';
import {
  fetchNetWorthSeries,
  fetchEarliestBalanceDate,
} from '../db/netWorth';
import {
  fetchEarliestFinancialActivityDate,
  fetchFinancialChartSeries,
} from '../db/financialCharts';
import {
  fetchSplits,
  fetchTransferCandidates,
  fetchTransaction,
  fetchTransactionsPage,
  PAGE_SIZE,
  type TransactionFilters,
} from '../db/transactions';
import {
  fetchTransactionRulePreview,
  fetchTransactionRules,
} from '../db/transactionRules';
import { fetchProperties, fetchProperty } from '../db/property';
import { fetchReportPeriod } from '../db/reports';
import {
  fetchTags,
  fetchTagsForTransactions,
  fetchTagsWithUsage,
  fetchTransactionTagIds,
} from '../db/tags';
import type { DateRange } from '../domain/dates';

export const queryKeys = {
  profile: ['profile'] as const,
  accounts: ['accounts'] as const,
  plaidItems: ['plaid-items'] as const,
  accountsWithInstitutions: ['accounts', 'with-institutions'] as const,
  categories: ['categories'] as const,
  categoryGroups: ['category-groups'] as const,
  categoryTree: ['categories', 'tree'] as const,
  merchants: ['merchants'] as const,
  tags: ['tags'] as const,
  tagsWithUsage: ['tags', 'usage'] as const,
  transactionTagMap: (ids: string[]) =>
    ['transactions', 'tag-map', ids] as const,
  transactions: (filters: TransactionFilters) =>
    ['transactions', filters] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  transactionSplits: (id: string) => ['transactions', 'splits', id] as const,
  transactionTags: (id: string) => ['transactions', 'tags', id] as const,
  transferCandidates: (id: string) =>
    ['transactions', 'transfer-candidates', id] as const,
  transactionRules: ['transaction-rules'] as const,
  transactionRulePreview: (id: string) =>
    ['transaction-rules', 'preview', id] as const,
  netWorth: (range: DateRange) => ['net-worth', range.start, range.end] as const,
  earliestBalance: ['net-worth', 'earliest'] as const,
  financialChart: (range: DateRange) =>
    ['financial-chart', range.start, range.end] as const,
  earliestFinancialActivity: ['financial-chart', 'earliest'] as const,
  reportPeriod: (range: DateRange) =>
    ['reports', range.start, range.end] as const,
  properties: ['properties'] as const,
  property: (accountId: string) => ['properties', accountId] as const,
} as const;

/** Reference data changes rarely; no need to refetch it on every focus. */
const REFERENCE_DATA_STALE_MS = 5 * 60 * 1000;

export const profileQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.profile,
    queryFn: () => fetchProfile(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const accountsQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.accounts,
    queryFn: () => fetchAccounts(client),
  });

export const plaidItemsQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.plaidItems,
    queryFn: () => fetchPlaidItems(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

/**
 * Accounts joined to their institutions. Kept as its own query so the two
 * halves stay independently cacheable while consumers get one list.
 */
export const accountsWithInstitutionsQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.accountsWithInstitutions,
    queryFn: async () => {
      const [accounts, items] = await Promise.all([
        fetchAccounts(client),
        fetchPlaidItems(client),
      ]);
      return attachInstitutions(accounts, items);
    },
  });

export const categoriesQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.categories,
    queryFn: () => fetchCategories(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const categoryGroupsQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.categoryGroups,
    queryFn: () => fetchCategoryGroups(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const categoryTreeQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.categoryTree,
    queryFn: async () => {
      const [groups, categories] = await Promise.all([
        fetchCategoryGroups(client),
        fetchCategories(client),
      ]);
      return buildCategoryTree(groups, categories);
    },
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const merchantsQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.merchants,
    queryFn: () => fetchMerchants(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const tagsQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.tags,
    queryFn: () => fetchTags(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

/** Tags plus usage counts, for the management screen and delete confirmation. */
export const tagsWithUsageQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.tagsWithUsage,
    queryFn: () => fetchTagsWithUsage(client),
  });

/**
 * Tag assignments for one page of transactions.
 *
 * Keyed on the ids so scrolling a new page fetches its own assignments rather
 * than refetching every row already on screen.
 */
export const transactionTagMapQuery = (
  client: MinteaClient,
  transactionIds: string[],
) =>
  queryOptions({
    queryKey: queryKeys.transactionTagMap(transactionIds),
    queryFn: () => fetchTagsForTransactions(client, transactionIds),
    enabled: transactionIds.length > 0,
  });

export const transactionsQuery = (
  client: MinteaClient,
  filters: TransactionFilters,
) =>
  infiniteQueryOptions({
    queryKey: queryKeys.transactions(filters),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage(client, { filters, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    // Re-fetching every page on window focus is expensive once the user has
    // scrolled; only the first page is refreshed.
    maxPages: undefined,
  });

export const transactionQuery = (client: MinteaClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.transaction(id),
    queryFn: () => fetchTransaction(client, id),
  });

export const transactionSplitsQuery = (client: MinteaClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.transactionSplits(id),
    queryFn: () => fetchSplits(client, id),
  });

export const transactionTagsQuery = (client: MinteaClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.transactionTags(id),
    queryFn: () => fetchTransactionTagIds(client, id),
  });

export const transferCandidatesQuery = (client: MinteaClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.transferCandidates(id),
    queryFn: () => fetchTransferCandidates(client, id),
  });

export const transactionRulesQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.transactionRules,
    queryFn: () => fetchTransactionRules(client),
  });

export const transactionRulePreviewQuery = (
  client: MinteaClient,
  transactionId: string,
) =>
  queryOptions({
    queryKey: queryKeys.transactionRulePreview(transactionId),
    queryFn: () => fetchTransactionRulePreview(client, transactionId),
  });

export const netWorthQuery = (client: MinteaClient, range: DateRange) =>
  queryOptions({
    queryKey: queryKeys.netWorth(range),
    queryFn: () => fetchNetWorthSeries(client, range),
  });

export const earliestBalanceQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.earliestBalance,
    queryFn: () => fetchEarliestBalanceDate(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const financialChartQuery = (
  client: MinteaClient,
  range: DateRange,
) =>
  queryOptions({
    queryKey: queryKeys.financialChart(range),
    queryFn: () => fetchFinancialChartSeries(client, range),
  });

export const earliestFinancialActivityQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.earliestFinancialActivity,
    queryFn: () => fetchEarliestFinancialActivityDate(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

/** One period's transactions plus the reference data a breakdown needs. */
export const reportPeriodQuery = (client: MinteaClient, range: DateRange) =>
  queryOptions({
    queryKey: queryKeys.reportPeriod(range),
    queryFn: () => fetchReportPeriod(client, range),
  });

export const propertiesQuery = (client: MinteaClient) =>
  queryOptions({
    queryKey: queryKeys.properties,
    queryFn: () => fetchProperties(client),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

export const propertyQuery = (client: MinteaClient, accountId: string) =>
  queryOptions({
    queryKey: queryKeys.property(accountId),
    queryFn: () => fetchProperty(client, accountId),
  });

export { PAGE_SIZE };
