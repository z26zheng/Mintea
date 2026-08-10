/**
 * Period reporting: what came in, what went out, and where it went.
 *
 * The hard part is not the arithmetic, it is deciding which rows count. Three
 * classes of transaction will silently inflate every number if included:
 *
 *  - transfers between the user's own accounts, which are not income or
 *    spending in either direction but look like both;
 *  - split parents, whose children carry the real categorisation, so counting
 *    both doubles the amount;
 *  - hidden transactions, which the user has already said to leave out.
 *
 * Free of relative runtime imports so it stays unit-testable under Node's type
 * stripping; the row types below are type-only and erase away.
 */
import type { CategoryRow, CategoryGroupRow } from '../types/database';
import type { TransactionView } from '../db/transactions';

export type PeriodSummary = {
  /** Money in, as a positive number. */
  incomeCents: number;
  /** Money out, as a positive number. */
  spendingCents: number;
  /** Income minus spending. Negative means the period ran a deficit. */
  netCents: number;
  /**
   * Share of income kept, 0–1. Null when there was no income, because
   * "0% saved" and "nothing came in" are different situations and a chart
   * that renders them the same is misleading.
   */
  savingsRate: number | null;
  /** How many transactions the totals are based on. */
  countedTransactions: number;
};

export type BreakdownRow = {
  id: string;
  label: string;
  /** Positive magnitude. */
  amountCents: number;
  /** Share of the parent total, 0–1. */
  share: number;
  transactionCount: number;
};

export type CategoryBreakdown = {
  totalCents: number;
  rows: BreakdownRow[];
};

/** A transaction is a transfer if its category says so, or Plaid matched it. */
export function isTransfer(
  transaction: {
    transfer_pair_id: TransactionView['transfer_pair_id'];
    category: Pick<CategoryRow, 'id'> | null;
  },
  groupTypeByCategoryId: Map<string, string>,
): boolean {
  if (transaction.transfer_pair_id) return true;
  const category = transaction.category;
  if (!category) return false;
  return groupTypeByCategoryId.get(category.id) === 'transfer';
}

/** The transaction fields needed to decide whether a budget row counts. */
export type BudgetTransactionFields = Pick<
  TransactionView,
  'category_id' | 'parent_id' | 'has_splits' | 'transfer_pair_id'
>;

/**
 * Budget spending follows the same transfer rule as reports. Split parents are
 * also excluded here because their children carry the categorisation.
 */
export function isBudgetSpendingTransaction(
  transaction: BudgetTransactionFields,
  groupTypeByCategoryId: Map<string, string>,
): boolean {
  if (!transaction.category_id) return false;
  if (transaction.parent_id === null && transaction.has_splits) return false;
  return !isTransfer(
    {
      transfer_pair_id: transaction.transfer_pair_id,
      category: { id: transaction.category_id },
    },
    groupTypeByCategoryId,
  );
}

/**
 * Rows that should feed a report.
 *
 * A split parent is dropped only when its children are actually present; if a
 * page of results contains the parent but not its children, dropping it would
 * lose the amount entirely, which is worse than attributing it to the parent's
 * own category.
 */
export function reportableTransactions(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
): TransactionView[] {
  const parentsWithLoadedChildren = new Set(
    transactions.flatMap((t) => (t.parent_id ? [t.parent_id] : [])),
  );

  return transactions.filter((transaction) => {
    if (transaction.is_hidden) return false;
    if (parentsWithLoadedChildren.has(transaction.id)) return false;
    if (isTransfer(transaction, groupTypeByCategoryId)) return false;
    return true;
  });
}

export function buildGroupTypeByCategoryId(
  categories: Array<Pick<CategoryRow, 'id' | 'group_id'>>,
  groups: Array<Pick<CategoryGroupRow, 'id' | 'type'>>,
): Map<string, string> {
  const typeByGroup = new Map(groups.map((group) => [group.id, group.type]));
  return new Map(
    categories.map((category) => [
      category.id,
      (category.group_id && typeByGroup.get(category.group_id)) || 'expense',
    ]),
  );
}

export function summarizePeriod(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
): PeriodSummary {
  const counted = reportableTransactions(transactions, groupTypeByCategoryId);

  let incomeCents = 0;
  let spendingCents = 0;

  for (const transaction of counted) {
    // Sign is the source of truth, not the category: a refund posted against a
    // spending category is money coming back, and netting it out is what makes
    // a category total match a statement.
    if (transaction.amount_cents > 0) incomeCents += transaction.amount_cents;
    else spendingCents += -transaction.amount_cents;
  }

  const netCents = incomeCents - spendingCents;

  return {
    incomeCents,
    spendingCents,
    netCents,
    savingsRate: incomeCents > 0 ? netCents / incomeCents : null,
    countedTransactions: counted.length,
  };
}

/**
 * Spending by category, largest first.
 *
 * Categories that net out to zero or to a credit (a refund larger than the
 * spending) are dropped rather than shown as negative spending, which would
 * make the shares meaningless.
 */
export function breakdownByCategory(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
): CategoryBreakdown {
  const counted = reportableTransactions(transactions, groupTypeByCategoryId).filter(
    (transaction) => transaction.amount_cents < 0,
  );

  const totals = new Map<string, { label: string; cents: number; count: number }>();

  for (const transaction of counted) {
    const id = transaction.category?.id ?? 'uncategorized';
    const label = transaction.category?.name ?? 'Uncategorized';
    const existing = totals.get(id) ?? { label, cents: 0, count: 0 };
    existing.cents += -transaction.amount_cents;
    existing.count += 1;
    totals.set(id, existing);
  }

  return finishBreakdown(totals);
}

