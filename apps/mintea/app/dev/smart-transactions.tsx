import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colorScheme, useColorScheme } from 'nativewind';
import type { MerchantRow, TransactionRuleRow } from '@mintea/core';

import {
  MerchantPicker,
  TransactionAutomationCard,
  TransactionRuleCard,
  type MerchantChoice,
} from '../../components/SmartTransactions';
import { Button, Card, Screen, Title } from '../../components/ui';

const householdId = '00000000-0000-4000-8000-000000000000';

const merchant = (
  id: string,
  name: string,
  logoUrl: string | null = null,
): MerchantRow => ({
  id,
  household_id: householdId,
  name,
  logo_url: logoUrl,
  default_category_id: null,
  created_at: '2026-07-28T18:00:00.000Z',
});

const merchants = [
  merchant('11111111-1111-4111-8111-111111111111', 'Blue Bottle Coffee'),
  merchant('22222222-2222-4222-8222-222222222222', 'Starbucks'),
  merchant('33333333-3333-4333-8333-333333333333', 'Whole Foods Market'),
  merchant('44444444-4444-4444-8444-444444444444', 'Uber'),
  merchant('55555555-5555-4555-8555-555555555555', 'Uber Eats'),
  merchant('66666666-6666-4666-8666-666666666666', 'Target'),
];

const initialRule: TransactionRuleRow = {
  id: '77777777-7777-4777-8777-777777777777',
  household_id: householdId,
  name: 'Merchant: Blue Bottle Coffee and Category: Coffee Shops',
  match_description: 'BLUE BOTTLE COFFEE #1842',
  match_description_normalized: 'blue bottle coffee #1842',
  merchant_id: merchants[0]!.id,
  category_id: '88888888-8888-4888-8888-888888888888',
  enabled: true,
  historical_application_count: 8,
  last_applied_at: '2026-07-28T18:00:00.000Z',
  created_at: '2026-07-28T18:00:00.000Z',
  updated_at: '2026-07-28T18:00:00.000Z',
};

