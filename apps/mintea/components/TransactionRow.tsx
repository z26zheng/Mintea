import { Pressable, Text, View } from 'react-native';
import type { TransactionView } from '@mintea/core';

import { Money } from './ui';
import { TagList } from './TagChip';

/**
 * One transaction line. Deliberately dense — a finance app lives or dies on how
 * many rows fit on screen — but with a 56px-tall tap target.
 */
export function TransactionRow({
  transaction,
  onPress,
  selected = false,
  selectionMode = false,
  onToggleSelect,
}: {
  transaction: TransactionView;
  onPress?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
}) {
  const category = transaction.category;

  return (
    <Pressable
      onPress={selectionMode ? onToggleSelect : onPress}
      onLongPress={onToggleSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center px-4 py-3 gap-3 active:bg-ink-100 dark:active:bg-ink-800 ${
        selected ? 'bg-mint-50 dark:bg-mint-950' : ''
      }`}
    >
      {selectionMode ? (
        <View
          className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
            selected
              ? 'bg-mint-600 border-mint-600'
              : 'border-ink-300 dark:border-ink-600'
          }`}
        >
          {selected ? (
            <Text className="text-white text-xs font-bold">✓</Text>
          ) : null}
        </View>
      ) : (
        <View className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 items-center justify-center">
          <Text className="text-lg">{category?.icon ?? '❓'}</Text>
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="text-base text-ink-900 dark:text-ink-50 flex-shrink"
          >
            {transaction.description}
          </Text>
          {transaction.is_pending ? (
            <Text className="text-xs text-ink-400 dark:text-ink-500">
              Pending
            </Text>
          ) : null}
        </View>

        <Text
          numberOfLines={1}
          className="text-sm text-ink-500 dark:text-ink-400 mt-0.5"
        >
          {category?.name ?? 'Uncategorized'}
          {transaction.account ? ` · ${transaction.account.name}` : ''}
          {transaction.has_splits ? ' · Split' : ''}
          {transaction.transfer_pair_id ? ' · Transfer' : ''}
        </Text>

        {transaction.tags.length > 0 ? (
          <View className="mt-1">
            <TagList tags={transaction.tags} max={3} />
          </View>
        ) : null}
      </View>

      <View className="items-end">
        <Money
          cents={transaction.amount_cents}
          currency={transaction.currency}
          colorize="income-only"
        />
        {transaction.needs_review ? (
          <View className="w-1.5 h-1.5 rounded-full bg-mint-500 mt-1.5" />
        ) : null}
      </View>
    </Pressable>
  );
}
