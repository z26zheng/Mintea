import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountsWithInstitutionsQuery,
  filterAccountsForList,
  findDuplicateAccountCandidates,
  groupAccounts,
  propertiesQuery,
  propertyAddress,
  summarizeNetWorth,
  syncPlaidItem,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  Loading,
  Money,
  PageHeader,
  Reveal,
} from '../../components/ui';
import { AccountRow } from '../../components/AccountRow';
import { ConnectionsBanner } from '../../components/ConnectionHealth';
import { PlaidConnectOptions } from '../../components/PlaidConnectOptions';
import { DuplicateAccountsBanner } from '../../components/DataTrust';

export default function Accounts() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [hideZeroBalances, setHideZeroBalances] = useState(false);

  const accounts = useQuery(accountsWithInstitutionsQuery(client));

  // A property's address is far more identifying than "Manual", which is all
  // the generic subtitle can say about it.
  const properties = useQuery(propertiesQuery(client));
  const addressByAccount = new Map(
    (properties.data ?? []).map((property) => [
      property.account_id,
      propertyAddress(property),
    ]),
  );

  const refresh = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncNotice(null);

    try {
      const result = await syncPlaidItem(client);

      if (result.balanceRefreshesSkipped > 0) {
        const cooldownMinutes = Math.ceil(
          result.balanceRefreshCooldownSeconds / 60,
        );
        const cooldownAgeLabel =
          cooldownMinutes === 60
            ? 'one hour'
            : `${cooldownMinutes} minutes`;
        const cooldownPolicyLabel =
          cooldownMinutes === 60
            ? 'one-hour'
            : `${cooldownMinutes}-minute`;

        setSyncNotice(
          result.balanceRefreshes > 0
            ? `Real-time balances refreshed for ${result.balanceRefreshes} ${
                result.balanceRefreshes === 1 ? 'connection' : 'connections'
              }. ${result.balanceRefreshesSkipped} recently refreshed ${
                result.balanceRefreshesSkipped === 1
                  ? 'connection remains'
                  : 'connections remain'
              } within the ${cooldownPolicyLabel} cooldown.`
            : `Transactions synced. Real-time balances were refreshed within the last ${cooldownAgeLabel}, so Mintea did not request them again.`,
        );
      }

      await queryClient.invalidateQueries();
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Could not refresh accounts',
      );
    } finally {
      setSyncing(false);
    }
  };

  if (accounts.isPending) return <Loading label="Loading accounts…" />;

  if (accounts.isError) {
    return (
      <ErrorNotice
        message={accounts.error.message}
        onRetry={() => accounts.refetch()}
      />
    );
  }

  const listedAccounts = filterAccountsForList(accounts.data);
  const zeroBalanceCount = listedAccounts.filter(
    (account) => account.current_balance_cents === 0,
  ).length;
  const visible = filterAccountsForList(accounts.data, hideZeroBalances);
  const summary = summarizeNetWorth(accounts.data);
  const groups = groupAccounts(visible);
  const duplicateCandidates = findDuplicateAccountCandidates(accounts.data);

  return (
    <ScrollView
      className="flex-1 bg-ink-50 dark:bg-ink-950"
      contentContainerClassName="pb-16"
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={refresh}
          tintColor={colors.accent}
        />
      }
    >
      <View className="w-full max-w-5xl self-center">
        <PageHeader
          eyebrow="Portfolio"
          title="Accounts"
          subtitle="Everything contributing to your household balance sheet."
          action={
            <Pressable
              onPress={refresh}
              disabled={syncing}
              accessibilityRole="button"
              accessibilityLabel="Refresh accounts"
              className="h-11 w-11 items-center justify-center rounded-2xl border border-ink-200 bg-white shadow-sm hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-800 dark:bg-ink-900 dark:hover:bg-ink-800"
            >
              <Ionicons
                name="refresh"
                size={21}
                color={syncing ? colors.textMuted : colors.accent}
              />
            </Pressable>
          }
        />

        <Reveal>
          <Card className="mx-4 overflow-hidden">
            <View className="h-1 bg-mint-500" />
            <View className="p-5">
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Net worth
              </Text>
              <Money cents={summary.netCents} size="xl" className="mt-1" />
              <Text className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                Assets minus liabilities across included accounts
              </Text>
            </View>
          </Card>
        </Reveal>

        {zeroBalanceCount > 0 ? (
          <View className="px-4 mt-2">
            <Pressable
              onPress={() => setHideZeroBalances((hidden) => !hidden)}
              accessibilityRole="button"
              accessibilityState={{ selected: hideZeroBalances }}
              className="self-start flex-row items-center gap-2 rounded-full border border-ink-200 px-3 py-2 hover:border-mint-300 hover:bg-mint-50 active:bg-mint-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-800 dark:hover:border-mint-800 dark:hover:bg-mint-950 dark:active:bg-mint-900"
            >
              <Ionicons
                name={hideZeroBalances ? 'eye-outline' : 'eye-off-outline'}
                size={16}
                color={colors.accent}
              />
              <Text className="text-sm font-semibold text-mint-700 dark:text-mint-300">
                {hideZeroBalances ? 'Show' : 'Hide'} {zeroBalanceCount}{' '}
                zero-balance {zeroBalanceCount === 1 ? 'account' : 'accounts'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <ConnectionsBanner />
        {syncError ? <ErrorNotice message={syncError} onRetry={refresh} /> : null}
        {syncNotice ? (
          <Card className="mx-4 mt-3 px-4 py-3">
            <Text
              accessibilityLiveRegion="polite"
              className="text-sm text-ink-600 dark:text-ink-300"
            >
              {syncNotice}
            </Text>
          </Card>
        ) : null}

        {duplicateCandidates.length > 0 ? (
          <DuplicateAccountsBanner
            count={duplicateCandidates.length}
            onPress={() => router.push('/account/duplicates')}
          />
        ) : null}

        {accounts.data.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="No accounts yet"
            message="Connect a bank to import balances and transactions automatically, or add an account manually."
            action={
              <View className="gap-3 w-64">
                <PlaidConnectOptions />
                <Pressable
                  onPress={() => router.push('/account/new')}
                  accessibilityRole="button"
                  className="py-2"
                >
                  <Text className="text-center text-sm font-semibold text-mint-600 dark:text-mint-400">
                    Add manually
                  </Text>
                </Pressable>
              </View>
            }
          />
        ) : (
          <>
            {groups.length === 0 && hideZeroBalances ? (
              <Card className="mx-4 mt-6 p-4">
                <Text className="text-sm text-ink-500 dark:text-ink-400">
                  Every visible account has a zero balance. Use “Show{' '}
                  {zeroBalanceCount} zero-balance{' '}
                  {zeroBalanceCount === 1 ? 'account' : 'accounts'}” to see
                  them again.
                </Text>
              </Card>
            ) : null}

            {groups.map((group) => (
              <View key={group.key} className="px-4 mt-6">
                <View className="flex-row items-baseline justify-between mb-2 px-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    {group.label}
                  </Text>
                  <Money
                    cents={group.totalCents}
                    size="sm"
                    className="text-ink-500 dark:text-ink-400"
                  />
                </View>

                <Card className="overflow-hidden">
                  {group.accounts.map((account, index) => (
                    <View key={account.id}>
                      {index > 0 ? <Divider /> : null}
                      <AccountRow
                        account={account}
                        subtitle={addressByAccount.get(account.id)}
                        onPress={() => router.push(`/account/${account.id}`)}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ))}

            <View className="px-4 mt-8 gap-3">
              <PlaidConnectOptions primaryLabel="Connect another account" />

              <View className="flex-row justify-center gap-6">
                <Pressable
                  onPress={() => router.push('/account/new-property')}
                  accessibilityRole="button"
                  className="py-2"
                >
                  <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                    Add a property
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/account/new')}
                  accessibilityRole="button"
                  className="py-2"
                >
                  <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                    Add a manual account
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
