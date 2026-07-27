import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountsQuery,
  createManualTransaction,
  isValidIsoDate,
  parseMoney,
  profileQuery,
  todayIso,
  type CategoryRow,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import {
  ErrorNotice,
  Field,
  ModalHeader,
  Screen,
  SegmentedControl,
} from '../../components/ui';
import { CategoryPicker } from '../../components/CategoryPicker';

export default function NewTransaction() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const profile = useQuery(profileQuery(client));
  const accounts = useQuery(accountsQuery(client));

  const [accountId, setAccountId] = useState<string | null>(null);
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<CategoryRow | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount =
    accountId ?? accounts.data?.find((account) => !account.is_hidden)?.id ?? null;

  const magnitude = parseMoney(amount);
  const canSave =
    magnitude !== null &&
    magnitude !== 0 &&
    description.trim().length > 0 &&
    selectedAccount !== null &&
    isValidIsoDate(date);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      if (magnitude === null) throw new Error('Enter a valid amount');
      if (!selectedAccount) throw new Error('Pick an account');

      // Sign is set by the direction toggle, so the user never types a minus.
      const signed =
        direction === 'expense'
          ? -Math.abs(magnitude)
          : Math.abs(magnitude);

      return createManualTransaction(client, {
        householdId: profile.data.household_id,
        accountId: selectedAccount,
        date,
        amountCents: signed,
        description: description.trim(),
        categoryId: category?.id ?? null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.back();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
  });

  return (
    <Screen>
      <ModalHeader
        title="New transaction"
        onClose={() => router.back()}
        action={{
          label: create.isPending ? 'Saving…' : 'Save',
          onPress: () => {
            setError(null);
            create.mutate();
          },
          disabled: !canSave || create.isPending,
        }}
      />

      <ScrollView contentContainerClassName="p-4 pb-16">
        {error ? <ErrorNotice message={error} /> : null}

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
          placeholder="0.00"
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
          className="mb-5"
          error={
            amount.length > 0 && magnitude === null ? 'Enter a number' : undefined
          }
        />

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Coffee"
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

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Account
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {accounts.data
            ?.filter((account) => !account.is_hidden)
            .map((account) => {
              const active = selectedAccount === account.id;

              return (
                <Pressable
                  key={account.id}
                  onPress={() => setAccountId(account.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`px-3 py-2 rounded-xl border ${
                    active
                      ? 'bg-mint-600 border-mint-600'
                      : 'bg-white dark:bg-ink-900 border-ink-300 dark:border-ink-700'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      active ? 'text-white' : 'text-ink-600 dark:text-ink-300'
                    }`}
                  >
                    {account.name}
                  </Text>
                </Pressable>
              );
            })}
        </View>

        {accounts.data?.length === 0 ? (
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-2">
            Add an account first — transactions have to live somewhere.
          </Text>
        ) : null}
      </ScrollView>

      <CategoryPicker
        visible={picking}
        onClose={() => setPicking(false)}
        selectedId={category?.id}
        onSelect={setCategory}
      />
    </Screen>
  );
}
