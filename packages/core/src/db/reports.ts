import type { MinteaClient } from './client';
import { fetchAccounts } from './accounts';
import {
  fetchCategories,
  fetchCategoryGroups,
  fetchMerchants,
} from './categories';
import {
  fetchTransactionsPage,
  hydrateTransactions,
  type TransactionView,
} from './transactions';
import type { CategoryRow, CategoryGroupRow, TransactionRow } from '../types/database';
import type { DateRange } from '../domain/dates';

/** PostgREST caps a response at 1000 rows regardless of what we ask for. */
const PAGE = 1000;

/**
 * A period is capped so an "all time" report cannot page forever. Far above a
 * normal month or year; the UI says so if a period is ever truncated.
 */
export const REPORT_ROW_LIMIT = 20_000;

export type ReportPeriodData = {
  transactions: TransactionView[];
  categories: CategoryRow[];
  groups: CategoryGroupRow[];
  /** True when the period hit the row cap and totals are therefore partial. */
  truncated: boolean;
};

/**
 * Everything a report needs for one period.
 *
 * Split children are included — they carry the categorisation a breakdown is
 * built from. The domain layer drops the parents whose children came back, so
 * amounts are never counted twice.
 */
export async function fetchReportPeriod(
  client: MinteaClient,
  range: DateRange,
): Promise<ReportPeriodData> {
  const rows: TransactionRow[] = [];
  let truncated = false;

  for (let page = 0; ; page += 1) {
    const result = await fetchTransactionsPage(client, {
      filters: {
        startDate: range.start,
        endDate: range.end,
        includeSplitChildren: true,
      },
      page,
      pageSize: PAGE,
    });

    rows.push(...result.transactions);

    if (rows.length >= REPORT_ROW_LIMIT) {
      truncated = result.nextPage !== null;
      break;
    }
    if (result.nextPage === null) break;
  }

  const [categories, groups, merchants, accounts] = await Promise.all([
    fetchCategories(client),
    fetchCategoryGroups(client),
    fetchMerchants(client),
    fetchAccounts(client),
  ]);

  return {
    transactions: hydrateTransactions(rows.slice(0, REPORT_ROW_LIMIT), {
      categories,
      merchants,
      accounts,
    }),
    categories,
    groups,
    truncated,
  };
}
