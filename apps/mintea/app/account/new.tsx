import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createManualAccount,
  isAssetType,
  parseMoney,
  profileQuery,
  type AccountType,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import {
  ErrorNotice,
  Field,
  ModalHeader,
  SegmentedControl,
  Screen,
} from '../../components/ui';

const TYPES: Array<{ value: AccountType; label: string; hint: string }> = [
  { value: 'depository', label: 'Cash', hint: 'Checking, savings, cash on hand' },
  { value: 'investment', label: 'Investment', hint: 'Brokerage, retirement, crypto' },
  { value: 'other', label: 'Asset', hint: 'Property, vehicle, valuables' },
  { value: 'credit', label: 'Credit', hint: 'Credit card balance you owe' },
  { value: 'loan', label: 'Loan', hint: 'Mortgage, student loan, car loan' },
];

/**
 * Manual accounts cover everything Plaid can't see — a house, a car, a private
 * investment. They still contribute to net worth and get balance snapshots, so
 * the chart treats them exactly like linked accounts.
 */
export default function NewAccount() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const profile = useQuery(profileQuery(client));

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('depository');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  const balanceCents = parseMoney(balance);
  const isAsset = isAssetType(type);
  const canSave = name.trim().length > 0 && balanceCents !== null;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      if (balanceCents === null) throw new Error('Enter a valid balance');

      return createManualAccount(client, {
        householdId: profile.data.household_id,
        name: name.trim(),
        type,
        balanceCents,
        isAsset,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.back();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
  });

  const selected = TYPES.find((option) => option.value === type);

  return (
    <Screen>
      <ModalHeader
        title="Add account"
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

        <Field
          label="Account name"
          value={name}
          onChangeText={setName}
          placeholder="Emergency fund"
          autoFocus
          className="mb-5"
        />

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Type
        </Text>
        <SegmentedControl
          options={TYPES.slice(0, 3).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={type}
          onChange={setType}
        />
        <SegmentedControl
          options={TYPES.slice(3).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={type}
          onChange={setType}
          className="mt-2"
        />

        {selected ? (
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-2">
            {selected.hint}
          </Text>
        ) : null}

        <Field
          label={isAsset ? 'Current balance' : 'Amount owed'}
          value={balance}
          onChangeText={setBalance}
          placeholder="0.00"
          keyboardType="decimal-pad"
          inputMode="decimal"
          className="mt-6"
          error={
            balance.length > 0 && balanceCents === null
              ? 'Enter a number, like 1250.00'
              : undefined
          }
        />

        <Text className="text-xs text-ink-400 dark:text-ink-500 mt-3 leading-5">
          {isAsset
            ? 'Enter what the account is worth. It will count towards your net worth.'
            : 'Enter the balance as a positive number. It will be subtracted from your net worth.'}
        </Text>
      </ScrollView>
    </Screen>
  );
}
