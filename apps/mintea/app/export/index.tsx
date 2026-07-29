import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  accountExportColumns,
  fetchAccountsForExport,
  fetchTransactionsForExport,
  profileQuery,
  safeFileName,
  toCsv,
  transactionExportColumns,
  EXPORT_ROW_LIMIT,
  type DateRange,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useDismiss } from '../../lib/useDismiss';
import { useTheme } from '../../lib/theme';
import { canSaveFiles, saveTextFile } from '../../lib/saveFile';
import {
  Button,
  Card,
  Divider,
  ErrorNotice,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';

type DataSet = 'transactions' | 'accounts';
type Period = 'all' | '1Y' | 'YTD' | '90D';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: '1Y', label: 'Last 12 months' },
  { value: 'YTD', label: 'This year' },
  { value: '90D', label: 'Last 90 days' },
];

/** Uses the household calendar, so a range means the same thing as elsewhere. */
function rangeFor(period: Period, todayIso: string): DateRange | undefined {
  if (period === 'all') return undefined;

  const today = new Date(`${todayIso}T00:00:00Z`);
  const start = new Date(today);

  if (period === '1Y') start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (period === '90D') start.setUTCDate(start.getUTCDate() - 90);
  if (period === 'YTD') {
    start.setUTCMonth(0);
    start.setUTCDate(1);
  }

  return { start: start.toISOString().slice(0, 10), end: todayIso };
}

function Row({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
    >
      <View className="min-w-0 flex-1">
        <Text
          className={`text-base ${
            selected
              ? 'font-semibold text-mint-600 dark:text-mint-400'
              : 'text-ink-900 dark:text-ink-50'
          }`}
        >
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            {description}
          </Text>
        ) : null}
      </View>

      {selected ? <Ionicons name="checkmark" size={18} color="#1FA678" /> : null}
    </Pressable>
  );
}

function Export() {
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/settings');
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));

  const [dataSet, setDataSet] = useState<DataSet>('transactions');
  const [period, setPeriod] = useState<Period>('all');
  const [loaded, setLoaded] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todayIso = new Date().toLocaleDateString('en-CA', {
    timeZone: profile.data?.timezone || 'UTC',
  });

  const run = useMutation({
    mutationFn: async () => {
      setError(null);
      setNotice(null);
      setLoaded(0);

      if (dataSet === 'accounts') {
        const accounts = await fetchAccountsForExport(client);
        const csv = toCsv(accounts, accountExportColumns());
        await saveTextFile(safeFileName(`mintea-accounts-${todayIso}`, 'csv'), csv);
        return accounts.length;
      }

      const range = rangeFor(period, todayIso);
      const transactions = await fetchTransactionsForExport(client, {
        filters: range ? { startDate: range.start, endDate: range.end } : {},
        onProgress: ({ loaded: count }) => setLoaded(count),
      });

      const csv = toCsv(transactions, transactionExportColumns());
      await saveTextFile(
        safeFileName(`mintea-transactions-${todayIso}`, 'csv'),
        csv,
      );
      return transactions.length;
    },
    onSuccess: (count: number) => {
      setNotice(
        count === 0
          ? 'Nothing matched, so the file has only its header row.'
          : count >= EXPORT_ROW_LIMIT
            ? `Exported the first ${EXPORT_ROW_LIMIT.toLocaleString()} rows, which is the per-file limit. Narrow the date range to get the rest.`
            : `Exported ${count.toLocaleString()} ${
                dataSet === 'accounts' ? 'accounts' : 'transactions'
              }.`,
      );
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not export'),
  });

  return (
    <Screen>
      <ModalHeader title="Export" onClose={dismiss} />

      <ScrollView contentContainerClassName="pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        {!canSaveFiles ? (
          <Card className="m-4 p-4">
            <Text className="text-sm text-ink-600 dark:text-ink-300">
              Exporting is only available in the web app right now.
            </Text>
          </Card>
        ) : null}

        <Text className="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          What to export
        </Text>
        <Card className="mx-4 overflow-hidden">
          <Row
            label="Transactions"
            description="One row each, with category, account, tags and notes"
            selected={dataSet === 'transactions'}
            onPress={() => setDataSet('transactions')}
          />
          <Divider />
          <Row
            label="Accounts"
            description="Balances and institutions, including hidden accounts"
            selected={dataSet === 'accounts'}
            onPress={() => setDataSet('accounts')}
          />
        </Card>

        {dataSet === 'transactions' ? (
          <>
            <Text className="px-5 pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Date range
            </Text>
            <Card className="mx-4 overflow-hidden">
              {PERIODS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    label={option.label}
                    selected={period === option.value}
                    onPress={() => setPeriod(option.value)}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <View className="px-4 pt-8">
          <Button
            label={
              run.isPending
                ? loaded > 0
                  ? `Preparing ${loaded.toLocaleString()} rows…`
                  : 'Preparing…'
                : 'Download CSV'
            }
            onPress={() => run.mutate()}
            disabled={run.isPending || !canSaveFiles}
          />

          {notice ? (
            <Text className="mt-3 text-sm text-ink-600 dark:text-ink-300">
              {notice}
            </Text>
          ) : null}

          <Text className="mt-3 text-xs leading-4 text-ink-400 dark:text-ink-500">
            Amounts are signed, so money out is negative and the column sums to
            your net. Dates use your household time zone
            {profile.data?.timezone ? ` (${profile.data.timezone})` : ''}.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function ExportRoute() {
  return (
    <RequireAuth>
      <Export />
    </RequireAuth>
  );
}
