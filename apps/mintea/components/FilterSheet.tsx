import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
  type View as NativeView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../lib/theme';

/**
 * Filter controls for the transaction list.
 *
 * Every filter is a chip that summarises its own state and opens a sheet. The
 * previous design rendered one chip per account inline, which for a household
 * with 45 accounts buried the list under several screens of chips.
 */

export const FilterChip = forwardRef<
  NativeView,
  {
  label: string;
  active: boolean;
  onPress: () => void;
  showChevron?: boolean;
  testID?: string;
  }
>(function FilterChip(
  { label, active, onPress, showChevron = true, testID },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full border shrink-0 ${
        active
          ? 'bg-mint-600 border-mint-600'
          : 'bg-white dark:bg-ink-900 border-ink-300 dark:border-ink-700'
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-ink-600 dark:text-ink-300'
        }`}
      >
        {label}
      </Text>
      {showChevron ? (
        <Ionicons
          name="chevron-down"
          size={13}
          color={active ? '#FFFFFF' : '#74808E'}
        />
      ) : null}
    </Pressable>
  );
});

/** Modal shell shared by every filter sheet. */
function Sheet({
  visible,
  title,
  onClose,
  onReset,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-ink-50 dark:bg-ink-950">
        <View className="flex-row items-center justify-between px-4 h-14 border-b border-ink-200 dark:border-ink-800">
          <Pressable onPress={onReset} disabled={!onReset} hitSlop={8}>
            <Text
              className={`text-base ${
                onReset
                  ? 'text-ink-500 dark:text-ink-400'
                  : 'text-transparent'
              }`}
            >
              Reset
            </Text>
          </Pressable>

          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            {title}
          </Text>

          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text className="text-base font-semibold text-mint-600 dark:text-mint-400">
              Done
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 w-full max-w-3xl self-center">{children}</View>
      </View>
    </Modal>
  );
}

export type SelectOption = {
  id: string;
  label: string;
  sublabel?: string;
  /** Section heading; options sharing a group are listed together. */
  group?: string;
  /** Colour dot shown before the label, so tags read the same here as on a row. */
  swatch?: string;
};

/**
 * Searchable multi-select. Selecting nothing means "no filter" rather than
 * "match nothing", which is what makes an empty state safe to leave.
 */
export function MultiSelectSheet({
  visible,
  title,
  options,
  selected,
  onChange,
  onClose,
  searchPlaceholder = 'Search',
}: {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
  searchPlaceholder?: string;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matching = term
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(term) ||
            option.sublabel?.toLowerCase().includes(term),
        )
      : options;

    const byGroup = new Map<string, SelectOption[]>();
    for (const option of matching) {
      const key = option.group ?? '';
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(option);
      else byGroup.set(key, [option]);
    }

    return [...byGroup.entries()].map(([group, data]) => ({ title: group, data }));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      onReset={selected.length > 0 ? () => onChange([]) : undefined}
    >
      <View className="px-4 py-3">
        <View className="flex-row items-center bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 rounded-xl h-11 px-3 gap-2">
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            className="flex-1 text-base text-ink-900 dark:text-ink-50"
          />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerClassName="pb-16"
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-4 pt-5 pb-1.5">
              {section.title}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <Text className="text-sm text-ink-500 dark:text-ink-400 p-4">
            Nothing matches "{search}".
          </Text>
        }
        renderItem={({ item }) => {
          const checked = selectedSet.has(item.id);

          return (
            <Pressable
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              className="flex-row items-center gap-3 px-4 py-3 active:bg-ink-100 dark:active:bg-ink-800"
            >
              <View
                className={`w-5 h-5 rounded-md border-2 items-center justify-center ${
                  checked
                    ? 'bg-mint-600 border-mint-600'
                    : 'border-ink-300 dark:border-ink-600'
                }`}
              >
                {checked ? (
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                ) : null}
              </View>

              {item.swatch ? (
                <View
                  style={{ backgroundColor: item.swatch }}
                  className="w-2.5 h-2.5 rounded-full"
                />
              ) : null}

              <View className="flex-1 min-w-0">
                <Text
                  numberOfLines={1}
                  className="text-base text-ink-900 dark:text-ink-50"
                >
                  {item.label}
                </Text>
                {item.sublabel ? (
                  <Text
                    numberOfLines={1}
                    className="text-sm text-ink-500 dark:text-ink-400"
                  >
                    {item.sublabel}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

/** Single-choice sheet, for mutually exclusive filters like direction. */
export function ChoiceSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Array<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (next: T) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <ScrollView contentContainerClassName="pb-16">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              className="flex-row items-center gap-3 px-4 py-3.5 active:bg-ink-100 dark:active:bg-ink-800"
            >
              <View className="flex-1">
                <Text
                  className={`text-base ${
                    active
                      ? 'font-semibold text-mint-600 dark:text-mint-400'
                      : 'text-ink-900 dark:text-ink-50'
                  }`}
                >
                  {option.label}
                </Text>
                {option.description ? (
                  <Text className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
                    {option.description}
                  </Text>
                ) : null}
              </View>
              {active ? (
                <Ionicons name="checkmark" size={20} color="#1FA678" />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

/** Min/max amount, matched on magnitude so it covers income and spending. */
export function AmountSheet({
  visible,
  min,
  max,
  onChange,
  onClose,
}: {
  visible: boolean;
  min: string;
  max: string;
  onChange: (next: { min: string; max: string }) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Sheet
      visible={visible}
      title="Amount"
      onClose={onClose}
      onReset={min || max ? () => onChange({ min: '', max: '' }) : undefined}
    >
      <View className="p-4">
        <View className="flex-row items-end gap-3">
          <View className="flex-1">
            <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
              At least
            </Text>
            <TextInput
              value={min}
              onChangeText={(value) => onChange({ min: value, max })}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="h-12 px-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 text-base text-ink-900 dark:text-ink-50"
            />
          </View>

          <Text className="text-ink-400 pb-3">–</Text>

          <View className="flex-1">
            <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
              At most
            </Text>
            <TextInput
              value={max}
              onChangeText={(value) => onChange({ min, max: value })}
              placeholder="Any"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="h-12 px-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 text-base text-ink-900 dark:text-ink-50"
            />
          </View>
        </View>

        <Text className="text-xs text-ink-400 dark:text-ink-500 mt-3 leading-5">
          Matched on size, ignoring direction — "at least 20" finds both a $20
          expense and $20 of income.
        </Text>
      </View>
    </Sheet>
  );
}
