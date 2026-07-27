import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoriesQuery,
  deleteTransaction,
  divideCents,
  formatFullDate,
  formatMoney,
  isValidIsoDate,
  parseMoney,
  removeSplits,
  splitTransaction,
  sumCents,
  transactionQuery,
  transactionSplitsQuery,
  updateTransaction,
  type CategoryRow,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  Button,
  Card,
  Divider,
  ErrorNotice,
  Field,
  Loading,
  ModalHeader,
  Screen,
  SettingRow,
} from '../../components/ui';
import { CategoryPicker } from '../../components/CategoryPicker';

type DraftSplit = { amount: string; categoryId: string | null };

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const transaction = useQuery(transactionQuery(client, id));
  const splits = useQuery(transactionSplitsQuery(client, id));
  const categories = useQuery(categoriesQuery(client));

  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingSplits, setEditingSplits] = useState(false);
  const [draftSplits, setDraftSplits] = useState<DraftSplit[]>([]);
  const [splitTarget, setSplitTarget] = useState<number | null>(null);

  useEffect(() => {
    if (!transaction.data) return;
    setDescription(transaction.data.description);
    setDate(transaction.data.date);
    setNotes(transaction.data.notes ?? '');
    setCategoryId(transaction.data.category_id);
  }, [transaction.data]);

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  const save = useMutation({
    mutationFn: () => {
      if (!isValidIsoDate(date)) throw new Error('Date must be YYYY-MM-DD');

      return updateTransaction(client, id, {
        description: description.trim(),
        date,
        notes: notes.trim() || null,
        category_id: categoryId,
        needs_review: false,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.back();
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
      router.back();
    },
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

  if (transaction.isPending) return <Loading />;

  if (transaction.isError || !transaction.data) {
    return (
      <Screen>
        <ModalHeader title="Transaction" onClose={() => router.back()} />
        <ErrorNotice message="That transaction no longer exists." />
      </Screen>
    );
  }

  const record = transaction.data;
  const category = categoryId ? categoryById.get(categoryId) : null;
  const existingSplits = splits.data ?? [];

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
    <Screen>
      <ModalHeader
        title="Transaction"
        onClose={() => router.back()}
        action={{
          label: save.isPending ? 'Saving…' : 'Save',
          onPress: () => {
            setError(null);
            save.mutate();
          },
          disabled: save.isPending,
        }}
      />

      <ScrollView contentContainerClassName="p-4 pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        <View className="items-center py-6">
          <Text
            className={`text-4xl font-bold tabular-nums ${
              record.amount_cents > 0
                ? 'text-positive dark:text-emerald-400'
                : 'text-ink-900 dark:text-ink-50'
            }`}
          >
            {formatMoney(record.amount_cents, { currency: record.currency })}
          </Text>
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            {formatFullDate(record.date)}
            {record.is_pending ? ' · Pending' : ''}
          </Text>
        </View>

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          className="mb-5"
        />

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Category
        </Text>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          className="h-12 px-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 flex-row items-center gap-2 mb-5"
        >
          <Text className="text-lg">{category?.icon ?? '❓'}</Text>
          <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
            {category?.name ?? 'Uncategorized'}
          </Text>
          <Text className="text-ink-400">›</Text>
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
          <Text className="text-xs text-ink-400 dark:text-ink-500 mb-5">
            Bank description: {record.original_description}
          </Text>
        ) : null}

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
              right={<Text className="text-ink-400">›</Text>}
            />
          )}
        </Card>

        <Card className="overflow-hidden">
          <SettingRow
            label="Needs review"
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
            right={
              <Switch
                value={record.is_hidden}
                onValueChange={(value) => toggle.mutate({ is_hidden: value })}
                trackColor={{ true: colors.accent }}
              />
            }
          />
        </Card>

        <Button
          label="Delete transaction"
          variant="secondary"
          onPress={() => remove.mutate()}
          className="mt-8"
        />
      </ScrollView>

      <CategoryPicker
        visible={picking}
        onClose={() => setPicking(false)}
        selectedId={categoryId}
        onSelect={(chosen: CategoryRow) => setCategoryId(chosen.id)}
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
