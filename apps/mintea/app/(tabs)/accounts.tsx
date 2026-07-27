import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountsWithInstitutionsQuery,
  groupAccounts,
  summarizeNetWorth,
  syncPlaidItem,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  Loading,
  Money,
  Title,
} from '../../components/ui';
import { AccountRow } from '../../components/AccountRow';
import { LinkAccountButton } from '../../components/PlaidLink';

export default function Accounts() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const accounts = useQuery(accountsWithInstitutionsQuery(client));

  const refresh = async () => {
    setSyncing(true);
    setSyncError(null);

    try {
      await syncPlaidItem(client);
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

  const visible = accounts.data.filter((account) => !account.is_hidden);
  const summary = summarizeNetWorth(accounts.data);
  const groups = groupAccounts(visible);

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
      <View className="w-full max-w-3xl self-center">
        <View className="px-4 pt-6 pb-2 flex-row items-start justify-between">
          <View>
            <Title>Accounts</Title>
            <Body muted className="mt-0.5">
              Net worth
            </Body>
            <Money cents={summary.netCents} size="xl" className="mt-1" />
          </View>

          <Pressable
            onPress={refresh}
            disabled={syncing}
            accessibilityRole="button"
            accessibilityLabel="Refresh accounts"
            className="p-2 rounded-full active:bg-ink-100 dark:active:bg-ink-800"
          >
            <Ionicons
              name="refresh"
              size={22}
              color={syncing ? colors.textMuted : colors.accent}
            />
          </Pressable>
        </View>

        {syncError ? <ErrorNotice message={syncError} onRetry={refresh} /> : null}

        {accounts.data.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="No accounts yet"
            message="Connect a bank to import balances and transactions automatically, or add an account manually."
            action={
              <View className="gap-3 w-64">
                <LinkAccountButton />
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
                        onPress={() => router.push(`/account/${account.id}`)}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ))}

            <View className="px-4 mt-8 gap-3">
              <LinkAccountButton label="Connect another account" />
              <Pressable
                onPress={() => router.push('/account/new')}
                accessibilityRole="button"
                className="py-2"
              >
                <Text className="text-center text-sm font-semibold text-mint-600 dark:text-mint-400">
                  Add a manual account
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
