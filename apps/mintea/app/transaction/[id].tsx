import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountsQuery,
  categoriesQuery,
  deleteTransaction,
  divideCents,
  formatFullDate,
  formatMoney,
  isValidIsoDate,
  linkTransferPair,
  merchantsQuery,
  setTransactionTags,
  tagsQuery,
  transactionTagsQuery,
  parseMoney,
  removeSplits,
  saveTransactionRule,
  setTransactionRuleEnabled,
  splitTransaction,
  sumCents,
  transactionQuery,
  transactionRulePreviewQuery,
  transactionSplitsQuery,
  transferCandidatesQuery,
  unlinkTransferPair,
  updateTransaction,
  upsertMerchant,
  type CategoryRow,
  type TransferCandidateRow,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useBreakpoint } from '../../lib/breakpoints';
import { useTheme } from '../../lib/theme';
import {
  Button,
  Card,
  Divider,
  ErrorNotice,
  Field,
  IconBadge,
  Loading,
  ModalHeader,
  Money,
  Screen,
  SegmentedControl,
  SettingRow,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';
import { useDismiss } from '../../lib/useDismiss';
import { CategoryPicker } from '../../components/CategoryPicker';
import { TagPicker } from '../../components/TagPicker';
import { TagList } from '../../components/TagChip';
import { TransferMatchPanel } from '../../components/DataTrust';
import {
  MerchantPicker,
  TransactionAutomationCard,
} from '../../components/SmartTransactions';

type DraftSplit = { amount: string; categoryId: string | null };

function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/transactions');
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { isLarge } = useBreakpoint();

  const transaction = useQuery(transactionQuery(client, id));
  const splits = useQuery(transactionSplitsQuery(client, id));
  const categories = useQuery(categoriesQuery(client));
  const merchants = useQuery(merchantsQuery(client));
  const allTags = useQuery(tagsQuery(client));
  const savedTagIds = useQuery(transactionTagsQuery(client, id));
  const canAutomate = Boolean(
    transaction.data &&
      transaction.data.parent_id === null &&
      transaction.data.original_description?.trim(),
  );
  const rulePreview = useQuery({
    ...transactionRulePreviewQuery(client, id),
    enabled: canAutomate,
  });
  const pairedId = transaction.data?.transfer_pair_id ?? '';
  const canSearchForTransfer = Boolean(
    transaction.data &&
      !transaction.data.transfer_pair_id &&
      !transaction.data.is_pending &&
      !transaction.data.is_hidden &&
      !transaction.data.has_splits &&
      !transaction.data.parent_id &&
      transaction.data.amount_cents !== 0,
  );
  const transferCandidates = useQuery({
    ...transferCandidatesQuery(client, id),
    enabled: canSearchForTransfer,
  });
  const pairedTransaction = useQuery({
    ...transactionQuery(client, pairedId),
    enabled: Boolean(pairedId),
  });
  const accounts = useQuery({
    ...accountsQuery(client),
    enabled: Boolean(pairedId),
  });

  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[] | null>(null);
  const [pickingTags, setPickingTags] = useState(false);
  const [newMerchantName, setNewMerchantName] = useState('');
  const [picking, setPicking] = useState(false);
  const [pickingMerchant, setPickingMerchant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationInitializedId, setAutomationInitializedId] = useState<
    string | null
  >(null);

  const [editingSplits, setEditingSplits] = useState(false);
  const [draftSplits, setDraftSplits] = useState<DraftSplit[]>([]);
  const [splitTarget, setSplitTarget] = useState<number | null>(null);

  useEffect(() => {
    if (!transaction.data || initializedId === transaction.data.id) return;

    setDescription(transaction.data.description);
    setDate(transaction.data.date);
    setAmount(String(Math.abs(transaction.data.amount_cents) / 100));
    setDirection(transaction.data.amount_cents < 0 ? 'expense' : 'income');
    setNotes(transaction.data.notes ?? '');
    setCategoryId(transaction.data.category_id);
    setMerchantId(transaction.data.merchant_id);
    setNewMerchantName('');
    setInitializedId(transaction.data.id);
  }, [initializedId, transaction.data]);

  // Tags load separately from the transaction, so they seed on their own once
  // fetched. `null` means "not loaded yet" and is what keeps a save from
  // clearing tags that simply hadn't arrived.
  useEffect(() => {
    if (savedTagIds.data && tagIds === null) setTagIds(savedTagIds.data);
  }, [savedTagIds.data, tagIds]);

  useEffect(() => {
    if (
      !rulePreview.data ||
      automationInitializedId === transaction.data?.id
    ) {
      return;
    }

    setAutomationEnabled(Boolean(rulePreview.data.existing_rule_enabled));
    setAutomationInitializedId(transaction.data?.id ?? null);
  }, [automationInitializedId, rulePreview.data, transaction.data?.id]);

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const merchantById = useMemo(
    () => new Map((merchants.data ?? []).map((merchant) => [merchant.id, merchant])),
    [merchants.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      const current = transaction.data;
      if (!current) throw new Error('Transaction not loaded');
      if (!isValidIsoDate(date)) throw new Error('Date must be YYYY-MM-DD');
      if (!description.trim()) throw new Error('Description is required');

      const magnitude = parseMoney(amount);
      if (magnitude === null || magnitude === 0) {
        throw new Error('Enter a non-zero amount');
      }

      const signedAmount =
        direction === 'expense'
          ? -Math.abs(magnitude)
          : Math.abs(magnitude);

      const resolvedMerchantId = newMerchantName.trim()
        ? (
            await upsertMerchant(
              client,
              current.household_id,
              newMerchantName.trim().replace(/\s+/g, ' '),
            )
          ).id
        : merchantId;

      await updateTransaction(client, id, {
        description: description.trim(),
        notes: notes.trim() || null,
        category_id: categoryId,
        merchant_id: resolvedMerchantId,
        needs_review: false,
        ...(date !== current.date ? { date } : {}),
        ...(signedAmount !== current.amount_cents
          ? { amount_cents: signedAmount }
          : {}),
      });

      // Only writes when the set actually changed, so an unrelated save
      // doesn't churn assignments.
      if (tagIds !== null && savedTagIds.data) {
        const before = [...savedTagIds.data].sort().join(',');
        const after = [...tagIds].sort().join(',');
        if (before !== after) await setTransactionTags(client, id, tagIds);
      }

      if (automationEnabled) {
        if (!resolvedMerchantId && !categoryId) {
          throw new Error(
            'Choose a merchant or category before enabling automation',
          );
        }

        await saveTransactionRule(client, {
          transactionId: id,
          merchantId: resolvedMerchantId,
          categoryId,
          applyToExisting: true,
        });
      } else if (
        rulePreview.data?.existing_rule_id &&
        rulePreview.data.existing_rule_enabled
      ) {
        await setTransactionRuleEnabled(
          client,
          rulePreview.data.existing_rule_id,
          false,
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      dismiss();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
  });

  const toggle = useMutation({
    mutationFn: (patch: { is_hidden?: boolean; needs_review?: boolean }) =>
      updateTransaction(client, id, patch),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const remove = useMutation({
    mutationFn: () => deleteTransaction(client, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      dismiss();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not remove'),
  });

  const applySplits = useMutation({
    mutationFn: async () => {
      if (!transaction.data) throw new Error('Transaction not loaded');

      const parts = draftSplits.map((split) => ({
        amountCents: parseMoney(split.amount) ?? 0,
        categoryId: split.categoryId,
      }));

      // `splitTransaction` refuses to write splits that don't reconcile, so a
      // clear message here beats a raw throw from the data layer.
      const total = sumCents(parts.map((part) => part.amountCents));
      if (total !== transaction.data.amount_cents) {
        throw new Error(
          `Splits total ${formatMoney(total)} but the transaction is ${formatMoney(
            transaction.data.amount_cents,
          )}.`,
        );
      }

      return splitTransaction(client, transaction.data, parts);
    },
    onSuccess: async () => {
      setEditingSplits(false);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not split'),
  });

  const clearSplits = useMutation({
    mutationFn: () => removeSplits(client, id),
    onSuccess: async () => {
      setEditingSplits(false);
      await queryClient.invalidateQueries();
    },
  });

  const matchTransfer = useMutation({
    mutationFn: (candidate: TransferCandidateRow) =>
      linkTransferPair(client, {
        transactionId: id,
        counterpartId: candidate.id,
      }),
    onSuccess: async () => {
      setTransferError(null);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setTransferError(
        caught instanceof Error ? caught.message : 'Could not match transfer',
      ),
  });

  const unlinkTransfer = useMutation({
    mutationFn: () => unlinkTransferPair(client, id),
    onSuccess: async () => {
      setTransferError(null);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setTransferError(
        caught instanceof Error ? caught.message : 'Could not unlink transfer',
      ),
  });

  if (transaction.isPending) return <Loading />;

  if (transaction.isError || !transaction.data) {
    return (
      <Screen>
        <ModalHeader title="Transaction" onClose={() => dismiss()} />
        <ErrorNotice message="That transaction no longer exists." />
      </Screen>
    );
  }

  const record = transaction.data;
  const category = categoryId ? categoryById.get(categoryId) : null;
  const selectedTags = (tagIds ?? []).flatMap((tagId) => {
    const tag = (allTags.data ?? []).find((candidate) => candidate.id === tagId);
    return tag ? [tag] : [];
  });

  const merchantName = merchantId
    ? merchantById.get(merchantId)?.name
    : newMerchantName.trim() || null;
  const existingSplits = splits.data ?? [];
  const parsedAmount = parseMoney(amount);
  const draftAmount =
    parsedAmount === null || parsedAmount === 0
      ? record.amount_cents
      : direction === 'expense'
        ? -Math.abs(parsedAmount)
        : Math.abs(parsedAmount);
  const canSave =
    description.trim().length > 0 &&
    isValidIsoDate(date) &&
    parsedAmount !== null &&
    parsedAmount !== 0 &&
    (!automationEnabled || Boolean(merchantName || categoryId));

  const beginSplitting = () => {
    setError(null);
    setEditingSplits(true);
    setDraftSplits(
      existingSplits.length > 0
        ? existingSplits.map((split) => ({
            amount: String(split.amount_cents / 100),
            categoryId: split.category_id,
          }))
        : divideCents(record.amount_cents, 2).map((cents) => ({
            amount: String(cents / 100),
            categoryId: record.category_id,
          })),
    );
  };

  const draftTotal = sumCents(
    draftSplits.map((split) => parseMoney(split.amount) ?? 0),
  );
  const remainder = record.amount_cents - draftTotal;

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Edit transaction"
        subtitle={record.is_pending ? 'Pending activity' : 'Posted activity'}
        onClose={() => dismiss()}
        action={{
          label: save.isPending ? 'Saving…' : 'Save',
          onPress: () => {
            setError(null);
            save.mutate();
          },
          disabled: save.isPending || !canSave,
        }}
      />

      <ScrollView
        contentContainerClassName="px-4 py-5 pb-20"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorNotice message={error} /> : null}

        <View
          className={
            isLarge ? 'flex-row items-start gap-5' : 'gap-5'
          }
        >
          <View className={isLarge ? 'min-w-0 flex-[1.18]' : ''}>
            <Card className="mb-5 overflow-hidden">
              <View className="h-1 bg-mint-500" />
              <View className="items-center px-5 py-6">
                <IconBadge
                  name={
                    direction === 'income'
                      ? 'arrow-down-outline'
                      : 'arrow-up-outline'
                  }
                  size={42}
                />
                <Money
                  cents={draftAmount}
                  currency={record.currency}
                  size="xl"
                  colorize="income-only"
                  className="mt-3"
                />
                <View className="mt-2 flex-row flex-wrap items-center justify-center gap-2">
                  <Text className="text-sm text-ink-500 dark:text-ink-400">
                    {formatFullDate(
                      isValidIsoDate(date) ? date : record.date,
                    )}
                  </Text>
                  {record.is_pending ? (
                    <View className="rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-950">
                      <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Pending
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>

            <Card className="mb-5 p-4">
              <View className="mb-5 flex-row items-center gap-3">
                <IconBadge name="create-outline" size={38} />
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                    Transaction details
                  </Text>
                  <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                    Update how this activity appears across Mintea.
                  </Text>
                </View>
              </View>

        {record.has_splits ? (
          <View className="p-4 mb-5 rounded-xl bg-ink-50 dark:bg-ink-800">
            <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
              Amount locked while split
            </Text>
            <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              Remove the split below before changing the total amount or its
              direction.
            </Text>
          </View>
        ) : (
          <>
            <SegmentedControl
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
              ]}
              value={direction}
              onChange={setDirection}
              className="mb-5"
            />

            <Field
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="mb-2"
              error={
                amount.length > 0 &&
                (parsedAmount === null || parsedAmount === 0)
                  ? 'Enter a non-zero number'
                  : undefined
              }
            />

            {record.plaid_transaction_id || record.transfer_pair_id ? (
              <View className="mb-5">
                {record.plaid_transaction_id ? (
                  <Text className="text-xs text-ink-400 dark:text-ink-500">
                    An edited amount changes Mintea reports, but not the balance
                    reported by your bank.
                  </Text>
                ) : null}
                {record.transfer_pair_id ? (
                  <Text
                    className={`text-xs text-ink-400 dark:text-ink-500 ${
                      record.plaid_transaction_id ? 'mt-1' : ''
                    }`}
                  >
                    Changing the amount or date unlinks this transfer.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View className="mb-3" />
            )}
          </>
        )}

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          className="mb-5"
        />

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Merchant
        </Text>
        <Pressable
          onPress={() => setPickingMerchant(true)}
          accessibilityRole="button"
          accessibilityLabel={`Merchant, ${merchantName ?? 'none'}`}
          className="min-h-12 flex-row items-center gap-3 rounded-xl border border-ink-300 bg-white px-3 py-2 hover:border-mint-400 hover:bg-mint-50/40 active:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-700 dark:hover:bg-mint-950/30 mb-5"
        >
          <IconBadge name="storefront-outline" size={34} />
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 text-base text-ink-900 dark:text-ink-50"
          >
            {merchantName ??
              (merchantId && merchants.isPending
                ? 'Loading merchant…'
                : 'No merchant')}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={colors.textMuted}
          />
        </Pressable>

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Category
        </Text>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Category, ${category?.name ?? 'Uncategorized'}`}
          className="min-h-12 flex-row items-center gap-3 rounded-xl border border-ink-300 bg-white px-3 py-2 hover:border-mint-400 hover:bg-mint-50/40 active:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-700 dark:hover:bg-mint-950/30 mb-5"
        >
          <View className="h-[34px] w-[34px] items-center justify-center rounded-xl bg-ink-100 dark:bg-ink-800">
            <Text className="text-lg">{category?.icon ?? '❓'}</Text>
          </View>
          <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
            {category?.name ?? 'Uncategorized'}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={colors.textMuted}
          />
        </Pressable>

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Tags
        </Text>
        <Pressable
          onPress={() => setPickingTags(true)}
          accessibilityRole="button"
          accessibilityLabel={
            selectedTags.length === 0
              ? 'Tags, none'
              : `Tags, ${selectedTags.map((tag) => tag.name).join(', ')}`
          }
          className="min-h-12 flex-row items-center gap-3 rounded-xl border border-ink-300 bg-white px-3 py-2 hover:border-mint-400 hover:bg-mint-50/40 active:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-700 dark:hover:bg-mint-950/30 mb-5"
        >
          <IconBadge name="pricetags-outline" size={34} />
          <View className="flex-1 min-w-0">
            {selectedTags.length > 0 ? (
              <TagList tags={selectedTags} size="base" />
            ) : (
              <Text className="text-base text-ink-500 dark:text-ink-400">
                {savedTagIds.isPending ? 'Loading tags…' : 'Add tags'}
              </Text>
            )}
          </View>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={colors.textMuted}
          />
        </Pressable>

        <Field
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          className="mb-5"
          error={
            date.length > 0 && !isValidIsoDate(date)
              ? 'Use the format YYYY-MM-DD'
              : undefined
          }
        />

        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add a note"
          multiline
          className="mb-5"
        />

        {record.original_description &&
        record.original_description !== record.description ? (
          <View className="mb-1 flex-row gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
            <Ionicons
              name="business-outline"
              size={16}
              color={colors.textMuted}
            />
            <Text className="min-w-0 flex-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
              Bank description: {record.original_description}
            </Text>
          </View>
        ) : null}
            </Card>
          </View>

          <View className={isLarge ? 'min-w-0 flex-1' : ''}>
        {canAutomate ? (
          <TransactionAutomationCard
            matchDescription={
              rulePreview.data?.match_description ??
              record.original_description ??
              record.description
            }
            matchCount={rulePreview.data?.matched_transaction_count ?? 0}
            enabled={automationEnabled}
            existingRule={Boolean(rulePreview.data?.existing_rule_id)}
            loading={rulePreview.isPending}
            error={rulePreview.isError ? rulePreview.error.message : null}
            hasAction={Boolean(merchantName || categoryId)}
            onToggle={setAutomationEnabled}
          />
        ) : null}

        <TransferMatchPanel
          transaction={record}
          pairedTransaction={pairedTransaction.data}
          pairedAccountName={
            accounts.data?.find(
              (account) => account.id === pairedTransaction.data?.account_id,
            )?.name
          }
          candidates={transferCandidates.data ?? []}
          loading={
            Boolean(record.transfer_pair_id && pairedTransaction.isPending)
          }
          error={
            transferError ??
            (transferCandidates.isError
              ? transferCandidates.error.message
              : pairedTransaction.isError
                ? 'The linked transaction is no longer available.'
                : null)
          }
          matchingId={matchTransfer.variables?.id}
          unlinking={unlinkTransfer.isPending}
          onMatch={(candidate) => {
            setTransferError(null);
            matchTransfer.mutate(candidate);
          }}
          onUnlink={() => {
            setTransferError(null);
            unlinkTransfer.mutate();
          }}
        />

        {/* -------------------------------------------------------- splits */}
        <Card className="overflow-hidden mb-5">
          {editingSplits ? (
            <View className="p-4">
              <Text className="text-base font-semibold text-ink-900 dark:text-ink-50 mb-3">
                Split into parts
              </Text>

              {draftSplits.map((split, index) => (
                <View key={index} className="flex-row items-end gap-2 mb-3">
                  <Field
                    label={index === 0 ? 'Amount' : undefined}
                    value={split.amount}
                    onChangeText={(value) =>
                      setDraftSplits((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, amount: value } : item,
                        ),
                      )
                    }
                    keyboardType="numbers-and-punctuation"
                    inputMode="text"
                    className="w-32"
                  />

                  <Pressable
                    onPress={() => setSplitTarget(index)}
                    accessibilityRole="button"
                    className="flex-1 h-12 px-3 rounded-xl bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 flex-row items-center gap-2"
                  >
                    <Text className="text-base">
                      {split.categoryId
                        ? (categoryById.get(split.categoryId)?.icon ?? '❓')
                        : '❓'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="flex-1 text-sm text-ink-900 dark:text-ink-50"
                    >
                      {split.categoryId
                        ? (categoryById.get(split.categoryId)?.name ??
                          'Uncategorized')
                        : 'Uncategorized'}
                    </Text>
                  </Pressable>

                  {draftSplits.length > 2 ? (
                    <Pressable
                      onPress={() =>
                        setDraftSplits((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      accessibilityRole="button"
                      className="h-12 w-10 items-center justify-center"
                    >
                      <Text className="text-ink-400 text-xl">×</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              <Pressable
                onPress={() =>
                  setDraftSplits((current) => [
                    ...current,
                    { amount: String(remainder / 100), categoryId: null },
                  ])
                }
                accessibilityRole="button"
                className="py-2"
              >
                <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                  + Add part
                </Text>
              </Pressable>

              <Text
                className={`text-sm mt-2 ${
                  remainder === 0
                    ? 'text-ink-500 dark:text-ink-400'
                    : 'text-negative'
                }`}
              >
                {remainder === 0
                  ? 'Splits add up.'
                  : `${formatMoney(remainder)} left to assign`}
              </Text>

              <View className="flex-row gap-3 mt-4">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setEditingSplits(false)}
                  className="flex-1"
                />
                <Button
                  label="Apply"
                  onPress={() => {
                    setError(null);
                    applySplits.mutate();
                  }}
                  disabled={remainder !== 0 || applySplits.isPending}
                  className="flex-1"
                />
              </View>
            </View>
          ) : existingSplits.length > 0 ? (
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-4 pt-4 pb-1">
                Split into {existingSplits.length}
              </Text>

              {existingSplits.map((split, index) => (
                <View key={split.id}>
                  {index > 0 ? <Divider /> : null}
                  <View className="flex-row items-center px-4 py-3 gap-3">
                    <Text className="text-lg">
                      {split.category_id
                        ? (categoryById.get(split.category_id)?.icon ?? '❓')
                        : '❓'}
                    </Text>
                    <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
                      {split.category_id
                        ? (categoryById.get(split.category_id)?.name ??
                          'Uncategorized')
                        : 'Uncategorized'}
                    </Text>
                    <Text className="text-base font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                      {formatMoney(split.amount_cents)}
                    </Text>
                  </View>
                </View>
              ))}

              <View className="flex-row gap-3 p-4">
                <Button
                  label="Edit splits"
                  variant="secondary"
                  onPress={beginSplitting}
                  className="flex-1"
                />
                <Button
                  label="Remove"
                  variant="ghost"
                  onPress={() => clearSplits.mutate()}
                  className="flex-1"
                />
              </View>
            </View>
          ) : (
            <SettingRow
              label="Split this transaction"
              description="Divide it across several categories."
              onPress={beginSplitting}
              leading={<IconBadge name="git-branch-outline" size={34} />}
              right={
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={colors.textMuted}
                />
              }
            />
          )}
        </Card>

        <Card className="overflow-hidden">
          <SettingRow
            label="Needs review"
            description="Keep this transaction in your review queue."
            leading={<IconBadge name="checkmark-done-outline" size={34} />}
            right={
              <Switch
                value={record.needs_review}
                onValueChange={(value) => toggle.mutate({ needs_review: value })}
                trackColor={{ true: colors.accent }}
              />
            }
          />
          <Divider />
          <SettingRow
            label="Hide from reports"
            description="Excluded from totals, cash flow and budgets."
            leading={<IconBadge name="eye-off-outline" size={34} />}
            right={
              <Switch
                value={record.is_hidden}
                onValueChange={(value) => toggle.mutate({ is_hidden: value })}
                trackColor={{ true: colors.accent }}
              />
            }
          />
        </Card>

        <View className="mt-8">
          {confirmingRemove ? (
            <Card className="p-4 border-red-300 dark:border-red-900">
              <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                Remove this transaction?
              </Text>
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
                It will disappear from transaction lists and reports. A future
                Plaid sync will not add it back.
              </Text>
              <View className="flex-row gap-3">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setConfirmingRemove(false)}
                  className="flex-1"
                />
                <Button
                  label={remove.isPending ? 'Removing…' : 'Remove'}
                  variant="danger"
                  disabled={remove.isPending}
                  onPress={() => {
                    setError(null);
                    remove.mutate();
                  }}
                  className="flex-1"
                />
              </View>
            </Card>
          ) : (
            <Button
              label="Remove transaction"
              variant="danger"
              onPress={() => setConfirmingRemove(true)}
            />
          )}
        </View>
          </View>
        </View>
      </ScrollView>

      <TagPicker
        visible={pickingTags}
        selected={tagIds ?? []}
        onChange={setTagIds}
        onClose={() => setPickingTags(false)}
      />

      <CategoryPicker
        visible={picking}
        onClose={() => setPicking(false)}
        selectedId={categoryId}
        onSelect={(chosen: CategoryRow) => setCategoryId(chosen.id)}
      />

      <MerchantPicker
        visible={pickingMerchant}
        merchants={merchants.data ?? []}
        selectedId={merchantId}
        selectedName={newMerchantName}
        onClose={() => setPickingMerchant(false)}
        onSelect={(choice) => {
          setMerchantId(choice.id);
          setNewMerchantName(choice.id ? '' : choice.name);
        }}
      />

      <CategoryPicker
        visible={splitTarget !== null}
        onClose={() => setSplitTarget(null)}
        onSelect={(chosen) =>
          setDraftSplits((current) =>
            current.map((item, index) =>
              index === splitTarget ? { ...item, categoryId: chosen.id } : item,
            ),
          )
        }
      />
    </Screen>
  );
}

export default function TransactionDetailRoute() {
  return (
    <RequireAuth>
      <TransactionDetail />
    </RequireAuth>
  );
}
