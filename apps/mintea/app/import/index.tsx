import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountsQuery,
  buildImportRows,
  detectColumns,
  fetchImportMatchCandidates,
  formatMoney,
  importTransactions,
  parseCsv,
  planImport,
  profileQuery,
  rowDateRange,
  type DateOrder,
  type ImportPlan,
  type ParseResult,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useDismiss } from '../../lib/useDismiss';
import {
  Button,
  Card,
  Divider,
  ErrorNotice,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';

const DATE_ORDERS: Array<{ value: DateOrder; label: string }> = [
  { value: 'mdy', label: 'Month / Day' },
  { value: 'dmy', label: 'Day / Month' },
  { value: 'iso', label: 'Year-Month-Day' },
];

function Import() {
  const client = useClient();
  const queryClient = useQueryClient();
  const dismiss = useDismiss('/(tabs)/settings');

  const profile = useQuery(profileQuery(client));
  const accounts = useQuery(accountsQuery(client));

  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = useMemo<ParseResult | null>(() => {
    if (!grid || grid.length === 0) return null;
    return buildImportRows(grid, detectColumns(grid[0]!), {
      ...(dateOrder ? { dateOrder } : {}),
    });
  }, [grid, dateOrder]);

  // Manual accounts first: importing into a Plaid-fed account is legitimate
  // but far more likely to double up, so it should not be the easy default.
  const importable = useMemo(
    () =>
      [...(accounts.data ?? [])].sort(
        (a, b) => Number(b.is_manual) - Number(a.is_manual),
      ),
    [accounts.data],
  );

  const pickFile = () => {
    setError(null);
    setDone(null);
    setPlan(null);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setFileName(file.name);
        setGrid(parseCsv(text));
        setDateOrder(null);
      } catch {
        setError('Could not read that file');
      }
    };
    input.click();
  };

  const check = useMutation({
    mutationFn: async () => {
      if (!parsed || !accountId) throw new Error('Choose a file and an account');
      const range = rowDateRange(parsed.rows);
      if (!range) throw new Error('Nothing in this file could be read');

      const existing = await fetchImportMatchCandidates(client, accountId, range);
      return planImport(parsed.rows, existing);
    },
    onSuccess: setPlan,
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not check the file'),
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!plan || !accountId || !profile.data) throw new Error('Nothing to import');
      return importTransactions(client, {
        householdId: profile.data.household_id,
        accountId,
        currency: profile.data.currency,
        rows: plan.toImport,
      });
    },
    onSuccess: async (count: number) => {
      setDone(`Imported ${count} transaction${count === 1 ? '' : 's'}.`);
      setPlan(null);
      setGrid(null);
      setFileName(null);
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not import'),
  });

  if (Platform.OS !== 'web') {
    return (
      <Screen>
        <ModalHeader title="Import" onClose={dismiss} />
        <Card className="m-4 p-4">
          <Text className="text-sm text-ink-600 dark:text-ink-300">
            Importing is only available in the web app right now.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="Import" onClose={dismiss} />

      <ScrollView contentContainerClassName="pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        {done ? (
          <Card className="m-4 border-mint-300 p-4 dark:border-mint-800">
            <Text className="text-sm text-ink-700 dark:text-ink-200">{done}</Text>
            <Text className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Imported transactions are marked for review so you can categorise
              them alongside anything else that needs attention.
            </Text>
          </Card>
        ) : null}

        <Text className="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          1 · Choose a file
        </Text>
        <View className="px-4">
          <Button
            label={fileName ? `Replace “${fileName}”` : 'Choose a CSV file'}
            variant="secondary"
            onPress={pickFile}
          />
        </View>

        {parsed ? (
          <>
            <Text className="px-5 pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              2 · Import into
            </Text>
            <Card className="mx-4 overflow-hidden">
              {importable.map((account, index) => (
                <View key={account.id}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => {
                      setAccountId(account.id);
                      setPlan(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: accountId === account.id }}
                    className="flex-row items-center gap-3 px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
                  >
                    <View className="min-w-0 flex-1">
                      <Text
                        numberOfLines={1}
                        className={`text-base ${
                          accountId === account.id
                            ? 'font-semibold text-mint-600 dark:text-mint-400'
                            : 'text-ink-900 dark:text-ink-50'
                        }`}
                      >
                        {account.name}
                      </Text>
                      <Text className="text-sm text-ink-500 dark:text-ink-400">
                        {account.is_manual
                          ? 'Manual account'
                          : 'Connected to your bank — check for duplicates carefully'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </Card>

            {parsed.dateOrderAssumed ? (
              <View className="mx-4 mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                <Text className="text-sm text-amber-800 dark:text-amber-300">
                  Every date in this file reads both ways — 03/04 could be March
                  4th or April 3rd. Confirm which order your bank uses.
                </Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {DATE_ORDERS.map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        setDateOrder(option.value);
                        setPlan(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: (dateOrder ?? parsed.dateOrder) === option.value,
                      }}
                      className={`rounded-full border px-3 py-1.5 ${
                        (dateOrder ?? parsed.dateOrder) === option.value
                          ? 'border-mint-600 bg-mint-600'
                          : 'border-ink-300 dark:border-ink-700'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          (dateOrder ?? parsed.dateOrder) === option.value
                            ? 'text-white'
                            : 'text-ink-600 dark:text-ink-300'
                        }`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Text className="px-5 pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              3 · Check
            </Text>
            <Card className="mx-4 p-4">
              <Text className="text-sm text-ink-700 dark:text-ink-200">
                {parsed.rows.length} row
                {parsed.rows.length === 1 ? '' : 's'} readable
                {parsed.problems.length > 0
                  ? `, ${parsed.problems.length} skipped`
                  : ''}
                .
              </Text>

              {parsed.problems.slice(0, 5).map((problem) => (
                <Text
                  key={problem.line}
                  className="mt-1 text-xs text-ink-500 dark:text-ink-400"
                >
                  Line {problem.line}: {problem.reason}
                </Text>
              ))}

              <Button
                label={check.isPending ? 'Checking…' : 'Check for duplicates'}
                onPress={() => check.mutate()}
                disabled={!accountId || parsed.rows.length === 0 || check.isPending}
                className="mt-4"
              />
            </Card>

            {plan ? (
              <>
                <Text className="px-5 pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  4 · Import
                </Text>
                <Card className="mx-4 p-4">
                  <Text className="text-base text-ink-900 dark:text-ink-50">
                    {plan.toImport.length} new,{' '}
                    {plan.duplicates.length} already in this account.
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                    A row counts as already present when the same amount is
                    already recorded on the same day in this account, whatever
                    it is called there.
                  </Text>

                  {plan.duplicates.slice(0, 4).map((row) => (
                    <Text
                      key={`${row.line}`}
                      numberOfLines={1}
                      className="mt-1 text-xs text-ink-400 dark:text-ink-500"
                    >
                      Skipping {row.date} · {row.description} ·{' '}
                      {formatMoney(row.amountCents)}
                    </Text>
                  ))}

                  <Button
                    label={
                      commit.isPending
                        ? 'Importing…'
                        : `Import ${plan.toImport.length} transaction${
                            plan.toImport.length === 1 ? '' : 's'
                          }`
                    }
                    onPress={() => commit.mutate()}
                    disabled={plan.toImport.length === 0 || commit.isPending}
                    className="mt-4"
                  />
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

export default function ImportRoute() {
  return (
    <RequireAuth>
      <Import />
    </RequireAuth>
  );
}
