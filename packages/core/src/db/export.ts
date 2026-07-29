import type { MinteaClient } from './client';
import { fetchAccounts, fetchPlaidItems, attachInstitutions } from './accounts';
import { fetchCategories, fetchMerchants } from './categories';
import { fetchTagsForTransactions, fetchTags } from './tags';
import {
  fetchTransactionsPage,
  hydrateTransactions,
  type TransactionFilters,
  type TransactionView,
} from './transactions';
import type { TransactionRow } from '../types/database';
import type { AccountWithInstitution } from '../domain/accounts';

/**
 * A ceiling on one export, so a runaway loop can't page forever and a browser
 * isn't asked to hold an unbounded string in memory. Well above a decade of
 * ordinary activity; the UI says so when it bites.
 */
export const EXPORT_ROW_LIMIT = 50_000;

/** PostgREST caps a response at 1000 rows regardless of what we ask for. */
const EXPORT_PAGE_SIZE = 1000;

export type ExportProgress = { loaded: number; done: boolean };

/**
 * Every transaction matching the filters, not just the page on screen.
 *
 * The list view pages as you scroll, but an export that silently stopped at
 * the first page would be worse than no export at all — it would look
 * complete. This walks the whole result set and reports progress so a long
 * pull can show something.
 *
 * Row selection matches the list exactly, split handling included: parents
 * carry the amount and are what gets exported, except when filtering by
 * category, where the children hold the categorisation the user asked for.
 */
export async function fetchTransactionsForExport(
  client: MinteaClient,
  options: {
    filters?: TransactionFilters;
    onProgress?: (progress: ExportProgress) => void;
  } = {},
): Promise<TransactionView[]> {
  const rows: TransactionRow[] = [];

  for (let page = 0; ; page += 1) {
    const result = await fetchTransactionsPage(client, {
      filters: options.filters,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    });

    rows.push(...result.transactions);
    options.onProgress?.({ loaded: rows.length, done: false });

    if (result.nextPage === null || rows.length >= EXPORT_ROW_LIMIT) break;
  }

  const capped = rows.slice(0, EXPORT_ROW_LIMIT);

  // Reference data is small and shared across every row; fetch it once rather
  // than joining it onto each page.
  const [categories, merchants, accounts, tags] = await Promise.all([
    fetchCategories(client),
    fetchMerchants(client),
    fetchAccounts(client),
    fetchTags(client),
  ]);

  const tagIdsByTransaction = await fetchTagsForTransactionsInChunks(
    client,
    capped.map((row) => row.id),
  );

  options.onProgress?.({ loaded: capped.length, done: true });

  return hydrateTransactions(capped, {
    categories,
    merchants,
    accounts,
    tags,
    tagIdsByTransaction,
  });
}

/**
 * Tag lookups go through an `id=in.(…)` list, which has to stay inside the
 * request-line limit — so chunk it rather than asking for 50,000 ids at once.
 */
async function fetchTagsForTransactionsInChunks(
  client: MinteaClient,
  ids: string[],
): Promise<Map<string, string[]>> {
  const CHUNK = 200;
  const combined = new Map<string, string[]>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = await fetchTagsForTransactions(client, ids.slice(i, i + CHUNK));
    for (const [transactionId, tagIds] of chunk) {
      combined.set(transactionId, tagIds);
    }
  }

  return combined;
}

/** Accounts with their institutions, including hidden ones. */
export async function fetchAccountsForExport(
  client: MinteaClient,
): Promise<AccountWithInstitution[]> {
  const [accounts, items] = await Promise.all([
    fetchAccounts(client),
    fetchPlaidItems(client),
  ]);

  return attachInstitutions(accounts, items);
}
