import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  accountDisplayBalance,
  formatFullDate,
  formatMoney,
  formatPlaidPhoneNumber,
  type AccountMergePreviewRow,
  type AccountWithInstitution,
  type DuplicateAccountCandidate,
  type TransactionRow,
  type TransferCandidateRow,
} from '@mintea/core';

import { useTheme } from '../lib/theme';
import { Badge, Button, Card, Money } from './ui';

export function DuplicateAccountsBanner({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const noun = count === 1 ? 'match' : 'matches';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Review ${count} possible duplicate account ${noun}`}
      className="mx-4 mt-4 rounded-2xl border border-mint-200 dark:border-mint-800 bg-mint-50 dark:bg-mint-950 active:opacity-80"
    >
      <View className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 rounded-full bg-mint-100 dark:bg-mint-900 items-center justify-center">
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color={colors.accent}
          />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            Review {count} possible duplicate {noun}
          </Text>
          <Text className="text-sm text-ink-600 dark:text-ink-300 mt-0.5">
            Prevent double-counted balances and transactions.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function connectionHealth(account: AccountWithInstitution): string {
  switch (account.institution?.status) {
    case 'good':
      return 'Connected';
    case 'pending_expiration':
      return 'Renew soon';
    case 'login_required':
      return 'Needs login';
    case 'error':
      return 'Connection error';
    case 'revoked':
      return 'Disconnected';
    default:
      return 'Unknown status';
  }
}

function plaidProfileLabel(account: AccountWithInstitution): string {
  const phone = account.institution?.phoneNumber;
  return phone
    ? `Plaid profile ${formatPlaidPhoneNumber(phone)}`
    : 'Plaid profile not recorded';
}

function AccountChoice({
  account,
  selected,
  recommended,
  disabled,
  onPress,
}: {
  account: AccountWithInstitution;
  selected: boolean;
  recommended: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const displayBalance = accountDisplayBalance(account);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      accessibilityLabel={[
        `Keep ${account.name} from ${
          account.institution?.name ?? 'this connection'
        }`,
        plaidProfileLabel(account),
        connectionHealth(account),
      ].join(', ')}
      className={`rounded-xl border p-3 active:opacity-80 ${
        selected
          ? 'border-mint-500 bg-mint-50 dark:border-mint-500 dark:bg-mint-950'
          : 'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={`mt-0.5 h-5 w-5 rounded-full border-2 items-center justify-center ${
            selected
              ? 'border-mint-600 dark:border-mint-400'
              : 'border-ink-300 dark:border-ink-600'
          }`}
        >
          {selected ? (
            <View className="h-2.5 w-2.5 rounded-full bg-mint-600 dark:bg-mint-400" />
          ) : null}
        </View>

        <View className="flex-1 min-w-0">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 flex-row items-center gap-2 flex-wrap">
              <Text
                numberOfLines={1}
                className="text-base font-semibold text-ink-900 dark:text-ink-50 shrink"
              >
                {account.name}
              </Text>
              {recommended ? <Badge label="Recommended" tone="accent" /> : null}
            </View>
            <View className="items-end shrink-0">
              <Money
                cents={displayBalance.cents}
                currency={account.currency}
                size="sm"
              />
              {displayBalance.isOwed ? (
                <Text className="text-xs text-ink-400 dark:text-ink-500">
                  owed
                </Text>
              ) : null}
            </View>
          </View>
          <Text
            numberOfLines={2}
            className="text-sm text-ink-500 dark:text-ink-400 mt-0.5"
          >
            {account.institution?.name ?? 'Linked account'}
            {account.mask ? ` · ••${account.mask}` : ''}
          </Text>
          <Text
            numberOfLines={2}
            className="text-xs text-ink-400 dark:text-ink-500 mt-1"
          >
            {plaidProfileLabel(account)} · {connectionHealth(account)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ImpactStat({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <View className="flex-1 min-w-24 rounded-xl bg-ink-50 dark:bg-ink-800 px-3 py-3">
      <Text className="text-xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
        {value}
      </Text>
      <Text className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
        {label}
      </Text>
    </View>
  );
}

export function DuplicateReviewCard({
  candidate,
  keepId,
  onKeepChange,
  preview,
  previewing = false,
  merging = false,
  disabled = false,
  error,
  onPreview,
  onMerge,
  onCancelPreview,
}: {
  candidate: DuplicateAccountCandidate;
  keepId: string;
  onKeepChange: (id: string) => void;
  preview?: AccountMergePreviewRow | null;
  previewing?: boolean;
  merging?: boolean;
  disabled?: boolean;
  error?: string | null;
  onPreview: () => void;
  onMerge: () => void;
  onCancelPreview: () => void;
}) {
  const keep =
    candidate.first.id === keepId ? candidate.first : candidate.second;
  const archive =
    candidate.first.id === keepId ? candidate.second : candidate.first;
  const interactionLocked = disabled || previewing || merging;

  return (
    <Card className="p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            These may be the same account
          </Text>
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            Choose the connection Mintea should keep syncing.
          </Text>
        </View>
        <Badge
          label={candidate.confidence === 'high' ? 'Strong match' : 'Possible'}
          tone={candidate.confidence === 'high' ? 'accent' : 'warning'}
        />
      </View>

      <View className="flex-row flex-wrap gap-2 mt-3">
        {candidate.reasons.slice(1).map((reason) => (
          <View
            key={reason}
            className="rounded-full bg-ink-100 dark:bg-ink-800 px-2.5 py-1"
          >
            <Text className="text-xs text-ink-600 dark:text-ink-300">
              {reason}
            </Text>
          </View>
        ))}
      </View>

      <Text
        className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mt-5 mb-2"
      >
        Keep this connection
      </Text>
      <View accessibilityRole="radiogroup" className="gap-2">
        <AccountChoice
          account={candidate.first}
          selected={candidate.first.id === keepId}
          recommended={candidate.first.id === candidate.recommendedKeepId}
          disabled={interactionLocked}
          onPress={() => onKeepChange(candidate.first.id)}
        />
        <AccountChoice
          account={candidate.second}
          selected={candidate.second.id === keepId}
          recommended={candidate.second.id === candidate.recommendedKeepId}
          disabled={interactionLocked}
          onPress={() => onKeepChange(candidate.second.id)}
        />
      </View>

      {preview ? (
        <View className="mt-5">
          <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
            What will happen
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-2">
            <ImpactStat
              value={preview.transaction_count_to_move}
              label="unique transactions moved"
            />
            <ImpactStat
              value={preview.overlapping_transaction_count}
              label="duplicate transactions archived"
            />
            <ImpactStat
              value={preview.balance_dates_to_copy}
              label="balance-history days copied"
            />
          </View>

          <View className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 mt-3">
            <Text className="text-sm text-amber-900 dark:text-amber-200">
              <Text className="font-semibold">
                {archive.name} ({plaidProfileLabel(archive)})
              </Text>{' '}
              will stop syncing and stop contributing to net worth. Its archived
              data and merge audit stay available, but Mintea does not have an
              undo button yet.
            </Text>
            {preview.source_item_will_be_empty ? (
              <Text className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">
                This is the last active account on that Plaid connection.
              </Text>
            ) : null}
          </View>

          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-3">
            <Text className="font-semibold text-ink-700 dark:text-ink-200">
              {keep.name} ({plaidProfileLabel(keep)})
            </Text>{' '}
            keeps its identity, current balance, settings, and edited
            transaction details.
          </Text>

          <View className="flex-col sm:flex-row gap-3 mt-4">
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onCancelPreview}
              disabled={interactionLocked}
              className="w-full sm:flex-1 px-2"
            />
            <Button
              label="Merge accounts"
              onPress={onMerge}
              loading={merging}
              disabled={disabled}
              className="w-full sm:flex-1 px-2"
            />
          </View>
        </View>
      ) : (
        <Button
          label="Preview merge"
          onPress={onPreview}
          loading={previewing}
          disabled={disabled}
          className="mt-5"
        />
      )}

      {error ? (
        <View className="rounded-xl bg-red-50 dark:bg-red-950/40 px-3 py-2.5 mt-3">
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export function TransferMatchPanel({
  transaction,
  pairedTransaction,
  pairedAccountName,
  candidates,
  loading = false,
  error,
  matchingId,
  unlinking = false,
  onMatch,
  onUnlink,
}: {
  transaction: TransactionRow;
  pairedTransaction?: TransactionRow | null;
  pairedAccountName?: string | null;
  candidates: TransferCandidateRow[];
  loading?: boolean;
  error?: string | null;
  matchingId?: string | null;
  unlinking?: boolean;
  onMatch: (candidate: TransferCandidateRow) => void;
  onUnlink: () => void;
}) {
  if (!transaction.transfer_pair_id && !error && candidates.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden mb-5">
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
              {transaction.transfer_pair_id
                ? 'Linked transfer'
                : 'Possible transfer'}
            </Text>
            <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              {transaction.transfer_pair_id
                ? 'Both sides are counted once and excluded from cash flow.'
                : 'Match the other side to avoid counting this as income or spending.'}
            </Text>
          </View>
          <Badge
            label={transaction.transfer_pair_id ? 'Matched' : 'Suggested'}
            tone="accent"
          />
        </View>

        {transaction.transfer_pair_id ? (
          <View className="mt-3">
            <View className="rounded-xl bg-ink-50 dark:bg-ink-800 p-3">
              {pairedTransaction ? (
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 min-w-0">
                    <Text
                      numberOfLines={1}
                      className="text-sm font-semibold text-ink-900 dark:text-ink-50"
                    >
                      {pairedTransaction.description}
                    </Text>
                    <Text className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                      {pairedAccountName ?? 'Another account'} ·{' '}
                      {formatFullDate(pairedTransaction.date)}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                    {formatMoney(pairedTransaction.amount_cents, {
                      currency: pairedTransaction.currency,
                    })}
                  </Text>
                </View>
              ) : (
                <Text className="text-sm text-ink-500 dark:text-ink-400">
                  {loading
                    ? 'Loading the other side…'
                    : 'The other side is unavailable. Unlink this match to repair it.'}
                </Text>
              )}
            </View>

            <Button
              label="Unlink transfer"
              variant="secondary"
              onPress={onUnlink}
              loading={unlinking}
              className="mt-3"
            />
          </View>
        ) : loading ? (
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-3">
            Looking for an exact opposite amount…
          </Text>
        ) : (
          <View className="gap-2 mt-3">
            {candidates.map((candidate) => (
              <View
                key={candidate.id}
                className="rounded-xl bg-ink-50 dark:bg-ink-800 p-3"
              >
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 min-w-0">
                    <Text
                      numberOfLines={1}
                      className="text-sm font-semibold text-ink-900 dark:text-ink-50"
                    >
                      {candidate.description}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-xs text-ink-500 dark:text-ink-400 mt-0.5"
                    >
                      {candidate.account_name} · {formatFullDate(candidate.date)}
                      {candidate.days_apart === 0
                        ? ' · same day'
                        : ` · ${candidate.days_apart} ${
                            candidate.days_apart === 1 ? 'day' : 'days'
                          } apart`}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                    {formatMoney(candidate.amount_cents, {
                      currency: candidate.currency,
                    })}
                  </Text>
                </View>
                <Button
                  label="Match transfer"
                  variant="secondary"
                  onPress={() => onMatch(candidate)}
                  loading={matchingId === candidate.id}
                  disabled={Boolean(matchingId && matchingId !== candidate.id)}
                  className="mt-3"
                />
              </View>
            ))}
          </View>
        )}

        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-red-700 dark:text-red-300 mt-3"
          >
            {error}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
