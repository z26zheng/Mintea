import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  budgetProgress,
  budgetSpendingQuery,
  budgetTotal,
  categoriesQuery,
  profileQuery,
  queryKeys,
  toIsoDateInTimeZone,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { copyLocalBudgetPlans, deleteLocalBudgetPlan, fetchLocalBudgetPlans, saveLocalBudgetPlan } from '../../lib/localBudget';
import { RequireAuth } from '../../components/RequireAuth';
import { Button, Card, EmptyState, ErrorNotice, Money, PageHeader, Screen, Skeleton } from '../../components/ui';

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}T00:00:00Z`),
  );

const shiftMonth = (month: string, direction: number) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + direction, 1)).toISOString().slice(0, 10);
};

const currentMonth = (timeZone = 'UTC') => toIsoDateInTimeZone(new Date(), timeZone).slice(0, 7) + '-01';

function Budget() {
  const client = useClient();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [month, setMonth] = useState(currentMonth);
  const initializedMonth = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const profile = useQuery(profileQuery(client));
  const categories = useQuery(categoriesQuery(client));
  const plans = useQuery({
    queryKey: queryKeys.budgetPlans(month),
    queryFn: () => profile.data ? fetchLocalBudgetPlans(profile.data.household_id, month) : Promise.resolve([]),
    enabled: !!profile.data,
  });
  const spending = useQuery(budgetSpendingQuery(client, month));

  useEffect(() => {
    if (profile.data && !initializedMonth.current) {
      initializedMonth.current = true;
      setMonth(currentMonth(profile.data.timezone));
    }
  }, [profile.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.budgetPlans(month) });
    queryClient.invalidateQueries({ queryKey: queryKeys.budgetSpending(month) });
  };
  const save = useMutation({
    mutationFn: saveLocalBudgetPlan,
    onSuccess: refresh,
  });
  const copyPrevious = useMutation({
    mutationFn: () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      return copyLocalBudgetPlans({ householdId: profile.data.household_id, fromMonth: shiftMonth(month, -1), toMonth: month });
    },
    onMutate: () => setCopyNotice(null),
    onSuccess: (copiedPlans) => {
      refresh();
      setCopyNotice(
        copiedPlans.length === 0
          ? 'There were no new plans to copy from last month.'
          : `Copied ${copiedPlans.length} ${copiedPlans.length === 1 ? 'plan' : 'plans'} from last month.`,
      );
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      return deleteLocalBudgetPlan(profile.data.household_id, id);
    },
    onSuccess: refresh,
  });

  const rows = useMemo(() => {
    const planByCategory = new Map((plans.data ?? []).map((plan) => [plan.category_id, plan]));
    const spendByCategory = new Map((spending.data ?? []).map((row) => [row.categoryId, row.spentCents]));
    return (categories.data ?? [])
      .filter((category) => !category.exclude_from_budget)
      .map((category) => ({
        category,
        plan: planByCategory.get(category.id),
        progress: budgetProgress(planByCategory.get(category.id)?.planned_cents, spendByCategory.get(category.id) ?? 0),
      }))
      // Keep a newly selected category visible long enough to enter and save
      // its first plan. Without this, tapping “+” set edit state but the row
      // was still filtered out because it had neither a plan nor spending.
      .filter((row) => row.plan || row.progress.spentCents > 0 || row.category.id === editingId);
  }, [categories.data, editingId, plans.data, spending.data]);
  const total = budgetTotal(rows.map((row) => ({ plannedCents: row.plan?.planned_cents ?? null, spentCents: row.progress.spentCents })));

  const beginEdit = (categoryId: string, plannedCents?: number) => {
    setEditingId(categoryId);
    setDraft(plannedCents == null ? '' : (plannedCents / 100).toFixed(0));
  };
  const submit = (categoryId: string) => {
    if (!profile.data) return;
    const value = Number(draft.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(value) || value < 0) return;
    save.mutate({ householdId: profile.data.household_id, categoryId, month, plannedCents: Math.round(value * 100) });
    setEditingId(null);
  };

  const loading = categories.isPending || plans.isPending || spending.isPending;
  const error = categories.error ?? plans.error ?? spending.error;

  return (
    <Screen scroll maxWidth="5xl">
      <PageHeader
        eyebrow="Plan with clarity"
        title="Budget"
        subtitle="Set a monthly plan, then see what is left as transactions arrive."
      />
      <View className="px-4 pb-5">
        <Card className="overflow-hidden">
          <View className="h-1 bg-mint-500" />
          <View className="flex-row items-center justify-between p-4">
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} className="h-11 w-11 items-center justify-center rounded-xl hover:bg-ink-100 dark:hover:bg-ink-800">
              <Ionicons name="chevron-back" size={21} color={colors.textMuted} />
            </Pressable>
            <View className="items-center">
              <Text className="text-lg font-bold text-ink-900 dark:text-ink-50">{monthLabel(month)}</Text>
              <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Monthly spending plan</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(shiftMonth(month, 1))} className="h-11 w-11 items-center justify-center rounded-xl hover:bg-ink-100 dark:hover:bg-ink-800">
              <Ionicons name="chevron-forward" size={21} color={colors.textMuted} />
            </Pressable>
          </View>
          <View className="border-t border-ink-100 px-4 py-4 dark:border-ink-800">
            <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500">Available to spend</Text>
            <Money cents={total.remainingCents} size="xl" colorize="both" className="mt-1" />
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              <View className={`h-full rounded-full ${total.status === 'over' ? 'bg-red-500' : 'bg-mint-500'}`} style={{ width: `${Math.min(100, Math.round((total.spentShare ?? 0) * 100))}%` }} />
            </View>
            <View className="mt-2 flex-row justify-between"><Text className="text-sm text-ink-500">Spent <Money cents={total.spentCents} size="sm" /></Text><Text className="text-sm text-ink-500">Planned <Money cents={total.plannedCents} size="sm" /></Text></View>
          </View>
          <View className="border-t border-ink-100 px-4 py-3 dark:border-ink-800">
            <Button label="Copy last month's plan" variant="secondary" onPress={() => copyPrevious.mutate()} loading={copyPrevious.isPending} />
            {copyNotice ? <Text accessibilityLiveRegion="polite" className="mt-2 text-center text-sm text-ink-500 dark:text-ink-400">{copyNotice}</Text> : null}
          </View>
        </Card>
      </View>
      {loading ? <View className="gap-3 px-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-24" rounded="2xl" />)}</View> : null}
      {error ? <ErrorNotice message={error.message} onRetry={refresh} /> : null}
      {!loading && !error ? <View className="gap-3 px-4 pb-8">
        {rows.length === 0 ? <EmptyState icon="wallet-outline" title="Start your monthly plan" message="Pick the categories you want to plan for, then add an amount." /> : rows.map(({ category, plan, progress }) => {
          const editing = editingId === category.id;
          const percent = progress.spentShare == null ? 0 : Math.min(100, Math.round(progress.spentShare * 100));
          return <Card key={category.id} className="p-4">
            <View className="flex-row items-start justify-between gap-3"><View className="min-w-0 flex-1"><Text className="text-base font-semibold text-ink-900 dark:text-ink-50">{category.icon} {category.name}</Text><Text className={`mt-1 text-sm ${progress.status === 'over' ? 'text-negative' : 'text-ink-500 dark:text-ink-400'}`}>{progress.status === 'unplanned' ? 'Unplanned spending' : `${percent}% used · ${progress.remainingCents < 0 ? 'Over by ' : 'Left '}`}</Text></View><Money cents={progress.remainingCents} colorize="both" /></View>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"><View className={`h-full rounded-full ${progress.status === 'over' ? 'bg-red-500' : 'bg-mint-500'}`} style={{ width: `${percent}%` }} /></View>
            <View className="mt-3 flex-row items-center justify-between"><Text className="text-sm text-ink-500">Spent <Money cents={progress.spentCents} size="sm" /> · Plan <Money cents={progress.plannedCents} size="sm" /></Text>{editing ? <View className="flex-row items-center gap-2"><TextInput autoFocus keyboardType="decimal-pad" value={draft} onChangeText={setDraft} onSubmitEditing={() => submit(category.id)} className="w-20 rounded-lg border border-ink-300 bg-white px-2 py-2 text-right text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" accessibilityLabel={`Budget amount for ${category.name}`} /><Button label="Save" onPress={() => submit(category.id)} loading={save.isPending} className="px-3" />{plan ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${category.name} budget`} onPress={() => { remove.mutate(plan.id); setEditingId(null); }} className="rounded-lg px-2 py-2"><Text className="font-semibold text-negative">Remove</Text></Pressable> : null}</View> : <Pressable accessibilityRole="button" onPress={() => beginEdit(category.id, plan?.planned_cents)} className="rounded-lg px-2 py-2"><Text className="font-semibold text-mint-600 dark:text-mint-400">Edit</Text></Pressable>}</View>
          </Card>;
        })}
        <Text className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-500">Add a category</Text>
        {(categories.data ?? []).filter((category) => !category.exclude_from_budget && !rows.some((row) => row.category.id === category.id)).map((category) => <Pressable key={category.id} accessibilityRole="button" onPress={() => beginEdit(category.id)} className="flex-row items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900"><Text className="text-base text-ink-700 dark:text-ink-200">{category.icon} {category.name}</Text><Ionicons name="add-circle-outline" size={21} color={colors.accent} /></Pressable>)}
      </View> : null}
    </Screen>
  );
}

export default function BudgetRoute() { return <RequireAuth><Budget /></RequireAuth>; }
