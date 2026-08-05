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
      .select('category_id, amount_cents, parent_id, has_splits')
      .gte('date', start)
      .lt('date', end)
      .is('deleted_at', null)
      .eq('is_hidden', false)
      .eq('is_pending', false)
      .lt('amount_cents', 0)
      .not('category_id', 'is', null),
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    // Split parents retain the original transaction amount but their children
    // hold the categorisation. Count ordinary root rows and split children,
    // never the parent, so a split cannot double-count the budget.
    if (row.category_id && !(row.parent_id === null && row.has_splits)) {
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
        { onConflict: 'category_id,month' },
      )
      .select()
      .single(),
  );
}

export async function deleteBudgetPlan(client: MinteaClient, id: string): Promise<void> {
  const { error } = await client.from('budget_category_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Copies only missing category plans, preserving any choices already made. */
export async function copyBudgetPlans(
  client: MinteaClient,
  input: { householdId: string; fromMonth: string; toMonth: string },
): Promise<BudgetCategoryPlanRow[]> {
  const [source, destination] = await Promise.all([
    fetchBudgetPlans(client, input.fromMonth),
    fetchBudgetPlans(client, input.toMonth),
  ]);
  const present = new Set(destination.map((plan) => plan.category_id));
  const inserts = source.filter((plan) => !present.has(plan.category_id)).map((plan) => ({
    household_id: input.householdId,
    category_id: plan.category_id,
    month: budgetMonth(input.toMonth),
    planned_cents: plan.planned_cents,
  }));
  if (inserts.length === 0) return [];
  return unwrap(
    await client
      .from('budget_category_plans')
      .upsert(inserts, {
        onConflict: 'category_id,month',
        ignoreDuplicates: true,
      })
      .select(),
  );
}
