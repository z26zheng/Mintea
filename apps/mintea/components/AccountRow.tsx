import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  accountDisplayBalance,
  accountSubtitle,
  creditUtilization,
  needsReconnect,
  type AccountWithInstitution,
} from '@mintea/core';

import { useTheme } from '../lib/theme';
import { Badge, Money, Row } from './ui';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  depository: 'cash-outline',
  credit: 'card-outline',
  investment: 'trending-up-outline',
  loan: 'document-text-outline',
  other: 'ellipse-outline',
};

export function AccountRow({
  account,
  onPress,
}: {
  account: AccountWithInstitution;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const { cents, isOwed } = accountDisplayBalance(account);
  const utilization = creditUtilization(account);
  const broken = needsReconnect(account);

  const subtitle = [
    accountSubtitle(account),
    utilization !== null ? `${Math.round(utilization * 100)}% used` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Row onPress={onPress}>
      <View className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 items-center justify-center">
        <Ionicons
          name={ICONS[account.type] ?? 'ellipse-outline'}
          size={20}
          color={colors.textMuted}
        />
      </View>

      {/* min-w-0 lets the name actually truncate instead of forcing the row
          wider than the card on a narrow screen. */}
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="text-base font-medium text-ink-900 dark:text-ink-50"
        >
          {account.name}
        </Text>

        {/* Badges sit on the metadata line rather than beside the name — at
            375px there isn't room for name + badge + amount on one row. */}
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <Text
            numberOfLines={1}
            className="text-sm text-ink-500 dark:text-ink-400 shrink"
          >
            {subtitle}
          </Text>
          {broken ? <Badge label="Reconnect" tone="warning" /> : null}
          {account.is_hidden ? <Badge label="Hidden" /> : null}
        </View>
      </View>

      <View className="items-end">
        <Money cents={cents} currency={account.currency} />
        {isOwed ? (
          <Text className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">
            owed
          </Text>
        ) : null}
      </View>
    </Row>
  );
}
