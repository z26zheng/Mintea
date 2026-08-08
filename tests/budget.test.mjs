import assert from 'node:assert/strict';
import test from 'node:test';

import { budgetMonth, budgetProgress, budgetTotal } from '../packages/core/src/domain/budget.ts';

test('a budget exposes planned, spent, remaining, and a truthful status', () => {
  assert.deepEqual(budgetProgress(50_000, 42_500), {
    plannedCents: 50_000,
    spentCents: 42_500,
    remainingCents: 7_500,
    spentShare: 0.85,
    status: 'under',
  });
  assert.equal(budgetProgress(50_000, 50_001).status, 'over');
});

test('unplanned spending is not disguised as a zero-percent budget', () => {
  const progress = budgetProgress(null, 1_200);
  assert.equal(progress.status, 'unplanned');
  assert.equal(progress.spentShare, null);
  assert.equal(progress.remainingCents, -1_200);
});

test('spending against a zero-dollar limit is visibly over budget', () => {
  const progress = budgetProgress(0, 1_200);
  assert.equal(progress.status, 'over');
  assert.equal(progress.spentShare, Infinity);
});

test('budget months are canonical first-of-month dates', () => {
  assert.equal(budgetMonth('2026-08'), '2026-08-01');
  assert.equal(budgetMonth('2026-08-01'), '2026-08-01');
  assert.throws(() => budgetMonth('2026-08-02'), /first day/);
});

test('totals retain cents and aggregate planned amounts', () => {
  assert.deepEqual(budgetTotal([
    { plannedCents: 10_000, spentCents: 2_500 },
    { plannedCents: null, spentCents: 750 },
  ]), budgetProgress(10_000, 3_250));
});

test('a total with no category plans remains unplanned', () => {
  assert.deepEqual(budgetTotal([
    { plannedCents: null, spentCents: 2_500 },
    { plannedCents: null, spentCents: 750 },
  ]), budgetProgress(null, 3_250));
});