/** Spending by category group, for a shorter list than per-category. */
export function breakdownByGroup(
  transactions: TransactionView[],
  categories: CategoryRow[],
  groups: CategoryGroupRow[],
): CategoryBreakdown {
  const groupTypeByCategoryId = buildGroupTypeByCategoryId(categories, groups);
  const groupIdByCategoryId = new Map(
    categories.map((category) => [category.id, category.group_id]),
  );
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

  const counted = reportableTransactions(transactions, groupTypeByCategoryId).filter(
    (transaction) => transaction.amount_cents < 0,
  );

  const totals = new Map<string, { label: string; cents: number; count: number }>();

  for (const transaction of counted) {
    const groupId = transaction.category
      ? groupIdByCategoryId.get(transaction.category.id) ?? null
      : null;
    const id = groupId ?? 'uncategorized';
    const label = (groupId && groupNameById.get(groupId)) || 'Uncategorized';
    const existing = totals.get(id) ?? { label, cents: 0, count: 0 };
    existing.cents += -transaction.amount_cents;
    existing.count += 1;
    totals.set(id, existing);
  }

  return finishBreakdown(totals);
}

/** Spending by canonical merchant, largest first. */
export function breakdownByMerchant(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
): CategoryBreakdown {
  return breakdownByDimension(
    transactions,
    groupTypeByCategoryId,
    (transaction) =>
      transaction.merchant
        ? { id: transaction.merchant.id, label: transaction.merchant.name }
        : { id: 'uncategorized', label: 'Uncategorized' },
  );
}

/** Spending by account, largest first. */
export function breakdownByAccount(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
): CategoryBreakdown {
  return breakdownByDimension(
    transactions,
    groupTypeByCategoryId,
    (transaction) =>
      transaction.account
        ? { id: transaction.account.id, label: transaction.account.name }
        : { id: 'uncategorized', label: 'Unknown account' },
  );
}

function breakdownByDimension(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
  getDimension: (
    transaction: TransactionView,
  ) => { id: string; label: string },
): CategoryBreakdown {
  const counted = reportableTransactions(
    transactions,
    groupTypeByCategoryId,
  ).filter((transaction) => transaction.amount_cents < 0);

  const totals = new Map<string, { label: string; cents: number; count: number }>();

  for (const transaction of counted) {
    const dimension = getDimension(transaction);
    const existing = totals.get(dimension.id) ?? {
      label: dimension.label,
      cents: 0,
      count: 0,
    };
    existing.cents += -transaction.amount_cents;
    existing.count += 1;
    totals.set(dimension.id, existing);
  }

  return finishBreakdown(totals);
}

export type MonthlyTrendPoint = {
  /** Calendar month in `YYYY-MM` form. */
  month: string;
  incomeCents: number;
  spendingCents: number;
  netCents: number;
  savingsRate: number | null;
  countedTransactions: number;
};

/**
 * Summarize reportable activity by calendar month.
 *
 * `monthKeys` lets callers include quiet months as zeroes, which keeps a trend
 * chart honest instead of compressing a six-month gap into a single line.
 */
export function monthlyTrend(
  transactions: TransactionView[],
  groupTypeByCategoryId: Map<string, string>,
  monthKeys?: string[],
): MonthlyTrendPoint[] {
  const totals = new Map<
    string,
    { incomeCents: number; spendingCents: number; countedTransactions: number }
  >();

  for (const transaction of reportableTransactions(
    transactions,
    groupTypeByCategoryId,
  )) {
    const month = transaction.date.slice(0, 7);
    const existing = totals.get(month) ?? {
      incomeCents: 0,
      spendingCents: 0,
      countedTransactions: 0,
    };

    if (transaction.amount_cents > 0) {
      existing.incomeCents += transaction.amount_cents;
    } else {
      existing.spendingCents += -transaction.amount_cents;
    }
    existing.countedTransactions += 1;
    totals.set(month, existing);
  }

  const months = monthKeys
    ? [...new Set(monthKeys)]
    : [...totals.keys()].sort();

  return months.map((month) => {
    const total = totals.get(month) ?? {
      incomeCents: 0,
      spendingCents: 0,
      countedTransactions: 0,
    };
    const netCents = total.incomeCents - total.spendingCents;

    return {
      month,
      ...total,
      netCents,
      savingsRate:
        total.incomeCents > 0 ? netCents / total.incomeCents : null,
    };
  });
}

function finishBreakdown(
  totals: Map<string, { label: string; cents: number; count: number }>,
): CategoryBreakdown {
  const rows = [...totals.entries()]
    .filter(([, value]) => value.cents > 0)
    .map(([id, value]) => ({
      id,
      label: value.label,
      amountCents: value.cents,
      transactionCount: value.count,
      share: 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    totalCents,
    rows: rows.map((row) => ({
      ...row,
      share: totalCents > 0 ? row.amountCents / totalCents : 0,
    })),
  };
}

export type PeriodChange = {
  /** Difference in cents; positive means the current period is larger. */
  deltaCents: number;
  /**
   * Proportional change, or null when the previous period was zero — there is
   * no meaningful percentage increase from nothing.
   */
  deltaRatio: number | null;
};

export function comparePeriods(
  currentCents: number,
  previousCents: number,
): PeriodChange {
  return {
    deltaCents: currentCents - previousCents,
    deltaRatio:
      previousCents === 0 ? null : (currentCents - previousCents) / Math.abs(previousCents),
  };
}
