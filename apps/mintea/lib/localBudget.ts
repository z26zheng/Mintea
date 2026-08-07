import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BudgetCategoryPlanRow } from '@mintea/core';

const STORAGE_PREFIX = '@mintea/local-budget-plans/v1/';

const storageKey = (householdId: string) => `${STORAGE_PREFIX}${householdId}`;

async function readPlans(householdId: string): Promise<BudgetCategoryPlanRow[]> {
  const raw = await AsyncStorage.getItem(storageKey(householdId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as BudgetCategoryPlanRow[] : [];
  } catch {
    return [];
  }
}

async function writePlans(householdId: string, plans: BudgetCategoryPlanRow[]) {
  await AsyncStorage.setItem(storageKey(householdId), JSON.stringify(plans));
}

export async function fetchLocalBudgetPlans(householdId: string, month: string) {
  return (await readPlans(householdId)).filter((plan) => plan.month === month);
}

export async function saveLocalBudgetPlan(input: {
  householdId: string;
  categoryId: string;
  month: string;
  plannedCents: number;
}): Promise<BudgetCategoryPlanRow> {
  if (!Number.isInteger(input.plannedCents) || input.plannedCents < 0) {
    throw new Error('Budgeted amount must be a non-negative whole number of cents.');
  }
  const plans = await readPlans(input.householdId);
  const index = plans.findIndex((plan) => plan.category_id === input.categoryId && plan.month === input.month);
  const now = new Date().toISOString();
  const plan: BudgetCategoryPlanRow = index >= 0
    ? { ...plans[index], planned_cents: input.plannedCents, updated_at: now }
    : {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      household_id: input.householdId,
      category_id: input.categoryId,
      month: input.month,
      planned_cents: input.plannedCents,
      created_at: now,
      updated_at: now,
    };
  if (index >= 0) plans[index] = plan;
  else plans.push(plan);
  await writePlans(input.householdId, plans);
  return plan;
}

export async function deleteLocalBudgetPlan(householdId: string, id: string) {
  await writePlans(householdId, (await readPlans(householdId)).filter((plan) => plan.id !== id));
}

/** Copies only missing plans, preserving edits already made for the destination month. */
export async function copyLocalBudgetPlans(input: {
  householdId: string;
  fromMonth: string;
  toMonth: string;
}) {
  const plans = await readPlans(input.householdId);
  const destinationCategories = new Set(
    plans.filter((plan) => plan.month === input.toMonth).map((plan) => plan.category_id),
  );
  const now = new Date().toISOString();
  const copied = plans
    .filter((plan) => plan.month === input.fromMonth && !destinationCategories.has(plan.category_id))
    .map((plan) => ({
      ...plan,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      month: input.toMonth,
      created_at: now,
      updated_at: now,
    }));
  if (copied.length > 0) await writePlans(input.householdId, [...plans, ...copied]);
  return copied;
}
