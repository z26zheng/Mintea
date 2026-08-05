/**
 * Budget arithmetic shared by the web and native clients.
 *
 * Spending is passed in as positive cents. A plan is intentionally smaller than
 * a transaction ledger: it describes the limit for a month, while reports own
 * the difficult decision of which transactions count as spending.
 */

export type BudgetProgress = {
  plannedCents: number;
  spentCents: number;
  remainingCents: number;
  /** Null when no limit was chosen; 0% is a real, fully-used budget. */
  spentShare: number | null;
  status: 'unplanned' | 'under' | 'at' | 'over';
};

export function budgetProgress(
  plannedCents: number | null | undefined,
  spentCents: number,
): BudgetProgress {
  const planned = plannedCents ?? 0;
  if (!Number.isInteger(planned) || planned < 0) {
    throw new Error('Budgeted amount must be a non-negative whole number of cents.');
  }
  if (!Number.isInteger(spentCents) || spentCents < 0) {
    throw new Error('Spent amount must be a non-negative whole number of cents.');
  }

  const remainingCents = planned - spentCents;
  if (plannedCents == null) {
    return { plannedCents: 0, spentCents, remainingCents: -spentCents, spentShare: null, status: 'unplanned' };
  }
  return {
    plannedCents: planned,
    spentCents,
    remainingCents,
    spentShare: planned === 0 ? (spentCents === 0 ? 0 : null) : spentCents / planned,
    status: spentCents > planned ? 'over' : spentCents === planned ? 'at' : 'under',
  };
}

/** Returns the first ISO day of a month and refuses ambiguous arbitrary dates. */
export function budgetMonth(value: string): string {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
    throw new Error('Budget month must be an ISO date.');
  }
  const [year, month, day] = value.split('-');
  if (day && day !== '01') throw new Error('Budget month must start on the first day.');
  const parsed = new Date(`${year}-${month}-01T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.getUTCMonth() + 1 !== Number(month)) {
    throw new Error('Budget month is not valid.');
  }
  return `${year}-${month}-01`;
}

export function budgetTotal(rows: Array<{ plannedCents: number | null; spentCents: number }>): BudgetProgress {
  return budgetProgress(
    rows.reduce((sum, row) => sum + (row.plannedCents ?? 0), 0),
    rows.reduce((sum, row) => sum + row.spentCents, 0),
  );
}
