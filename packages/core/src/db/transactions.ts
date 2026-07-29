import type { MinteaClient } from './client';
import { unwrap } from './client';
import type {
  AccountRow,
  CategoryRow,
  MerchantRow,
  TagRow,
  TransferCandidateRow,
  TransactionRow,
} from '../types/database';
import type { IsoDate } from '../domain/dates';
import type { Cents } from '../domain/money';

export type TransactionFilters = {
  /** Matches description and notes, case-insensitively. */
  search?: string;
  accountIds?: string[];
  categoryIds?: string[];
  merchantIds?: string[];
  tagIds?: string[];
  startDate?: IsoDate;
  endDate?: IsoDate;
  /** Bounds on the absolute amount, in cents. */
  minCents?: Cents;
  maxCents?: Cents;
  needsReview?: boolean;
  /** Hidden transactions are excluded from reports and, by default, the list. */
  includeHidden?: boolean;
  direction?: 'income' | 'expense';
};

export const EMPTY_FILTERS: TransactionFilters = {};

export const PAGE_SIZE = 50;

/**
 * PostgREST's `or=(...)` is comma-delimited, so a search term containing a
 * comma or parenthesis would corrupt the filter. Wrapping the value in double
 * quotes (escaping quotes and backslashes) makes it a literal.
 */
function orLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Transactions with their reference data attached. Categories, merchants and
 * accounts are small, cached separately, and joined here rather than embedded
 * in every row of every page.
 */
export type TransactionView = TransactionRow & {
  category: CategoryRow | null;
  merchant: MerchantRow | null;
  account: AccountRow | null;
  tags: TagRow[];
};

export function hydrateTransactions(
  transactions: TransactionRow[],
  lookups: {
    categories: CategoryRow[];
    merchants: MerchantRow[];
    accounts: AccountRow[];
    /** All household tags, and which ids each transaction carries. */
    tags?: TagRow[];
    tagIdsByTransaction?: Map<string, string[]>;
  },
): TransactionView[] {
  const categories = new Map(lookups.categories.map((c) => [c.id, c]));
  const merchants = new Map(lookups.merchants.map((m) => [m.id, m]));
  const accounts = new Map(lookups.accounts.map((a) => [a.id, a]));
  const tags = new Map((lookups.tags ?? []).map((t) => [t.id, t]));

  return transactions.map((transaction) => ({
    ...transaction,
    category: transaction.category_id
      ? categories.get(transaction.category_id) ?? null
      : null,
    merchant: transaction.merchant_id
      ? merchants.get(transaction.merchant_id) ?? null
      : null,
    account: accounts.get(transaction.account_id) ?? null,
    // A tag id with no matching row means the tag was deleted between the two
    // requests; drop it rather than rendering a blank chip.
    tags: (lookups.tagIdsByTransaction?.get(transaction.id) ?? []).flatMap(
      (id) => {
        const tag = tags.get(id);
        return tag ? [tag] : [];
      },
    ),
  }));
}

export type TransactionPage = {
  transactions: TransactionRow[];
  /** Offset to pass as `page` for the next request, or null at the end. */
  nextPage: number | null;
};