function SmartTransactionsFixture() {
  const { colorScheme: activeColorScheme } = useColorScheme();
  const [choice, setChoice] = useState<MerchantChoice>({
    id: merchants[0]!.id,
    name: merchants[0]!.name,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rule, setRule] = useState<TransactionRuleRow | null>(initialRule);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busyRule, setBusyRule] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);

  const merchantName = useMemo(
    () =>
      choice.id
        ? merchants.find((item) => item.id === choice.id)?.name ?? choice.name
        : choice.name,
    [choice],
  );

  const reset = () => {
    setChoice({ id: merchants[0]!.id, name: merchants[0]!.name });
    setPickerOpen(false);
    setAutomationEnabled(false);
    setSaving(false);
    setSaved(false);
    setRule(initialRule);
    setConfirmingDelete(false);
    setBusyRule(false);
    setAutomationError(null);
  };

  const simulateSave = () => {
    setSaving(true);
    setAutomationError(null);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 500);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="px-4 pb-16 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Title>Smart Transactions QA</Title>
            <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              Development-only production component fixture
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() =>
                colorScheme.set(
                  activeColorScheme === 'dark' ? 'light' : 'dark',
                )
              }
              accessibilityRole="button"
              className="rounded-full border border-ink-300 px-3 py-2 dark:border-ink-700"
            >
              <Text className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                {activeColorScheme === 'dark' ? 'Light' : 'Dark'}
              </Text>
            </Pressable>
            <Pressable
              onPress={reset}
              accessibilityRole="button"
              className="rounded-full border border-ink-300 px-3 py-2 dark:border-ink-700"
            >
              <Text className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                Reset
              </Text>
            </Pressable>
          </View>
        </View>

        <Text className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Transaction cleanup
        </Text>

        <Card className="mb-5 p-4">
          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Bank transaction
              </Text>
              <Text className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                Morning coffee
              </Text>
              <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                BLUE BOTTLE COFFEE #1842
              </Text>
            </View>
            <Text className="text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">
              -$6.75
            </Text>
          </View>
        </Card>

        <Text className="mb-1.5 text-sm font-medium text-ink-600 dark:text-ink-300">
          Merchant
        </Text>
        <Pressable
          testID="qa-merchant-field"
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Merchant, ${merchantName || 'none'}`}
          className="mb-5 h-12 flex-row items-center gap-2 rounded-xl border border-ink-300 bg-white px-4 dark:border-ink-700 dark:bg-ink-900"
        >
          <Text className="text-lg">🏪</Text>
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 text-base text-ink-900 dark:text-ink-50"
          >
            {merchantName || 'No merchant'}
          </Text>
          <Text className="text-ink-400">›</Text>
        </Pressable>

        <View className="mb-5">
          <Text className="mb-1.5 text-sm font-medium text-ink-600 dark:text-ink-300">
            Category
          </Text>
          <View className="h-12 flex-row items-center gap-2 rounded-xl border border-ink-300 bg-white px-4 dark:border-ink-700 dark:bg-ink-900">
            <Text className="text-lg">☕</Text>
            <Text className="text-base text-ink-900 dark:text-ink-50">
              Coffee Shops
            </Text>
          </View>
        </View>

        <TransactionAutomationCard
          matchDescription="BLUE BOTTLE COFFEE #1842"
          matchCount={8}
          enabled={automationEnabled}
          existingRule={saved}
          error={automationError}
          hasAction={Boolean(merchantName)}
          onToggle={setAutomationEnabled}
        />

        {saved ? (
          <View
            accessibilityLiveRegion="polite"
            className="mb-4 rounded-xl border border-mint-200 bg-mint-50 p-4 dark:border-mint-900 dark:bg-mint-950/40"
          >
            <Text className="text-sm font-semibold text-mint-800 dark:text-mint-200">
              Rule saved
            </Text>
            <Text className="mt-1 text-sm text-mint-700 dark:text-mint-300">
              Eight historical matches were cleaned up. Future exact matches
              will use this merchant and category.
            </Text>
          </View>
        ) : null}

        <Button
          label="Save transaction"
          loading={saving}
          disabled={automationEnabled && !merchantName}
          onPress={simulateSave}
        />

        <Pressable
          onPress={() =>
            setAutomationError((current) =>
              current
                ? null
                : 'Could not count matches. Check your connection and try again.',
            )
          }
          accessibilityRole="button"
          className="self-start px-1 py-3"
        >
          <Text className="text-xs font-semibold text-ink-500 dark:text-ink-400">
            Toggle preview error
          </Text>
        </Pressable>

        <Text className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Rule management
        </Text>

        {rule ? (
          <TransactionRuleCard
            rule={rule}
            merchantName="Blue Bottle Coffee"
            categoryLabel="☕ Coffee Shops"
            confirmingDelete={confirmingDelete}
            busy={busyRule}
            onToggle={(enabled) => setRule((current) => current && { ...current, enabled })}
            onRequestDelete={() => setConfirmingDelete(true)}
            onCancelDelete={() => setConfirmingDelete(false)}
            onDelete={() => {
              setBusyRule(true);
              setTimeout(() => {
                setBusyRule(false);
                setConfirmingDelete(false);
                setRule(null);
              }, 500);
            }}
          />
        ) : (
          <Card className="items-center p-6">
            <Text className="text-3xl">✓</Text>
            <Text className="mt-2 text-base font-semibold text-ink-900 dark:text-ink-50">
              Rule deleted
            </Text>
            <Text className="mt-1 text-center text-sm text-ink-500 dark:text-ink-400">
              Existing cleanup remains; future matches are unchanged.
            </Text>
          </Card>
        )}
      </ScrollView>

      <MerchantPicker
        visible={pickerOpen}
        merchants={merchants}
        selectedId={choice.id}
        selectedName={choice.id ? '' : choice.name}
        onSelect={setChoice}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

export default function SmartTransactionsFixtureRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <SmartTransactionsFixture />;
}
