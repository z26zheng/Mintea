import assert from 'node:assert/strict';
import test from 'node:test';

import {
  breakdownByCategory,
  breakdownByGroup,
  buildGroupTypeByCategoryId,
  comparePeriods,
  isBudgetSpendingTransaction,
  reportableTransactions,
  summarizePeriod,
} from '../packages/core/src/domain/reports.ts';

const GROUPS = [
  { id: 'g-expense', name: 'Food & Dining', type: 'expense' },
  { id: 'g-income', name: 'Income', type: 'income' },
  { id: 'g-transfer', name: 'Transfers', type: 'transfer' },
];

const CATEGORIES = [
  { id: 'c-groceries', name: 'Groceries', group_id: 'g-expense' },
  { id: 'c-restaurants', name: 'Restaurants', group_id: 'g-expense' },
  { id: 'c-salary', name: 'Salary', group_id: 'g-income' },
  { id: 'c-transfer', name: 'Account transfer', group_id: 'g-transfer' },
];

const TYPES = buildGroupTypeByCategoryId(CATEGORIES, GROUPS);

let seq = 0;
const tx = (overrides = {}) => ({
  id: `t${(seq += 1)}`,
  amount_cents: -1000,
  is_hidden: false,
  parent_id: null,
  transfer_pair_id: null,
  category: CATEGORIES[0],
  ...overrides,
});

test('income and spending are separated by sign', () => {
  const summary = summarizePeriod(
    [
      tx({ amount_cents: 500_000, category: CATEGORIES[2] }),
      tx({ amount_cents: -120_00 }),
      tx({ amount_cents: -80_00 }),
    ],
    TYPES,
  );

  assert.equal(summary.incomeCents, 500_000);
  assert.equal(summary.spendingCents, 20_000);
  assert.equal(summary.netCents, 480_000);
  assert.equal(summary.countedTransactions, 3);
});

test('transfers between your own accounts are not income or spending', () => {
  // The classic inflation bug: moving $5,000 to savings looks like $5,000 of
  // income on one side and $5,000 of spending on the other.
  const summary = summarizePeriod(
    [
      tx({ amount_cents: 500_000, category: CATEGORIES[3] }),
      tx({ amount_cents: -500_000, category: CATEGORIES[3] }),
      tx({ amount_cents: -2_500 }),
    ],
    TYPES,
  );

  assert.equal(summary.incomeCents, 0);
  assert.equal(summary.spendingCents, 2_500);
  assert.equal(summary.countedTransactions, 1);
});

test('a Plaid-matched transfer pair is excluded even without a transfer category', () => {
  const summary = summarizePeriod(
    [
      tx({ amount_cents: 100_000, category: CATEGORIES[0], transfer_pair_id: 'x' }),
      tx({ amount_cents: -3_000 }),
    ],
    TYPES,
  );

  assert.equal(summary.incomeCents, 0);
  assert.equal(summary.spendingCents, 3_000);
});

test('budget spending excludes both transfer signals', () => {
  const ordinary = {
    category_id: CATEGORIES[0].id,
    parent_id: null,
    has_splits: false,
    transfer_pair_id: null,
  };

  assert.equal(
    isBudgetSpendingTransaction(
      { ...ordinary, transfer_pair_id: 'matched-transfer' },
      TYPES,
    ),
    false,
  );
  assert.equal(
    isBudgetSpendingTransaction(
      { ...ordinary, category_id: CATEGORIES[3].id },
      TYPES,
    ),
    false,
  );
  assert.equal(isBudgetSpendingTransaction(ordinary, TYPES), true);
});

test('hidden transactions are left out', () => {
  const summary = summarizePeriod(
    [tx({ amount_cents: -9_999, is_hidden: true }), tx({ amount_cents: -1_000 })],
    TYPES,
  );

  assert.equal(summary.spendingCents, 1_000);
});

test('a split parent is dropped when its children are present', () => {
  // Counting both would double the amount.
  const parent = tx({ id: 'parent', amount_cents: -10_000 });
  const summary = summarizePeriod(
    [
      parent,
      tx({ amount_cents: -6_000, parent_id: 'parent' }),
      tx({ amount_cents: -4_000, parent_id: 'parent' }),
    ],
    TYPES,
  );

  assert.equal(summary.spendingCents, 10_000);
  assert.equal(summary.countedTransactions, 2);
});

test('a split parent is kept when its children are not loaded', () => {
  // Dropping it here would lose the amount entirely, which is worse than
  // attributing it to the parent's own category.
  const summary = summarizePeriod(
    [tx({ id: 'parent', amount_cents: -10_000, has_splits: true })],
    TYPES,
  );

  assert.equal(summary.spendingCents, 10_000);
});

