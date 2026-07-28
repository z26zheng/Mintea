import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  formatPlaidPhoneNumber,
  formatFullDate,
  getDeviceTimeZone,
  normalizePlaidPhoneNumber,
  plaidItemsQuery,
  profileQuery,
  removePlaidItem,
  setReportingTimezone,
  updatePlaidItemPhone,
} from '@mintea/core';

import { useAuth, useClient } from '../../lib/auth';
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorNotice,
  Field,
  SettingRow,
  Title,
} from '../../components/ui';
import { LinkAccountButton } from '../../components/PlaidLink';
import { PlaidConnectOptions } from '../../components/PlaidConnectOptions';

const STATUS_LABEL: Record<string, string> = {
  good: 'Connected',
  login_required: 'Needs sign-in',
  pending_expiration: 'Expiring soon',
  error: 'Error',
  revoked: 'Revoked',
};

export default function Settings() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, signOut } = useAuth();

  const profile = useQuery(profileQuery(client));
  const items = useQuery(plaidItemsQuery(client));
  const deviceTimeZone = getDeviceTimeZone();

  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editingPhoneItemId, setEditingPhoneItemId] = useState<string | null>(
    null,
  );
  const [plaidPhoneInput, setPlaidPhoneInput] = useState('');
  const normalizedPlaidPhone = normalizePlaidPhoneNumber(plaidPhoneInput);
  const plaidPhoneError =
    plaidPhoneInput.trim() && !normalizedPlaidPhone
      ? 'Enter a valid phone number. Include + and the country code outside the US or Canada.'
      : undefined;

  const timezoneMutation = useMutation({
    mutationFn: () => setReportingTimezone(client, deviceTimeZone),
    onMutate: () => setError(null),
    onSuccess: async () => {
      // The reporting date is part of every chart range, so refresh all cached
      // data after changing the household calendar.
      await queryClient.invalidateQueries();
    },
    onError: (caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not update reporting time zone',
      );
    },
  });

  const phoneMutation = useMutation({
    mutationFn: ({
      itemId,
      phoneNumber,
    }: {
      itemId: string;
      phoneNumber: string;
    }) => updatePlaidItemPhone(client, itemId, phoneNumber),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setEditingPhoneItemId(null);
      setPlaidPhoneInput('');
      await queryClient.invalidateQueries();
    },
    onError: (caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not save the Plaid phone number',
      );
    },
  });

  const disconnect = async (itemId: string) => {
    setError(null);
    setRemovingId(itemId);

    try {
      await removePlaidItem(client, itemId);
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not disconnect',
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-ink-50 dark:bg-ink-950"
      contentContainerClassName="pb-16"
    >
      <View className="w-full max-w-3xl self-center">
        <View className="px-4 pt-6 pb-2">
          <Title>Settings</Title>
        </View>

        {error ? <ErrorNotice message={error} /> : null}

        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-5 pt-6 pb-2">
          Account
        </Text>
        <Card className="mx-4 overflow-hidden">
          <SettingRow
            label={profile.data?.display_name ?? 'Your profile'}
            description={session?.user.email ?? undefined}
          />
          <Divider />
          <SettingRow
            label="Currency"
            right={
              <Text className="text-base text-ink-500 dark:text-ink-400">
                {profile.data?.currency ?? 'USD'}
              </Text>
            }
          />
          <Divider />
          <SettingRow
            label="Reporting time zone"
            description={
              profile.data?.timezone === deviceTimeZone
                ? 'Sets the calendar day for balances and charts.'
                : `Tap to use this device's time zone: ${deviceTimeZone}`
            }
            onPress={
              profile.data?.timezone !== deviceTimeZone &&
              !timezoneMutation.isPending
                ? () => timezoneMutation.mutate()
                : undefined
            }
            right={
              <Text
                numberOfLines={1}
                className="max-w-[42%] text-right text-sm text-ink-500 dark:text-ink-400"
              >
                {timezoneMutation.isPending
                  ? 'Updating…'
                  : (profile.data?.timezone ?? 'UTC')}
              </Text>
            }
          />
        </Card>

        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-5 pt-8 pb-2">
          Organize
        </Text>
        <Card className="mx-4 overflow-hidden">
          <SettingRow
            label="Categories"
            description="Rename, add, and reorganize how spending is grouped."
            onPress={() => router.push('/categories')}
            right={<Text className="text-ink-400">›</Text>}
          />
        </Card>

        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-5 pt-8 pb-2">
          Connections
        </Text>
        <Card className="mx-4 overflow-hidden">
          {items.data?.length ? (
            items.data.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <View className="px-4 py-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-medium text-ink-900 dark:text-ink-50 flex-1">
                      {item.institution_name ?? 'Institution'}
                    </Text>
                    <Badge
                      label={STATUS_LABEL[item.status] ?? item.status}
                      tone={item.status === 'good' ? 'accent' : 'warning'}
                    />
                  </View>

                  <Text className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
                    {item.last_synced_at
                      ? `Last synced ${formatFullDate(item.last_synced_at.slice(0, 10))}`
                      : 'Not synced yet'}
                  </Text>

                  <Text className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
                    {item.last_balance_refreshed_at
                      ? `Real-time balances refreshed ${formatFullDate(
                          item.last_balance_refreshed_at.slice(0, 10),
                        )}`
                      : 'Real-time balances not refreshed yet'}
                  </Text>

                  <Text className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
                    Plaid phone:{' '}
                    {item.plaid_phone_number
                      ? formatPlaidPhoneNumber(item.plaid_phone_number)
                      : 'Not recorded'}
                  </Text>

                  {editingPhoneItemId === item.id ? (
                    <View className="mt-3 gap-3">
                      <Field
                        label="Plaid phone number"
                        value={plaidPhoneInput}
                        onChangeText={setPlaidPhoneInput}
                        autoComplete="tel"
                        keyboardType="phone-pad"
                        textContentType="telephoneNumber"
                        placeholder="(415) 555-0010"
                        error={plaidPhoneError}
                      />
                      <View className="flex-row gap-3">
                        <Button
                          label="Cancel"
                          variant="secondary"
                          disabled={phoneMutation.isPending}
                          onPress={() => {
                            setEditingPhoneItemId(null);
                            setPlaidPhoneInput('');
                          }}
                          className="flex-1"
                        />
                        <Button
                          label={
                            phoneMutation.isPending ? 'Saving…' : 'Save phone'
                          }
                          disabled={
                            !normalizedPlaidPhone || phoneMutation.isPending
                          }
                          onPress={() => {
                            if (!normalizedPlaidPhone) return;
                            phoneMutation.mutate({
                              itemId: item.id,
                              phoneNumber: normalizedPlaidPhone,
                            });
                          }}
                          className="flex-1"
                        />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-4 mt-3">
                      {item.status !== 'good' ? (
                        <View className="flex-1">
                          <LinkAccountButton
                            label="Reconnect"
                            itemId={item.id}
                            variant="secondary"
                          />
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => {
                          setEditingPhoneItemId(item.id);
                          setPlaidPhoneInput(item.plaid_phone_number ?? '');
                        }}
                        accessibilityRole="button"
                        hitSlop={8}
                        className="py-1"
                      >
                        <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                          {item.plaid_phone_number ? 'Edit phone' : 'Add phone'}
                        </Text>
                      </Pressable>

                      {/* Plain text actions avoid a tall indented button block. */}
                      <Pressable
                        onPress={() => disconnect(item.id)}
                        disabled={removingId === item.id}
                        accessibilityRole="button"
                        hitSlop={8}
                        className="py-1"
                      >
                        <Text className="text-sm font-semibold text-negative">
                          {removingId === item.id
                            ? 'Disconnecting…'
                            : 'Disconnect'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <Text className="text-sm text-ink-500 dark:text-ink-400 p-4">
              No banks connected yet.
            </Text>
          )}
        </Card>

        <View className="px-4 mt-4">
          <PlaidConnectOptions primaryLabel="Connect an institution" />
        </View>

        <View className="px-4 mt-10">
          {confirmingSignOut ? (
            <Card className="p-4">
              <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                Sign out of Mintea?
              </Text>
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
                Your connected accounts stay linked. You'll need your password to
                sign back in.
              </Text>
              <View className="flex-row gap-3">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setConfirmingSignOut(false)}
                  className="flex-1"
                />
                <Button
                  label={signingOut ? 'Signing out…' : 'Sign out'}
                  disabled={signingOut}
                  onPress={async () => {
                    setSigningOut(true);
                    try {
                      // Drop every cached query before the session goes, so a
                      // different account can't briefly see the last one's data.
                      await signOut();
                      queryClient.clear();
                      router.replace('/(auth)/sign-in');
                    } catch (caught) {
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : 'Could not sign out',
                      );
                      setSigningOut(false);
                    }
                  }}
                  className="flex-1"
                />
              </View>
            </Card>
          ) : (
            <Button
              label="Sign out"
              variant="secondary"
              onPress={() => setConfirmingSignOut(true)}
            />
          )}
        </View>

        <Text className="text-xs text-ink-400 dark:text-ink-500 text-center mt-8">
          Mintea 0.1.0
        </Text>
      </View>
    </ScrollView>
  );
}
