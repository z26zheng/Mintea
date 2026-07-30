import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  accountsWithInstitutionsQuery,
  findDuplicateAccountCandidates,
  mergeDuplicateAccounts,
  previewAccountMerge,
  type AccountMergePreviewRow,
  type DuplicateAccountCandidate,
} from "@mintea/core";

import { useClient } from "../../lib/auth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useDismiss } from "../../lib/useDismiss";
import { useTheme } from "../../lib/theme";
import { DuplicateReviewCard } from "../../components/DataTrust";
import { RequireAuth } from "../../components/RequireAuth";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  IconBadge,
  Loading,
  ModalHeader,
  Screen,
} from "../../components/ui";

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
  const dismiss = useDismiss("/(tabs)/accounts");
  const queryClient = useQueryClient();
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();
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
            ? "transaction"
            : "transactions"
        } and archived ${result.overlapping_transaction_count} ${
          result.overlapping_transaction_count === 1 ? "overlap" : "overlaps"
        }.`,
      );
      await queryClient.invalidateQueries();
    },
  });

  if (accounts.isPending) {
    return (
      <Screen maxWidth="5xl">
        <ModalHeader
          title="Duplicate accounts"
          subtitle="Prevent balances and activity from being counted twice"
          onClose={() => dismiss()}
        />
        <Loading label="Checking account data…" />
      </Screen>
    );
  }

  if (accounts.isError) {
    return (
      <Screen maxWidth="5xl">
        <ModalHeader
          title="Duplicate accounts"
          subtitle="Prevent balances and activity from being counted twice"
          onClose={() => dismiss()}
        />
        <ErrorNotice
          message={accounts.error.message}
          onRetry={() => accounts.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Duplicate accounts"
        subtitle="Prevent balances and activity from being counted twice"
        onClose={() => dismiss()}
      />
      <ScrollView
        contentContainerClassName="p-4 pb-16"
        showsVerticalScrollIndicator={false}
      >
        {notice ? (
          <Card className="mb-4 flex-row items-start gap-3 border-mint-200 bg-mint-50 p-4 dark:border-mint-800 dark:bg-mint-950/40">
            <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
            <Text
              accessibilityLiveRegion="polite"
              className="min-w-0 flex-1 text-sm leading-5 text-mint-800 dark:text-mint-200"
            >
              {notice}
            </Text>
          </Card>
        ) : null}

        <View className={`gap-4 ${isLarge ? "flex-row items-start" : ""}`}>
          <View className={isLarge ? "w-[310px] shrink-0 gap-4" : "gap-4"}>
            <Card className="overflow-hidden">
              <View
                className={`h-1 ${
                  candidates.length > 0 ? "bg-amber-500" : "bg-mint-500"
                }`}
              />
              <View className="p-4">
                <IconBadge
                  name={
                    candidates.length > 0
                      ? "git-compare-outline"
                      : "shield-checkmark-outline"
                  }
                  size={44}
                  tone={candidates.length > 0 ? "warning" : "accent"}
                />
                <Text className="mt-4 text-4xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
                  {candidates.length}
                </Text>
                <Text className="mt-0.5 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  possible {candidates.length === 1 ? "match" : "matches"}
                </Text>
                <Text className="mt-2 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Mintea compares institution, account type, currency, and last
                  four digits before suggesting a review.
                </Text>
              </View>
            </Card>

            <Card className="p-4">
              <View className="flex-row items-start gap-3">
                <IconBadge
                  name="lock-closed-outline"
                  size={38}
                  tone="neutral"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    Nothing happens automatically
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                    You choose which connection stays active, preview every
                    affected record, and confirm before a merge begins.
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View className={isLarge ? "min-w-0 flex-1" : ""}>
            <View className="mb-3 flex-row items-end justify-between gap-3 px-1">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                  Data integrity
                </Text>
                <Text className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
                  Review likely matches
                </Text>
              </View>
              <Badge
                label={`${candidates.length} to review`}
                tone={candidates.length > 0 ? "warning" : "accent"}
              />
            </View>

            {candidates.length === 0 ? (
              <Card className="overflow-hidden">
                <EmptyState
                  icon="✓"
                  title="No likely duplicates"
                  message="Your active linked accounts do not share the strong identity signals Mintea requires before suggesting a merge."
                />
              </Card>
            ) : (
              <View className="gap-4">
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
                          (merge.isError
                            ? merge.error
                            : previewMerge.error) as Error
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
                        if (preview?.candidateId === candidate.id) {
                          setPreview(null);
                        }
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
          </View>
        </View>
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
