import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoriesQuery,
  deleteTransactionRule,
  merchantsQuery,
  queryKeys,
  setTransactionRuleEnabled,
  transactionRulesQuery,
  type TransactionRuleRow,
} from '@mintea/core';

import { RequireAuth } from '../../components/RequireAuth';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  IconBadge,
  ModalHeader,
  Screen,
} from '../../components/ui';
import {
  RuleListSkeleton,
  TransactionRuleCard,
} from '../../components/SmartTransactions';
import { useClient } from '../../lib/auth';
import { useBreakpoint } from '../../lib/breakpoints';
import { useDismiss } from '../../lib/useDismiss';

function TransactionRules() {
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/settings');
  const queryClient = useQueryClient();
  const { isLarge } = useBreakpoint();
  const rules = useQuery(transactionRulesQuery(client));
  const merchants = useQuery(merchantsQuery(client));
  const categories = useQuery(categoriesQuery(client));
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const merchantById = useMemo(
    () => new Map((merchants.data ?? []).map((item) => [item.id, item])),
    [merchants.data],
  );
  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((item) => [item.id, item])),
    [categories.data],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.transactionRules });

  const toggle = useMutation({
    mutationFn: ({
      rule,
      enabled,
    }: {
      rule: TransactionRuleRow;
      enabled: boolean;
    }) => setTransactionRuleEnabled(client, rule.id, enabled),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not update the rule',
      ),
  });

  const remove = useMutation({
    mutationFn: (rule: TransactionRuleRow) =>
      deleteTransactionRule(client, rule.id),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setConfirmingDeleteId(null);
      await refresh();
    },
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not delete the rule',
      ),
  });

  const isPending =
    rules.isPending || merchants.isPending || categories.isPending;
  const queryError =
    rules.error?.message ??
    merchants.error?.message ??
    categories.error?.message ??
    null;
  const activeRules = (rules.data ?? []).filter((rule) => rule.enabled).length;
  const pausedRules = (rules.data ?? []).length - activeRules;

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Transaction rules"
        subtitle="Keep recurring cleanup consistent"
        onClose={dismiss}
      />

      {error || queryError ? (
        <ErrorNotice
          message={error ?? queryError ?? 'Could not load transaction rules'}
          onRetry={() => {
            setError(null);
            void Promise.all([
              rules.refetch(),
              merchants.refetch(),
              categories.refetch(),
            ]);
          }}
        />
      ) : null}

      {isPending ? (
        <RuleListSkeleton />
      ) : (
        <ScrollView contentContainerClassName="p-4 pb-16">
          <View
            className={`gap-4 ${isLarge ? 'flex-row items-start' : ''}`}
          >
            <View className={isLarge ? 'w-[310px] shrink-0 gap-4' : 'gap-4'}>
              <Card className="overflow-hidden">
                <View className="h-1 bg-mint-500" />
                <View className="p-4">
                  <IconBadge name="flash-outline" size={44} />
                  <Text className="mt-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
                    Quiet automation
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                    Rules clean up exact bank descriptions while keeping you in
                    control.
                  </Text>
                  <View className="mt-4 flex-row gap-2">
                    <View className="min-w-0 flex-1 rounded-xl bg-mint-50 px-3 py-2 dark:bg-mint-950/50">
                      <Text className="text-xl font-semibold tabular-nums text-mint-700 dark:text-mint-300">
                        {activeRules}
                      </Text>
                      <Text className="text-xs text-mint-700 dark:text-mint-300">
                        Active
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800">
                      <Text className="text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                        {pausedRules}
                      </Text>
                      <Text className="text-xs text-ink-500 dark:text-ink-400">
                        Paused
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>

              <Card className="p-4">
                <View className="flex-row items-start gap-3">
                  <IconBadge
                    name="shield-checkmark-outline"
                    size={38}
                    tone="neutral"
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                      Predictable by design
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                      Matching ignores only case and repeated spaces. Existing
                      cleanup remains when a rule is paused or deleted.
                    </Text>
                  </View>
                </View>
              </Card>
            </View>

            <View className={isLarge ? 'min-w-0 flex-1' : ''}>
              <View className="mb-3 flex-row items-end justify-between gap-3 px-1">
                <View className="min-w-0 flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                    Saved automations
                  </Text>
                  <Text className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
                    Exact-match cleanup
                  </Text>
                </View>
                <Badge
                  label={`${rules.data?.length ?? 0} total`}
                  tone="neutral"
                />
              </View>

              {rules.data?.length ? (
                rules.data.map((rule) => {
                  const merchant = rule.merchant_id
                    ? merchantById.get(rule.merchant_id)
                    : undefined;
                  const category = rule.category_id
                    ? categoryById.get(rule.category_id)
                    : undefined;
                  const busy =
                    (toggle.isPending &&
                      toggle.variables?.rule.id === rule.id) ||
                    (remove.isPending && remove.variables?.id === rule.id);

                  return (
                    <TransactionRuleCard
                      key={rule.id}
                      rule={rule}
                      merchantName={merchant?.name}
                      categoryLabel={
                        category
                          ? `${category.icon} ${category.name}`
                          : undefined
                      }
                      confirmingDelete={confirmingDeleteId === rule.id}
                      busy={busy}
                      onToggle={(enabled) =>
                        toggle.mutate({ rule, enabled })
                      }
                      onRequestDelete={() =>
                        setConfirmingDeleteId(rule.id)
                      }
                      onCancelDelete={() => setConfirmingDeleteId(null)}
                      onDelete={() => remove.mutate(rule)}
                    />
                  );
                })
              ) : (
                <Card className="overflow-hidden">
                  <EmptyState
                    icon="✨"
                    title="No rules yet"
                    message="Open a transaction and turn on “Automate this cleanup” to create your first rule."
                  />
                </Card>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

export default function TransactionRulesRoute() {
  return (
    <RequireAuth>
      <TransactionRules />
    </RequireAuth>
  );
}