export async function fetchTransactionsPage(
  client: MinteaClient,
  options: { filters?: TransactionFilters; page?: number; pageSize?: number } = {},
): Promise<TransactionPage> {
  const filters = options.filters ?? EMPTY_FILTERS;
  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? PAGE_SIZE;

  // Tag filtering rides on an inner-joined embed rather than looking the ids up
  // first and passing them back as `id=in.(…)`: that list grows with the number
  // of tagged transactions and overruns the request-line limit somewhere in the
  // low hundreds, which a tag like "Reimbursable" reaches in normal use.
  const filteringByTag = (filters.tagIds?.length ?? 0) > 0;

  let query = client
    .from('transactions')
    .select('*, transaction_tags(tag_id)')
    .is('deleted_at', null);

  // Split children carry the real categorisation, parents carry the real
  // amount. Showing only parents keeps list totals correct — except when
  // filtering by category, where the user is looking for the children.
  const filteringByCategory =
    filters.categoryIds !== undefined && filters.categoryIds.length > 0;

  if (!filteringByCategory) {
    query = query.is('parent_id', null);
  }

  if (!filters.includeHidden) {
    query = query.eq('is_hidden', false);
  }

  if (filters.startDate) query = query.gte('date', filters.startDate);
  if (filters.endDate) query = query.lte('date', filters.endDate);

  if (filters.accountIds?.length) {
    query = query.in('account_id', filters.accountIds);
  }

  if (filteringByCategory) {
    query = query.in('category_id', filters.categoryIds!);
  }

  if (filters.merchantIds?.length) {
    query = query.in('merchant_id', filters.merchantIds);
  }

  if (filters.needsReview !== undefined) {
    query = query.eq('needs_review', filters.needsReview);
  }

  if (filters.direction === 'income') query = query.gt('amount_cents', 0);
  if (filters.direction === 'expense') query = query.lt('amount_cents', 0);

  if (filters.search?.trim()) {
    const pattern = orLiteral(`%${filters.search.trim()}%`);
    query = query.or(
      `description.ilike.${pattern},original_description.ilike.${pattern},notes.ilike.${pattern}`,
    );
  }

  // Amount bounds are on magnitude, so "between $20 and $50" catches both a
  // $30 expense and $30 of income.
  if (filters.minCents !== undefined) {
    const min = Math.abs(filters.minCents);
    query = query.or(`amount_cents.gte.${min},amount_cents.lte.${-min}`);
  }

  if (filters.maxCents !== undefined) {
    const max = Math.abs(filters.maxCents);
    query = query.gte('amount_cents', -max).lte('amount_cents', max);
  }

  if (filteringByTag) {
    // Filtering an embedded column alone only trims the embedded array; the
    // `not.is.null` is what promotes the join to an inner one so untagged
    // transactions drop out of the result.
    query = query
      .in('transaction_tags.tag_id', filters.tagIds!)
      .not('transaction_tags', 'is', null);
  }

  const from = page * pageSize;

  const rows = unwrap(
    await query
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1),
  );

  // The embed adds a `transaction_tags` key that isn't part of the row; drop it
  // so callers see the same shape whether or not a tag filter was applied.
  const transactions = (rows as Array<TransactionRow & { transaction_tags?: unknown }>).map(
    ({ transaction_tags: _embedded, ...transaction }) => transaction as TransactionRow,
  );

  return {
    transactions,
    nextPage: transactions.length < pageSize ? null : page + 1,
  };
}

export async function fetchTransaction(
  client: MinteaClient,
  id: string,
): Promise<TransactionRow> {
  return unwrap(
    await client
      .from('transactions')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
  );
}

export async function fetchTransferCandidates(
  client: MinteaClient,
  transactionId: string,
): Promise<TransferCandidateRow[]> {
  return unwrap(
    await client.rpc('transfer_candidates', {
      p_transaction_id: transactionId,
    }),
  );
}

export async function linkTransferPair(
  client: MinteaClient,
  input: { transactionId: string; counterpartId: string },
): Promise<void> {
  const { error } = await client.rpc('link_transfer_pair', {
    p_transaction_id: input.transactionId,
    p_counterpart_id: input.counterpartId,
  });

  if (error) throw new Error(error.message);
}

export async function unlinkTransferPair(
  client: MinteaClient,
  transactionId: string,
): Promise<void> {
  const { error } = await client.rpc('unlink_transfer_pair', {
    p_transaction_id: transactionId,
  });

  if (error) throw new Error(error.message);
}

