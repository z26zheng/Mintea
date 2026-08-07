import type { MinteaClient } from './client';
import { unwrap } from './client';
import { budgetMonth } from '../domain/budget';
import type { BudgetCategoryPlanRow } from '../types/database';

/** The amount spent in each category for one reporting month (positive cents). */
export type BudgetCategorySpend = { categoryId: string; spentCents: number };

export async function fetchBudgetPlans(
  client: MinteaClient,
  month: string,
): Promise<BudgetCategoryPlanRow[]> {
  return unwrap(
    await client
      .from('budget_category_plans')
      .select('*')
      .eq('month', budgetMonth(month)),
  );
}

export async function fetchBudgetSpending(
  client: MinteaClient,
  month: string,
): Promise<BudgetCategorySpend[]> {
  const start = budgetMonth(month);
  const year = Number(start.slice(0, 4));
  const monthNumber = Number(start.slice(5, 7));
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const rows = unwrap(
    await client
      .from('transactions')
      .select('category_id, amount_cents')
      .gte('date', start)
      .lt('date', end)
      .is('deleted_at', null)
      .eq('is_hidden', false)
      .eq('is_pending', false)
      .is('parent_id', null)
      .lt('amount_cents', 0)
      .not('category_id', 'is', null),
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.category_id) {
      totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + Math.abs(row.amount_cents));
    }
  }
  return [...totals].map(([categoryId, spentCents]) => ({ categoryId, spentCents }));
}

export async function saveBudgetPlan(
  client: MinteaClient,
  input: { householdId: string; categoryId: string; month: string; plannedCents: number },
): Promise<BudgetCategoryPlanRow> {
  if (!Number.isInteger(input.plannedCents) || input.plannedCents < 0) {
    throw new Error('Budgeted amount must be a non-negative whole number of cents.');
  }
  return unwrap(
    await client
      .from('budget_category_plans')
      .upsert(
        { household_id: input.householdId, category_id: input.categoryId, month: budgetMonth(input.month), planned_cents: input.plannedCents },
        { onConflict: 'household_id,category_id,month' },
      )
      .select()
      .single(),
  );
}

export async function deleteBudgetPlan(client: MinteaClient, id: string): Promise<void> {
  const { error } = await client.from('budget_category_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
