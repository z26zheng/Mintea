import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MerchantRow, TransactionRuleRow } from '@mintea/core';

import { useTheme } from '../lib/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  IconBadge,
  Skeleton,
} from './ui';

export type MerchantChoice = {
  id: string | null;
  name: string;
};

export function MerchantPicker({
  visible,
  merchants,
  selectedId,
  selectedName,
  onSelect,
  onClose,
}: {
  visible: boolean;
  merchants: MerchantRow[];
  selectedId: string | null;
  selectedName: string;
  onSelect: (choice: MerchantChoice) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const viewport = useWindowDimensions();
  const desktop = viewport.width >= 768;
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) setSearch('');
  }, [visible]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      normalizedSearch
        ? merchants.filter((merchant) =>
            merchant.name.toLowerCase().includes(normalizedSearch),
          )
        : merchants,
    [merchants, normalizedSearch],
  );
  const exactMatch = merchants.some(
    (merchant) => merchant.name.trim().toLowerCase() === normalizedSearch,
  );

  const choose = (choice: MerchantChoice) => {
    onSelect(choice);
    onClose();
  };

  const content = (
    <View
      testID="merchant-picker"
      accessibilityViewIsModal
      className={`overflow-hidden bg-ink-50 dark:bg-ink-950 ${
        desktop
          ? 'w-full max-w-lg rounded-2xl border border-ink-200 dark:border-ink-700'
          : 'flex-1'
      }`}
      style={desktop ? { maxHeight: Math.min(680, viewport.height - 48) } : undefined}
    >
      <View className="h-14 shrink-0 flex-row items-center justify-between border-b border-ink-200 px-4 dark:border-ink-800">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close merchant picker"
          hitSlop={8}
        >
          <Text className="text-base text-ink-500 dark:text-ink-400">
            Cancel
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          className="text-base font-semibold text-ink-900 dark:text-ink-50"
        >
          Choose merchant
        </Text>
        <View className="w-12" />
      </View>

      <View className="shrink-0 px-4 py-3">
        <View className="h-11 flex-row items-center gap-2 rounded-xl border border-ink-300 bg-white px-3 dark:border-ink-700 dark:bg-ink-900">
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search or create a merchant"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            className="flex-1 text-base text-ink-900 dark:text-ink-50"
          />
          {search ? (
            <Pressable
              onPress={() => setSearch('')}
              accessibilityRole="button"
              accessibilityLabel="Clear merchant search"
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        className="min-h-0 flex-1"
        data={filtered}
        keyExtractor={(merchant) => merchant.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-6"
        ListHeaderComponent={
          <>
            <Pressable
              onPress={() => choose({ id: null, name: '' })}
              accessibilityRole="radio"
              accessibilityState={{
                selected: selectedId === null && !selectedName,
              }}
              className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-ink-100 dark:bg-ink-800">
                <Ionicons
                  name="remove-outline"
                  size={20}
                  color={colors.textMuted}
                />
              </View>
              <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
                No merchant
              </Text>
              {selectedId === null && !selectedName ? (
                <Ionicons name="checkmark" size={20} color={colors.accent} />
              ) : null}
            </Pressable>
            <Divider />

            {normalizedSearch && !exactMatch ? (
              <>
                <Pressable
                  testID="merchant-picker-create"
                  onPress={() =>
                    choose({ id: null, name: search.trim().replace(/\s+/g, ' ') })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Create merchant ${search.trim()}`}
                  className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-mint-100 dark:bg-mint-900">
                    <Ionicons name="add" size={20} color={colors.accent} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm text-ink-500 dark:text-ink-400">
                      Create merchant
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-base font-semibold text-mint-600 dark:text-mint-400"
                    >
                      {search.trim().replace(/\s+/g, ' ')}
                    </Text>
                  </View>
                </Pressable>
                <Divider />
              </>
            ) : null}
          </>
        }
        ListEmptyComponent={
          normalizedSearch && exactMatch ? null : (
            <Text className="px-4 py-6 text-center text-sm text-ink-500 dark:text-ink-400">
              No existing merchants match.
            </Text>
          )
        }
        renderItem={({ item: merchant }) => {
          const active = merchant.id === selectedId;

          return (
            <Pressable
              onPress={() =>
                choose({ id: merchant.id, name: merchant.name })
              }
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-ink-100 dark:bg-ink-800">
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </View>
              <Text
                numberOfLines={1}
                className={`min-w-0 flex-1 text-base ${
                  active
                    ? 'font-semibold text-mint-600 dark:text-mint-400'
                    : 'text-ink-900 dark:text-ink-50'
                }`}
              >
                {merchant.name}
              </Text>
              {active ? (
                <Ionicons name="checkmark" size={20} color={colors.accent} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={desktop}
      animationType={desktop ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      {desktop ? (
        <View className="flex-1 items-center justify-center bg-black/40 p-6">
          <Pressable
            className="absolute inset-0"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close merchant picker"
          />
          {content}
        </View>
      ) : (
        content
      )}
    </Modal>
  );
}

export function TransactionAutomationCard({
  matchDescription,
  matchCount,
  enabled,
  existingRule,
  loading = false,
  error,
  hasAction,
  onToggle,
}: {
  matchDescription: string;
  matchCount: number;
  enabled: boolean;
  existingRule: boolean;
  loading?: boolean;
  error?: string | null;
  hasAction: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { colors } = useTheme();

  return (
    <Card testID="transaction-automation-card" className="mb-5 overflow-hidden">
      <View className="flex-row items-start gap-3 p-4">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-100 dark:bg-mint-900">
          <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="min-w-0 flex-1 text-base font-semibold text-ink-900 dark:text-ink-50">
              Automate this cleanup
            </Text>
            {existingRule ? (
              <Badge label={enabled ? 'Active' : 'Paused'} tone="accent" />
            ) : null}
          </View>
          <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Match this exact bank description:
          </Text>
          <Text
            numberOfLines={2}
            className="mt-1 text-sm font-medium text-ink-700 dark:text-ink-200"
          >
            {matchDescription}
          </Text>
        </View>
      </View>

      <Divider />

      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-ink-900 dark:text-ink-50">
            Remember merchant and category
          </Text>
          <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            {loading
              ? 'Counting exact matches…'
              : `${matchCount} matching transaction${
                  matchCount === 1 ? '' : 's'
                } will be cleaned up now and future matches will follow this rule.`}
          </Text>
          {!hasAction && enabled ? (
            <Text className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Choose a merchant or category to enable automation.
            </Text>
          ) : null}
          {error ? (
            <Text
              accessibilityLiveRegion="polite"
              className="mt-1 text-sm text-negative"
            >
              {error}
            </Text>
          ) : null}
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={loading}
          trackColor={{ true: colors.accent }}
          accessibilityLabel="Remember merchant and category for exact matches"
        />
      </View>
    </Card>
  );
}

export function TransactionRuleCard({
  rule,
  merchantName,
  categoryLabel,
  confirmingDelete,
  busy,
  onToggle,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  rule: TransactionRuleRow;
  merchantName?: string;
  categoryLabel?: string;
  confirmingDelete: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Card testID={`transaction-rule-${rule.id}`} className="mb-3 overflow-hidden">
      <View className="p-4">
        <View className="flex-row items-start gap-3">
          <IconBadge
            name={rule.enabled ? 'flash' : 'pause-outline'}
            size={40}
            tone={rule.enabled ? 'accent' : 'neutral'}
          />
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                When the bank says
              </Text>
              <Badge
                label={rule.enabled ? 'Active' : 'Paused'}
                tone={rule.enabled ? 'accent' : 'neutral'}
              />
            </View>
            <Text className="mt-2 text-base font-semibold leading-5 text-ink-900 dark:text-ink-50">
              {rule.match_description}
            </Text>
          </View>
          <Switch
            value={rule.enabled}
            onValueChange={onToggle}
            disabled={busy}
            trackColor={{ true: colors.accent }}
            accessibilityLabel={`${rule.enabled ? 'Pause' : 'Enable'} rule for ${rule.match_description}`}
          />
        </View>

        <View className="mt-4 flex-row flex-wrap gap-2">
          {merchantName ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 dark:bg-ink-800">
              <Ionicons
                name="storefront-outline"
                size={14}
                color={colors.textMuted}
              />
              <Text
                numberOfLines={1}
                className="max-w-[220px] text-xs font-medium text-ink-600 dark:text-ink-300"
              >
                {merchantName}
              </Text>
            </View>
          ) : null}
          {categoryLabel ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 dark:bg-ink-800">
              <Ionicons
                name="folder-open-outline"
                size={14}
                color={colors.textMuted}
              />
              <Text
                numberOfLines={1}
                className="max-w-[220px] text-xs font-medium text-ink-600 dark:text-ink-300"
              >
                {categoryLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-4 flex-row items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800">
          <Ionicons
            name="time-outline"
            size={15}
            color={colors.textMuted}
          />
          <Text className="min-w-0 flex-1 text-xs text-ink-500 dark:text-ink-400">
              Applied to {rule.historical_application_count} historical
              transaction
              {rule.historical_application_count === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <Divider />

      {confirmingDelete ? (
        <View className="bg-red-50 p-4 dark:bg-red-950/30">
          <View className="flex-row items-center gap-3">
            <IconBadge name="trash-outline" size={38} tone="danger" />
            <Text className="min-w-0 flex-1 text-sm font-semibold text-ink-900 dark:text-ink-50">
              Delete this rule?
            </Text>
          </View>
          <Text className="mb-4 mt-1 text-sm text-ink-500 dark:text-ink-400">
            Existing transactions keep their cleanup. Future matches will no
            longer be changed.
          </Text>
          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="secondary"
              disabled={busy}
              onPress={onCancelDelete}
              className="flex-1"
            />
            <Button
              label="Delete rule"
              variant="danger"
              loading={busy}
              onPress={onDelete}
              className="flex-1"
            />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={onRequestDelete}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Delete rule for ${rule.match_description}`}
          className="flex-row items-center justify-center gap-2 px-4 py-3 hover:bg-red-50 active:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 dark:hover:bg-red-950/30 dark:active:bg-red-950/50"
        >
          <Ionicons name="trash-outline" size={16} color={colors.negative} />
          <Text className="text-center text-sm font-semibold text-negative">
            Delete rule
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

export function RuleListSkeleton() {
  return (
    <ScrollView contentContainerClassName="p-4 pb-16">
      <View className="gap-4 lg:flex-row lg:items-start">
        <Skeleton className="h-64 lg:w-[310px]" rounded="2xl" />
        <View className="min-w-0 flex-1 gap-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-52 w-full" rounded="2xl" />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
