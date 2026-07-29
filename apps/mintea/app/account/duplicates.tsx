import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountsWithInstitutionsQuery,
  findDuplicateAccountCandidates,
  mergeDuplicateAccounts,
  previewAccountMerge,
  type AccountMergePreviewRow,
  type DuplicateAccountCandidate,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useDismiss } from '../../lib/useDismiss';
import { DuplicateReviewCard } from '../../components/DataTrust';
import { RequireAuth } from '../../components/RequireAuth';
import {
  Card,
  EmptyState,
  ErrorNotice,
  Loading,
  ModalHeader,
  Screen,
} from '../../components/ui';

type MergeSelection = {
  candidateId: string;
  keepId: string;
};

type MergePreview = MergeSelection & {
  data: AccountMergePreviewRow;
};

function accountIds(
  candidate: DuplicateAccountCandidate,
  keepId: string,
): { sourceAccountId: string; destinationAccountId: string } {
  const sourceAccountId =
    candidate.first.id === keepId ? candidate.second.id : candidate.first.id;

  return {
    sourceAccountId,
    destinationAccountId: keepId,
  };
}

function DuplicateAccounts() {
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/accounts');
  const queryClient = useQueryClient();
  const accounts = useQuery(accountsWithInstitutionsQuery(client));
  const [keepByCandidate, setKeepByCandidate] = useState<
    Record<string, string>
  >({});
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const candidates = useMemo(
    () => findDuplicateAccountCandidates(accounts.data ?? []),
    [accounts.data],
  );

  const previewMerge = useMutation({
    mutationFn: async ({
      candidate,
      keepId,
    }: {
      candidate: DuplicateAccountCandidate;
      keepId: string;
    }) => {
      const data = await previewAccountMerge(
        client,
        accountIds(candidate, keepId),
      );
      return { candidateId: candidate.id, keepId, data };
    },
    onSuccess: (result) => setPreview(result),
  });

  const merge = useMutation({
    mutationFn: async ({
      candidate,
      keepId,
    }: {
      candidate: DuplicateAccountCandidate;
      keepId: string;
    }) => mergeDuplicateAccounts(client, accountIds(candidate, keepId)),
    onSuccess: async (result) => {
      setPreview(null);
      setNotice(
        `Duplicate resolved. Moved ${result.transaction_count_to_move} unique ${
          result.transaction_count_to_move === 1
            ? 'transaction'
            : 'transactions'
        } and archived ${result.overlapping_transaction_count} ${
          result.overlapping_transaction_count === 1 ? 'overlap' : 'overlaps'
        }.`,
      );
      await queryClient.invalidateQueries();
    },
  });

  if (accounts.isPending) return <Loading label="Checking account data…" />;

  if (accounts.isError) {
    return (
      <Screen>
        <ModalHeader title="Duplicate accounts" onClose={() => dismiss()} />
        <ErrorNotice
          message={accounts.error.message}
          onRetry={() => accounts.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="Duplicate accounts" onClose={() => dismiss()} />
      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-16"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-base text-ink-600 dark:text-ink-300">
          Mintea found accounts with the same institution, type, currency, and
          last four digits. Nothing is changed until you review and confirm.
        </Text>

        {notice ? (
          <Card className="border-mint-200 dark:border-mint-800 bg-mint-50 dark:bg-mint-950 p-4 mt-4">
            <Text
              accessibilityLiveRegion="polite"
              className="text-sm text-mint-800 dark:text-mint-200"
            >
              {notice}
            </Text>
          </Card>
        ) : null}

        {candidates.length === 0 ? (
          <EmptyState
            icon="✓"
            title="No likely duplicates"
            message="Your active linked accounts do not share the strong identity signals Mintea requires before suggesting a merge."
          />
        ) : (
          <View className="gap-4 mt-4">
            {candidates.map((candidate) => {
              const keepId =
                keepByCandidate[candidate.id] ??
                candidate.recommendedKeepId;
              const isPreviewing =
                previewMerge.isPending &&
                previewMerge.variables?.candidate.id === candidate.id;
              const isMerging =
                merge.isPending &&
                merge.variables?.candidate.id === candidate.id;
              const candidatePreview =
                preview?.candidateId === candidate.id &&
                preview.keepId === keepId
                  ? preview.data
                  : null;
              const error =
                (previewMerge.isError &&
                  previewMerge.variables?.candidate.id === candidate.id) ||
                (merge.isError &&
                  merge.variables?.candidate.id === candidate.id)
                  ? (
                      (merge.isError ? merge.error : previewMerge.error) as Error
                    ).message
                  : null;

              return (
                <DuplicateReviewCard
                  key={candidate.id}
                  candidate={candidate}
                  keepId={keepId}
                  preview={candidatePreview}
                  previewing={isPreviewing}
                  merging={isMerging}
                  disabled={previewMerge.isPending || merge.isPending}
                  error={error}
                  onKeepChange={(id) => {
                    setKeepByCandidate((current) => ({
                      ...current,
                      [candidate.id]: id,
                    }));
                    if (preview?.candidateId === candidate.id) setPreview(null);
                    previewMerge.reset();
                    merge.reset();
                  }}
                  onPreview={() => {
                    setNotice(null);
                    previewMerge.reset();
                    merge.reset();
                    previewMerge.mutate({ candidate, keepId });
                  }}
                  onCancelPreview={() => {
                    setPreview(null);
                    previewMerge.reset();
                    merge.reset();
                  }}
                  onMerge={() => {
                    setNotice(null);
                    merge.reset();
                    merge.mutate({ candidate, keepId });
                  }}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

export default function DuplicateAccountsRoute() {
  return (
    <RequireAuth>
      <DuplicateAccounts />
    </RequireAuth>
  );
}
