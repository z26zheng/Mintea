import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountDisplayBalance,
  accountsWithInstitutionsQuery,
  formatPlaidPhoneNumber,
  formatMoney,
  parseMoney,
  removePlaidItem,
  setManualBalance,
  setPropertyValue,
  softDeleteAccount,
  updateAccount,
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
import { RequireAuth } from '../../components/RequireAuth';
import { useDismiss } from '../../lib/useDismiss';
import { LinkAccountButton } from '../../components/PlaidLink';
import { PropertyCard } from '../../components/PropertyCard';

function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/accounts');
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const accounts = useQuery(accountsWithInstitutionsQuery(client));
  const account = accounts.data?.find((candidate) => candidate.id === id);

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [destructiveAction, setDestructiveAction] = useState<
    'account' | 'institution' | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const linkedAccounts =
    account?.plaid_item_id
      ? (accounts.data ?? []).filter(
          (candidate) => candidate.plaid_item_id === account.plaid_item_id,
        )
      : [];

  // Seed the inputs once the account arrives, without clobbering edits in
  // progress when the query refetches in the background.
  useEffect(() => {
    if (!account) return;
    setName((current) => (current === '' ? account.name : current));
    setBalance((current) =>
      current === ''
        ? String(Math.abs(account.current_balance_cents) / 100)
        : current,
    );
  }, [account]);

  const save = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error('Account not found');
      if (!name.trim()) throw new Error('Account name is required');

      if (name.trim() !== account.name) {
        await updateAccount(client, account.id, { name: name.trim() });
      }

      if (account.is_manual) {
        const cents = parseMoney(balance);
        if (cents === null) throw new Error('Enter a valid balance');

        if (Math.abs(cents) !== Math.abs(account.current_balance_cents)) {
          // A property routes through setPropertyValue, which also flips its
          // valuation source back to manual — otherwise the next automatic
          // refresh would silently overwrite the figure the user just typed.
          if (account.type === 'real_estate') {
            await setPropertyValue(client, {
              householdId: account.household_id,
              accountId: account.id,
              valueCents: cents,
            });
          } else {
            await setManualBalance(client, account, cents);
          }
        }
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
    mutationFn: (patch: { is_hidden?: boolean; include_in_net_worth?: boolean }) =>
      updateAccount(client, id, patch),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const removeAccount = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error('Account not found');

      // A Plaid Item is no longer useful when its final active account is
      // removed. Disconnect that last Item so it cannot keep syncing or incur
      // Plaid usage, then retain the local account as a removal tombstone.
      if (account.plaid_item_id && linkedAccounts.length === 1) {
        await removePlaidItem(client, account.plaid_item_id);
      }

      await softDeleteAccount(client, account.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      dismiss();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not remove'),
  });

  const disconnectInstitution = useMutation({
    mutationFn: async () => {
      if (!account?.plaid_item_id) throw new Error('Connection not found');
      await removePlaidItem(client, account.plaid_item_id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      dismiss();
    },
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not disconnect',
      ),
  });

  if (accounts.isPending) return <Loading />;

  if (!account) {
    return (
      <Screen>
        <ModalHeader title="Account" onClose={() => dismiss()} />
        <ErrorNotice message="That account no longer exists." />
      </Screen>
    );
  }

  const { cents, isOwed } = accountDisplayBalance(account);
  const broken =
    account.institution?.status === 'login_required' ||
    account.institution?.status === 'error' ||
    account.institution?.status === 'revoked';

  return (
    <Screen>
      <ModalHeader
        title="Edit account"
        onClose={() => dismiss()}
        action={{
          label: save.isPending ? 'Saving…' : 'Save',
          onPress: () => {
            setError(null);
            save.mutate();
          },
          disabled: save.isPending || name.trim().length === 0,
        }}
      />

      <ScrollView contentContainerClassName="p-4 pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        <View className="items-center py-6">
          <Text className="text-4xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
            {formatMoney(cents, { currency: account.currency })}
          </Text>
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            {isOwed ? 'Currently owed' : 'Current balance'}
            {account.institution?.name ? ` · ${account.institution.name}` : ''}
          </Text>
        </View>

        {broken ? (
          <Card className="p-4 mb-4 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
            <Text className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              This connection needs attention
            </Text>
            <Text className="text-sm text-amber-700 dark:text-amber-300 mt-1 mb-3">
              {account.institution?.errorMessage ??
                'Your bank needs you to sign in again before we can sync.'}
            </Text>
            {account.plaid_item_id ? (
              <LinkAccountButton
                label="Reconnect"
                itemId={account.plaid_item_id}
                variant="secondary"
                onLinked={() => queryClient.invalidateQueries()}
              />
            ) : null}
          </Card>
        ) : null}

        {account.type === 'real_estate' ? (
          <PropertyCard account={account} />
        ) : null}

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          className="mb-5"
        />

        {account.is_manual ? (
          <Field
            label={
              account.type === 'real_estate'
                ? 'Override the value'
                : account.is_asset
                  ? 'Current value'
                  : 'Amount owed'
            }
            value={balance}
            onChangeText={setBalance}
            keyboardType="decimal-pad"
            inputMode="decimal"
            className="mb-5"
            error={
              balance.length > 0 && parseMoney(balance) === null
                ? 'Enter a number'
                : undefined
            }
          />
        ) : null}

        <Card className="overflow-hidden">
          {account.institution ? (
            <>
              <SettingRow
                label="Plaid phone number"
                description="Shared by every account from this Plaid connection."
                right={
                  <Text
                    numberOfLines={1}
                    className="max-w-[45%] text-right text-sm text-ink-500 dark:text-ink-400"
                  >
                    {account.institution.phoneNumber
                      ? formatPlaidPhoneNumber(
                          account.institution.phoneNumber,
                        )
                      : 'Not recorded'}
                  </Text>
                }
              />
              <Divider />
            </>
          ) : null}
          <SettingRow
            label="Hide from lists"
            description="Keeps the account out of the accounts and transactions views."
            right={
              <Switch
                value={account.is_hidden}
                onValueChange={(value) => toggle.mutate({ is_hidden: value })}
                trackColor={{ true: colors.accent }}
              />
            }
          />
          <Divider />
          <SettingRow
            label="Include in net worth"
            description="Turn off for accounts you track but don't own, like a shared card."
            right={
              <Switch
                value={account.include_in_net_worth}
                onValueChange={(value) =>
                  toggle.mutate({ include_in_net_worth: value })
                }
                trackColor={{ true: colors.accent }}
              />
            }
          />
        </Card>

        <View className="mt-8">
          {destructiveAction ? (
            <Card className="p-4 border-red-300 dark:border-red-900">
              <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                {destructiveAction === 'institution'
                  ? 'Disconnect this institution?'
                  : 'Remove this account?'}
              </Text>
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
                {destructiveAction === 'institution'
                  ? 'Every account from this institution stops syncing. Your existing transactions and history are kept.'
                  : account.plaid_item_id && linkedAccounts.length === 1
                    ? 'This account and its transactions will disappear from Mintea lists and reports. Because it is the last account on this connection, the Plaid connection will also be disconnected.'
                    : account.plaid_item_id
                      ? `This account and its transactions will disappear from Mintea lists and reports. The other ${linkedAccounts.length - 1} ${
                          linkedAccounts.length - 1 === 1
                            ? 'account'
                            : 'accounts'
                        } on this Plaid connection will keep syncing.`
                      : 'This account and its transactions will disappear from Mintea lists and reports.'}
              </Text>
              <View className="flex-row gap-3">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setDestructiveAction(null)}
                  className="flex-1"
                />
                <Button
                  label={
                    removeAccount.isPending || disconnectInstitution.isPending
                      ? destructiveAction === 'institution'
                        ? 'Disconnecting…'
                        : 'Removing…'
                      : destructiveAction === 'institution'
                        ? 'Disconnect'
                        : 'Remove'
                  }
                  variant="danger"
                  disabled={
                    removeAccount.isPending || disconnectInstitution.isPending
                  }
                  onPress={() => {
                    setError(null);
                    if (destructiveAction === 'institution') {
                      disconnectInstitution.mutate();
                    } else {
                      removeAccount.mutate();
                    }
                  }}
                  className="flex-1"
                />
              </View>
            </Card>
          ) : (
            <View className="gap-3">
              <Button
                label="Remove account"
                variant="secondary"
                onPress={() => setDestructiveAction('account')}
              />
              {account.plaid_item_id ? (
                <Button
                  label="Disconnect institution"
                  variant="ghost"
                  onPress={() => setDestructiveAction('institution')}
                />
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function AccountDetailRoute() {
  return (
    <RequireAuth>
      <AccountDetail />
    </RequireAuth>
  );
}