test('a refund nets against spending rather than counting as income', () => {
  const summary = summarizePeriod(
    [tx({ amount_cents: -10_000 }), tx({ amount_cents: 2_500 })],
    TYPES,
  );

  // The refund is a positive amount, so it lands in income; net is what the
  // user actually spent.
  assert.equal(summary.netCents, -7_500);
});

test('savings rate is null when nothing came in, not zero', () => {
  // "0% saved" and "no income at all" are different situations.
  const summary = summarizePeriod([tx({ amount_cents: -5_000 })], TYPES);
  assert.equal(summary.savingsRate, null);
});

test('savings rate is the share of income kept', () => {
  const summary = summarizePeriod(
    [
      tx({ amount_cents: 100_000, category: CATEGORIES[2] }),
      tx({ amount_cents: -25_000 }),
    ],
    TYPES,
  );

  assert.equal(summary.savingsRate, 0.75);
});

test('a deficit produces a negative savings rate rather than clamping', () => {
  const summary = summarizePeriod(
    [
      tx({ amount_cents: 10_000, category: CATEGORIES[2] }),
      tx({ amount_cents: -15_000 }),
    ],
    TYPES,
  );

  assert.equal(summary.netCents, -5_000);
  assert.equal(summary.savingsRate, -0.5);
});

test('an empty period is all zeroes, not an error', () => {
  const summary = summarizePeriod([], TYPES);
  assert.deepEqual(summary, {
    incomeCents: 0,
    spendingCents: 0,
    netCents: 0,
    savingsRate: null,
    countedTransactions: 0,
  });
});

test('reportable rows exclude transfers, hidden rows and covered parents', () => {
  const kept = reportableTransactions(
    [
      tx({ id: 'keep', amount_cents: -100 }),
      tx({ is_hidden: true }),
      tx({ category: CATEGORIES[3] }),
      tx({ id: 'parent' }),
      tx({ parent_id: 'parent' }),
    ],
    TYPES,
  );

  assert.deepEqual(
    kept.map((t) => t.id).sort(),
    ['keep', kept.find((t) => t.parent_id === 'parent').id].sort(),
  );
});

test('category breakdown sorts by size and shares sum to one', () => {
  const breakdown = breakdownByCategory(
    [
      tx({ amount_cents: -7_500, category: CATEGORIES[0] }),
      tx({ amount_cents: -2_500, category: CATEGORIES[1] }),
    ],
    TYPES,
  );

  assert.equal(breakdown.totalCents, 10_000);
  assert.deepEqual(breakdown.rows.map((r) => r.label), ['Groceries', 'Restaurants']);
  assert.equal(breakdown.rows[0].share, 0.75);
  assert.equal(
    breakdown.rows.reduce((sum, r) => sum + r.share, 0),
    1,
  );
});

test('breakdown buckets uncategorized spending rather than dropping it', () => {
  const breakdown = breakdownByCategory(
    [tx({ amount_cents: -4_000, category: null })],
    TYPES,
  );

  assert.equal(breakdown.rows.length, 1);
  assert.equal(breakdown.rows[0].label, 'Uncategorized');
});

test('a category refunded to a net credit is dropped, not shown as negative', () => {
  const breakdown = breakdownByCategory(
    [
      tx({ amount_cents: -1_000, category: CATEGORIES[0] }),
      tx({ amount_cents: -5_000, category: CATEGORIES[1] }),
    ],
    TYPES,
  );

  // Only negative amounts feed the breakdown, so a category with none is absent.
  assert.equal(breakdown.rows.find((r) => r.label === 'Salary'), undefined);
  assert.equal(breakdown.rows.length, 2);
});

test('group breakdown rolls categories up to their group', () => {
  const breakdown = breakdownByGroup(
    [
      tx({ amount_cents: -7_500, category: CATEGORIES[0] }),
      tx({ amount_cents: -2_500, category: CATEGORIES[1] }),
    ],
    CATEGORIES,
    GROUPS,
  );

  assert.equal(breakdown.rows.length, 1);
  assert.equal(breakdown.rows[0].label, 'Food & Dining');
  assert.equal(breakdown.rows[0].amountCents, 10_000);
  assert.equal(breakdown.rows[0].transactionCount, 2);
});

test('period comparison reports both the amount and the proportion', () => {
  assert.deepEqual(comparePeriods(150_00, 100_00), {
    deltaCents: 50_00,
    deltaRatio: 0.5,
  });
});

test('comparison against an empty previous period has no percentage', () => {
  // There is no meaningful percentage increase from nothing.
  assert.deepEqual(comparePeriods(100_00, 0), {
    deltaCents: 100_00,
    deltaRatio: null,
  });
});

test('comparison handles a fall as well as a rise', () => {
  const change = comparePeriods(50_00, 200_00);
  assert.equal(change.deltaCents, -150_00);
  assert.equal(change.deltaRatio, -0.75);
});
