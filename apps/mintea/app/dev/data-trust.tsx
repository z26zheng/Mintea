import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colorScheme, useColorScheme } from 'nativewind';
import {
  findDuplicateAccountCandidates,
  type AccountMergePreviewRow,
  type AccountWithInstitution,
  type TransactionRow,
  type TransferCandidateRow,
} from '@mintea/core';

import {
  DuplicateAccountsBanner,
  DuplicateReviewCard,
  TransferMatchPanel,
} from '../../components/DataTrust';
import { Button, Card, EmptyState, Screen, Title } from '../../components/ui';

const account = (
  overrides: Partial<AccountWithInstitution>,
): AccountWithInstitution => ({
  id: '11111111-1111-4111-8111-111111111111',
  household_id: '00000000-0000-4000-8000-000000000000',
  plaid_item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  plaid_account_id: 'plaid-checking-a',
  name: 'Everyday Checking',
  official_name: 'EVERYDAY CHECKING',
  mask: '4821',
  type: 'depository',
  subtype: 'checking',
  currency: 'USD',
  current_balance_cents: 842_15,
  available_balance_cents: 740_15,
  limit_cents: null,
  is_asset: true,
  is_manual: false,
  is_hidden: false,
  include_in_net_worth: true,
  display_order: 0,
  deleted_at: null,
  merged_into_account_id: null,
  merged_at: null,
  merged_by_user_id: null,
  created_at: '2026-05-14T15:00:00.000Z',
  updated_at: '2026-07-28T15:00:00.000Z',
  institution: {
    id: 'ins_demo',
    name: 'First Community Bank',
    logo: null,
    phoneNumber: '+14155550108',
    status: 'good',
    errorMessage: null,
    lastSyncedAt: '2026-07-28T15:00:00.000Z',
  },
  ...overrides,
});

const firstAccount = account({});
const secondAccount = account({
  id: '22222222-2222-4222-8222-222222222222',
  plaid_item_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  plaid_account_id: 'plaid-checking-b',
  current_balance_cents: 842_15,
  institution: {
    ...firstAccount.institution!,
    phoneNumber: '+14155550129',
    status: 'login_required',
    lastSyncedAt: '2026-07-27T15:00:00.000Z',
  },
});

const duplicateCandidate = findDuplicateAccountCandidates([
  firstAccount,
  secondAccount,
])[0]!;

const mergePreview: AccountMergePreviewRow = {
  source_transaction_count: 186,
  overlapping_transaction_count: 172,
  transaction_count_to_move: 14,
  source_balance_count: 94,
  balance_dates_to_copy: 8,
  source_item_will_be_empty: true,
};

const baseTransaction: TransactionRow = {
  id: '33333333-3333-4333-8333-333333333333',
  household_id: '00000000-0000-4000-8000-000000000000',
  account_id: firstAccount.id,
  plaid_transaction_id: 'plaid-transfer-out',
  date: '2026-07-26',
  authorized_date: '2026-07-26',
  amount_cents: -500_00,
  currency: 'USD',
  merchant_id: null,
  description: 'Transfer to savings',
  original_description: 'ONLINE TRANSFER TO SAV 9044',
  category_id: null,
  notes: null,
  is_pending: false,
  is_hidden: false,
  needs_review: false,
  date_overridden: false,
  amount_overridden: false,
  merchant_overridden: false,
  deleted_at: null,
  parent_id: null,
  has_splits: false,
  transfer_pair_id: null,
  plaid_category: null,
  created_at: '2026-07-26T18:00:00.000Z',
  updated_at: '2026-07-26T18:00:00.000Z',
};

const transferCandidate: TransferCandidateRow = {
  id: '44444444-4444-4444-8444-444444444444',
  account_id: '55555555-5555-4555-8555-555555555555',
  account_name: 'Rainy Day Savings',
  date: '2026-07-27',
  amount_cents: 500_00,
  currency: 'USD',
  description: 'Transfer from checking',
  days_apart: 1,
};

const pairedTransaction: TransactionRow = {
  ...baseTransaction,
  id: transferCandidate.id,
  account_id: transferCandidate.account_id,
  plaid_transaction_id: 'plaid-transfer-in',
  date: transferCandidate.date,
  amount_cents: transferCandidate.amount_cents,
  description: transferCandidate.description,
  original_description: 'ONLINE TRANSFER FROM CHK 4821',
  transfer_pair_id: baseTransaction.id,
};

