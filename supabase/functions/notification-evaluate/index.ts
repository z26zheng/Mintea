import { handler, json } from '../_shared/http.ts';
import { assessConnection } from '../_shared/connectionHealth.ts';
import { requireCaller } from '../_shared/supabase.ts';
import {
  resolveMissingConditions,
  upsertConditionNotification,
} from '../_shared/notificationStore.ts';

type MemberRow = { user_id: string };
type PlaidItemRow = {
  owner_user_id: string;
  institution_name: string | null;
  status: 'good' | 'login_required' | 'pending_expiration' | 'error' | 'revoked';
  error_code: string | null;
  error_message: string | null;
  last_synced_at: string | null;
  consent_expires_at: string | null;
};
type CategoryRow = {
  id: string;
  name: string;
  group_id: string;
  exclude_from_budget: boolean;
};
type CategoryGroupRow = { id: string; type: 'income' | 'expense' | 'transfer' };
type PlanRow = { category_id: string; planned_cents: number };
type TransactionRow = {
  category_id: string | null;
  amount_cents: number;
  parent_id: string | null;
  has_splits: boolean;
  transfer_pair_id: string | null;
  is_hidden: boolean;
  is_pending: boolean;
  deleted_at: string | null;
};

function money(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function monthInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}-01`;
}

async function householdMonth(
  admin: any,
  householdId: string,
  now: Date,
): Promise<string> {
  const { data } = await admin
    .from('households')
    .select('timezone')
    .eq('id', householdId)
    .maybeSingle();
  return monthInTimeZone(now, (data?.timezone as string | undefined) ?? 'UTC');
}

async function fetchTransactions(
  admin: any,
  householdId: string,
  month: string,
): Promise<TransactionRow[]> {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const rows: TransactionRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from('transactions')
      .select(
        'category_id, amount_cents, parent_id, has_splits, transfer_pair_id, is_hidden, is_pending, deleted_at',
      )
      .eq('household_id', householdId)
      .gte('date', month)
      .lt('date', end)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as TransactionRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

function countsAsLedgerActivity(
  row: TransactionRow,
  groupTypeByCategoryId: Map<string, CategoryGroupRow['type']>,
): boolean {
  if (row.is_hidden || row.is_pending || row.deleted_at) return false;
  if (row.parent_id === null && row.has_splits) return false;
  if (row.transfer_pair_id) return false;
  return row.category_id
    ? groupTypeByCategoryId.get(row.category_id) !== 'transfer'
    : true;
}

async function evaluateConnections(
  admin: any,
  householdId: string,
  items: PlaidItemRow[],
  now: Date,
): Promise<{ created: number; activeKeys: Set<string> }> {
  const byOwner = new Map<string, PlaidItemRow[]>();
  for (const item of items) {
    const current = byOwner.get(item.owner_user_id) ?? [];
    current.push(item);
    byOwner.set(item.owner_user_id, current);
  }

  const activeKeys = new Set<string>();
  let created = 0;

  for (const [ownerUserId, ownerItems] of byOwner) {
    const unhealthy = ownerItems.map((item) => ({
      item,
      health: assessConnection(item, now),
    }));
    const reconnect = unhealthy.filter(({ health }) => health.action === 'reconnect');
    const stale = unhealthy.filter(({ health }) => health.label === 'Out of date');

    if (reconnect.length > 0) {
      const first = reconnect[0]!;
      const title =
        reconnect.length === 1
          ? `${first.item.institution_name ?? 'A connection'} needs attention`
          : `${reconnect.length} connections need attention`;
      const message =
        reconnect.length === 1
          ? first.health.detail
          : 'Reconnect the affected banks to keep balances and activity current.';
      await upsertConditionNotification(admin, {
        householdId,
        recipientUserId: ownerUserId,
        notificationKey: 'condition:connection-reconnect',
        notificationClass: 'condition',
        notificationKind: 'connection-health',
        severity: reconnect.some(({ health }) => health.severity === 'critical')
          ? 'critical'
          : 'warning',
        icon: 'alert-circle-outline',
        title,
        message,
        actionLabel: 'Review connections',
        href: '/(tabs)/settings',
        payload: { connection_count: reconnect.length },
        occurredAt: now.toISOString(),
      });
      activeKeys.add(`${ownerUserId}::condition:connection-reconnect`);
      created += 1;
    }

    if (stale.length > 0) {
      const first = stale[0]!;
      const title =
        stale.length === 1
          ? `${first.item.institution_name ?? 'A connection'} is out of date`
          : `${stale.length} connections are out of date`;
      const message =
        stale.length === 1
          ? first.health.detail
          : 'These connections have not sent new data in five days. Balances and totals may be behind.';
      await upsertConditionNotification(admin, {
        householdId,
        recipientUserId: ownerUserId,
        notificationKey: 'condition:connection-stale',
        notificationClass: 'condition',
        notificationKind: 'connection-health',
        severity: 'warning',
        icon: 'time-outline',
        title,
        message,
        actionLabel: 'Review connections',
        href: '/(tabs)/settings',
        payload: { connection_count: stale.length },
        occurredAt: now.toISOString(),
      });
      activeKeys.add(`${ownerUserId}::condition:connection-stale`);
      created += 1;
    }
  }

  return { created, activeKeys };
}

async function evaluateBudget(
  admin: any,
  householdId: string,
  members: MemberRow[],
  month: string,
  now: Date,
): Promise<{ created: number; activeKeys: Set<string> }> {
  const [{ data: categories, error: categoryError }, { data: groups, error: groupError }, { data: plans, error: planError }] =
    await Promise.all([
      admin
        .from('categories')
        .select('id, name, group_id, exclude_from_budget')
        .eq('household_id', householdId),
      admin.from('category_groups').select('id, type').eq('household_id', householdId),
      admin
        .from('budget_category_plans')
        .select('category_id, planned_cents')
        .eq('household_id', householdId)
        .eq('month', month),
    ]);
  if (categoryError || groupError || planError) {
    throw new Error(
      categoryError?.message ?? groupError?.message ?? planError?.message ?? 'Could not load budget state',
    );
  }

  const categoryRows = (categories ?? []) as CategoryRow[];
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const groupTypeByCategoryId = new Map(
    categoryRows.map((category) => [
      category.id,
      ((groups ?? []) as CategoryGroupRow[]).find((group) => group.id === category.group_id)?.type ?? 'expense',
    ]),
  );
  const transactionRows = await fetchTransactions(admin, householdId, month);
  const spendingByCategory = new Map<string, number>();
  let incomeCents = 0;

  for (const row of transactionRows) {
    if (!countsAsLedgerActivity(row, groupTypeByCategoryId)) continue;
    if (row.amount_cents > 0) incomeCents += row.amount_cents;
    if (row.amount_cents < 0 && row.category_id) {
      spendingByCategory.set(
        row.category_id,
        (spendingByCategory.get(row.category_id) ?? 0) + Math.abs(row.amount_cents),
      );
    }
  }

  const planRows = (plans ?? []) as PlanRow[];
  const overBudget = planRows.filter((plan) => {
    const category = categoryById.get(plan.category_id);
    const groupType = groupTypeByCategoryId.get(plan.category_id);
    return Boolean(
      category &&
        !category.exclude_from_budget &&
        groupType === 'expense' &&
        (spendingByCategory.get(plan.category_id) ?? 0) > plan.planned_cents,
    );
  });
  const plannedExpenseCents = planRows.reduce((sum, plan) => {
    const category = categoryById.get(plan.category_id);
    return category && !category.exclude_from_budget && groupTypeByCategoryId.get(plan.category_id) === 'expense'
      ? sum + plan.planned_cents
      : sum;
  }, 0);
  const unallocatedCents = incomeCents - plannedExpenseCents;

  const activeKeys = new Set<string>();
  let created = 0;

  for (const member of members) {
    for (const plan of overBudget) {
      const category = categoryById.get(plan.category_id)!;
      const spentCents = spendingByCategory.get(plan.category_id) ?? 0;
      const key = `condition:budget-over:${month}:${plan.category_id}`;
      await upsertConditionNotification(admin, {
        householdId,
        recipientUserId: member.user_id,
        notificationKey: key,
        notificationClass: 'condition',
        notificationKind: 'budget',
        severity: 'warning',
        icon: 'trending-up-outline',
        title: `${category.name} is over budget`,
        message: `${money(spentCents - plan.planned_cents)} over your ${month.slice(0, 7)} plan.`,
        actionLabel: 'Review budget',
        href: '/(tabs)/budget',
        payload: {
          category_id: category.id,
          month,
          planned_cents: plan.planned_cents,
          spent_cents: spentCents,
        },
        occurredAt: now.toISOString(),
      });
      activeKeys.add(`${member.user_id}::${key}`);
      created += 1;
    }

    if (unallocatedCents > 0) {
      const key = `condition:budget-unallocated-income:${month}`;
      await upsertConditionNotification(admin, {
        householdId,
        recipientUserId: member.user_id,
        notificationKey: key,
        notificationClass: 'condition',
        notificationKind: 'budget',
        severity: 'info',
        icon: 'wallet-outline',
        title: 'Income is unallocated',
        message: `${money(unallocatedCents)} is not assigned to a budget this month.`,
        actionLabel: 'Plan your income',
        href: '/(tabs)/budget',
        payload: { month, income_cents: incomeCents, planned_expense_cents: plannedExpenseCents },
        occurredAt: now.toISOString(),
      });
      activeKeys.add(`${member.user_id}::${key}`);
      created += 1;
    }
  }

  return { created, activeKeys };
}

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const now = new Date();

    const [{ data: members, error: membersError }, { data: items, error: itemsError }] =
      await Promise.all([
        caller.admin
          .from('household_members')
          .select('user_id')
          .eq('household_id', caller.householdId),
        caller.admin
          .from('plaid_items')
          .select(
            'owner_user_id, institution_name, status, error_code, error_message, last_synced_at, consent_expires_at',
          )
          .eq('household_id', caller.householdId),
      ]);
    if (membersError || itemsError) {
      throw new Error(membersError?.message ?? itemsError?.message ?? 'Could not load household notification inputs');
    }

    const connectionResult = await evaluateConnections(
      caller.admin,
      caller.householdId,
      (items ?? []) as PlaidItemRow[],
      now,
    );
    const month = await householdMonth(caller.admin, caller.householdId, now);
    const budgetResult = await evaluateBudget(
      caller.admin,
      caller.householdId,
      (members ?? []) as MemberRow[],
      month,
      now,
    );

    const activeKeys = new Set([
      ...connectionResult.activeKeys,
      ...budgetResult.activeKeys,
    ]);
    const resolved = await resolveMissingConditions(
      caller.admin,
      caller.householdId,
      [
        'condition:connection-reconnect',
        'condition:connection-stale',
        `condition:budget-over:${month}:`,
        `condition:budget-unallocated-income:${month}`,
      ],
      activeKeys,
    );

    return json({
      evaluated: true,
      month,
      notificationsUpserted: connectionResult.created + budgetResult.created,
      conditionsResolved: resolved,
    });
  }),
);
