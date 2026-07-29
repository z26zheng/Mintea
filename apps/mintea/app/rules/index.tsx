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
  EmptyState,
  ErrorNotice,
  ModalHeader,
  Screen,
} from '../../components/ui';
import {
  RuleListSkeleton,
  TransactionRuleCard,
} from '../../components/SmartTransactions';
import { useClient } from '../../lib/auth';
import { useDismiss } from '../../lib/useDismiss';

function TransactionRules() {
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/settings');
  const queryClient = useQueryClient();
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

  return (
    <Screen>
      <ModalHeader title="Transaction rules" onClose={dismiss} />

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
          <View className="mb-5 rounded-2xl bg-mint-50 p-4 dark:bg-mint-950/40">
            <Text className="text-sm font-semibold text-mint-800 dark:text-mint-200">
              Predictable by design
            </Text>
            <Text className="mt-1 text-sm text-mint-700 dark:text-mint-300">
              Rules match the bank description exactly, ignoring only case and
              repeated spaces. Pause or delete a rule at any time.
            </Text>
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
                (toggle.isPending && toggle.variables?.rule.id === rule.id) ||
                (remove.isPending && remove.variables?.id === rule.id);

              return (
                <TransactionRuleCard
                  key={rule.id}
                  rule={rule}
                  merchantName={merchant?.name}
                  categoryLabel={
                    category ? `${category.icon} ${category.name}` : undefined
                  }
                  confirmingDelete={confirmingDeleteId === rule.id}
                  busy={busy}
                  onToggle={(enabled) => toggle.mutate({ rule, enabled })}
                  onRequestDelete={() => setConfirmingDeleteId(rule.id)}
                  onCancelDelete={() => setConfirmingDeleteId(null)}
                  onDelete={() => remove.mutate(rule)}
                />
              );
            })
          ) : (
            <EmptyState
              icon="✨"
              title="No rules yet"
              message="Open a transaction and turn on “Automate this cleanup” to create your first rule."
            />
          )}
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