/** Children of a split parent, in insertion order. */
export async function fetchSplits(
  client: MinteaClient,
  parentId: string,
): Promise<TransactionRow[]> {
  return unwrap(
    await client
      .from('transactions')
      .select('*')
      .eq('parent_id', parentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  );
}

export type TransactionPatch = Partial<
  Pick<
    TransactionRow,
    | 'date'
    | 'amount_cents'
    | 'description'
    | 'category_id'
    | 'merchant_id'
    | 'notes'
    | 'is_hidden'
    | 'needs_review'
  >
>;

export async function updateTransaction(
  client: MinteaClient,
  id: string,
  patch: TransactionPatch,
): Promise<TransactionRow> {
  const durablePatch = {
    ...patch,
    ...('date' in patch ? { date_overridden: true } : {}),
    ...('amount_cents' in patch ? { amount_overridden: true } : {}),
    ...('merchant_id' in patch ? { merchant_overridden: true } : {}),
  };

  return unwrap(
    await client
      .from('transactions')
      .update(durablePatch)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single(),
  );
}

export async function bulkUpdateTransactions(
  client: MinteaClient,
  ids: string[],
  patch: TransactionPatch,
): Promise<void> {
  if (ids.length === 0) return;

  const durablePatch = {
    ...patch,
    ...('date' in patch ? { date_overridden: true } : {}),
    ...('amount_cents' in patch ? { amount_overridden: true } : {}),
    ...('merchant_id' in patch ? { merchant_overridden: true } : {}),
  };

  const { error } = await client
    .from('transactions')
    .update(durablePatch)
    .in('id', ids);

  if (error) throw new Error(error.message);
}

export async function createManualTransaction(
  client: MinteaClient,
  input: {
    householdId: string;
    accountId: string;
    date: IsoDate;
    amountCents: Cents;
    description: string;
    categoryId?: string | null;
    merchantId?: string | null;
    notes?: string | null;
  },
): Promise<TransactionRow> {
  return unwrap(
    await client
      .from('transactions')
      .insert({
        household_id: input.householdId,
        account_id: input.accountId,
        date: input.date,
        amount_cents: input.amountCents,
        description: input.description,
        original_description: input.description,
        category_id: input.categoryId ?? null,
        merchant_id: input.merchantId ?? null,
        notes: input.notes ?? null,
        // A transaction the user typed in is reviewed by definition.
        needs_review: false,
      })
      .select()
      .single(),
  );
}

export async function deleteTransaction(
  client: MinteaClient,
  id: string,
): Promise<void> {
  const { error } = await client.rpc('soft_delete_transaction', {
    p_transaction_id: id,
  });
  if (error) throw new Error(error.message);
}

export type SplitPart = {
  amountCents: Cents;
  categoryId: string | null;
  description?: string;
};

/**
 * Replaces a transaction's splits. Children inherit the parent's account and
 * date; the parent keeps the full amount and stops being counted directly
 * (`has_splits` is maintained by a database trigger).
 *
 * Throws if the parts don't sum to the parent amount — a split that doesn't
 * reconcile would quietly corrupt every category total.
 */
export async function splitTransaction(
  client: MinteaClient,
  parent: TransactionRow,
  parts: SplitPart[],
): Promise<TransactionRow[]> {
  const total = parts.reduce((sum, part) => sum + part.amountCents, 0);

  if (total !== parent.amount_cents) {
    throw new Error(
      `Splits must add up to the transaction amount (got ${total}, expected ${parent.amount_cents})`,
    );
  }

  const { error: clearError } = await client
    .from('transactions')
    .delete()
    .eq('parent_id', parent.id);

  if (clearError) throw new Error(clearError.message);

  if (parts.length === 0) return [];

  return unwrap(
    await client
      .from('transactions')
      .insert(
        parts.map((part) => ({
          household_id: parent.household_id,
          account_id: parent.account_id,
          parent_id: parent.id,
          date: parent.date,
          amount_cents: part.amountCents,
          description: part.description ?? parent.description,
          original_description: parent.original_description,
          category_id: part.categoryId,
          merchant_id: parent.merchant_id,
          needs_review: false,
        })),
      )
      .select(),
  );
}

export async function removeSplits(
  client: MinteaClient,
  parentId: string,
): Promise<void> {
  const { error } = await client
    .from('transactions')
    .delete()
    .eq('parent_id', parentId);

  if (error) throw new Error(error.message);
}