function DataTrustFixture() {
  const { colorScheme: activeColorScheme } = useColorScheme();
  const [keepId, setKeepId] = useState(duplicateCandidate.recommendedKeepId);
  const [preview, setPreview] = useState<AccountMergePreviewRow | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeState, setMergeState] = useState<
    'review' | 'success' | 'empty'
  >('review');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);
  const [matching, setMatching] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const transaction = useMemo(
    () => ({
      ...baseTransaction,
      transfer_pair_id: matched ? pairedTransaction.id : null,
    }),
    [matched],
  );

  const reset = () => {
    setKeepId(duplicateCandidate.recommendedKeepId);
    setPreview(null);
    setPreviewing(false);
    setMerging(false);
    setMergeState('review');
    setDuplicateError(null);
    setMatched(false);
    setMatching(false);
    setTransferError(null);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="px-4 pt-6 pb-16"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Title>Data Trust QA</Title>
            <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
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
              className="rounded-full border border-ink-300 dark:border-ink-700 px-3 py-2"
            >
              <Text className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                {activeColorScheme === 'dark' ? 'Light' : 'Dark'}
              </Text>
            </Pressable>
            <Pressable
              onPress={reset}
              accessibilityRole="button"
              className="rounded-full border border-ink-300 dark:border-ink-700 px-3 py-2"
            >
              <Text className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                Reset
              </Text>
            </Pressable>
          </View>
        </View>

        {mergeState === 'review' ? (
          <View className="-mx-4 mt-3">
            <DuplicateAccountsBanner count={1} onPress={() => {}} />
          </View>
        ) : null}

        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mt-8 mb-2">
          Account merge
        </Text>

        {mergeState === 'success' ? (
          <Card className="p-5 items-center">
            <Text className="text-3xl">✓</Text>
            <Text className="text-lg font-semibold text-ink-900 dark:text-ink-50 mt-2">
              Duplicate resolved
            </Text>
            <Text className="text-sm text-ink-500 dark:text-ink-400 text-center mt-1">
              14 unique transactions moved and 172 overlaps archived.
            </Text>
            <Button
              label="Continue"
              onPress={() => setMergeState('empty')}
              className="mt-4 self-stretch"
            />
          </Card>
        ) : mergeState === 'empty' ? (
          <Card>
            <EmptyState
              icon="✓"
              title="No likely duplicates"
              message="Your active linked accounts do not share the strong identity signals Mintea requires before suggesting a merge."
            />
          </Card>
        ) : (
          <DuplicateReviewCard
            candidate={duplicateCandidate}
            keepId={keepId}
            preview={preview}
            previewing={previewing}
            merging={merging}
            error={duplicateError}
            onKeepChange={(id) => {
              setKeepId(id);
              setPreview(null);
              setDuplicateError(null);
            }}
            onPreview={() => {
              setDuplicateError(null);
              setPreviewing(true);
              setTimeout(() => {
                setPreviewing(false);
                setPreview(mergePreview);
              }, 500);
            }}
            onCancelPreview={() => {
              setPreview(null);
              setDuplicateError(null);
            }}
            onMerge={() => {
              setMerging(true);
              setTimeout(() => {
                setMerging(false);
                setMergeState('success');
              }, 600);
            }}
          />
        )}

        <Pressable
          onPress={() =>
            setDuplicateError((current) =>
              current ? null : 'The accounts changed. Preview the merge again.',
            )
          }
          accessibilityRole="button"
          className="self-start mt-2 px-1 py-2"
        >
          <Text className="text-xs font-semibold text-ink-500 dark:text-ink-400">
            Toggle account error
          </Text>
        </Pressable>

        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mt-8 mb-2">
          Transfer matching
        </Text>
        <TransferMatchPanel
          transaction={transaction}
          pairedTransaction={matched ? pairedTransaction : null}
          pairedAccountName="Rainy Day Savings"
          candidates={matched ? [] : [transferCandidate]}
          matchingId={matching ? transferCandidate.id : null}
          error={transferError}
          onMatch={() => {
            setTransferError(null);
            setMatching(true);
            setTimeout(() => {
              setMatching(false);
              setMatched(true);
            }, 500);
          }}
          onUnlink={() => setMatched(false)}
        />

        <Pressable
          onPress={() =>
            setTransferError((current) =>
              current ? null : 'This match is no longer available.',
            )
          }
          accessibilityRole="button"
          className="self-start px-1 py-2"
        >
          <Text className="text-xs font-semibold text-ink-500 dark:text-ink-400">
            Toggle transfer error
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

export default function DataTrustFixtureRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DataTrustFixture />;
}
