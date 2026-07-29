import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../lib/theme';
import type { SelectOption } from './FilterSheet';

export type FilterAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function DropdownShell({
  visible,
  title,
  anchor,
  width,
  height,
  onClose,
  onReset,
  children,
}: {
  visible: boolean;
  title: string;
  anchor: FilterAnchor | null;
  width: number;
  height: number;
  onClose: () => void;
  onReset?: () => void;
  children: ReactNode;
}) {
  const viewport = useWindowDimensions();

  // React Native's Modal only wires `onRequestClose` to the Android back button,
  // so on desktop web an open menu would otherwise ignore Escape.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const onKeyDown = (event: { key: string }) => {
      if (event.key === 'Escape') closeRef.current();
    };

    globalThis.addEventListener('keydown', onKeyDown as never);
    return () => globalThis.removeEventListener('keydown', onKeyDown as never);
  }, [visible]);

  if (!visible || !anchor) return null;

  const panelWidth = Math.min(width, viewport.width - 32);
  const left = Math.min(
    Math.max(16, anchor.x),
    viewport.width - panelWidth - 16,
  );
  const top = anchor.y + anchor.height + 8;
  const panelHeight = Math.min(height, Math.max(180, viewport.height - top - 16));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title} filter`}
        />

        <View
          testID={`desktop-filter-dropdown-${title.toLowerCase().replaceAll(' ', '-')}`}
          accessibilityRole="menu"
          accessibilityLabel={`${title} filter`}
          className="absolute overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-900"
          style={{
            left,
            top,
            width: panelWidth,
            height: panelHeight,
            elevation: 16,
          }}
        >
          <View className="h-12 shrink-0 flex-row items-center justify-between border-b border-ink-200 px-4 dark:border-ink-700">
            <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
              {title}
            </Text>

            {onReset ? (
              <Pressable
                onPress={onReset}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Clear ${title} filter`}
              >
                <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View className="min-h-0 flex-1">{children}</View>
        </View>
      </View>
    </Modal>
  );
}

function MultiSelectOptions({
  options,
  selected,
  onChange,
  searchPlaceholder,
  emptyLabel,
}: {
  options: SelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder: string;
  /** Shown when there is nothing to filter by at all. */
  emptyLabel: string;
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

    return [...byGroup.entries()].map(([group, data]) => ({
      title: group,
      data,
    }));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <View className="min-h-0 flex-1">
      <View className="shrink-0 px-3 py-3">
        <View className="h-10 flex-row items-center gap-2 rounded-xl border border-ink-300 bg-ink-50 px-3 dark:border-ink-700 dark:bg-ink-950">
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            className="flex-1 text-sm text-ink-900 dark:text-ink-50"
          />
        </View>
      </View>

      <SectionList
        className="min-h-0 flex-1"
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerClassName="pb-3"
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text className="px-4 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              {section.title}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          // "Nothing matches" is only true if the user actually searched;
          // with no options at all it reads as a broken search for "".
          <Text className="p-4 text-sm text-ink-500 dark:text-ink-400">
            {options.length === 0
              ? emptyLabel
              : `Nothing matches "${search.trim()}".`}
          </Text>
        }
        renderItem={({ item }) => {
          const checked = selectedSet.has(item.id);

          return (
            <Pressable
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              className="flex-row items-center gap-3 px-4 py-2.5 hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800 dark:active:bg-ink-800"
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded-md border-2 ${
                  checked
                    ? 'border-mint-600 bg-mint-600'
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
                  className="h-2.5 w-2.5 rounded-full"
                />
              ) : null}

              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-sm text-ink-900 dark:text-ink-50"
                >
                  {item.label}
                </Text>
                {item.sublabel ? (
                  <Text
                    numberOfLines={1}
                    className="text-xs text-ink-500 dark:text-ink-400"
                  >
                    {item.sublabel}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export function DesktopMultiSelectDropdown({
  visible,
  title,
  anchor,
  options,
  selected,
  onChange,
  onClose,
  searchPlaceholder = 'Search',
}: {
  visible: boolean;
  title: string;
  anchor: FilterAnchor | null;
  options: SelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
  searchPlaceholder?: string;
}) {
  // Size to the content so a four-tag list isn't a mostly empty 480px panel,
  // but measure the *unfiltered* options so the panel doesn't resize under the
  // cursor while the user types in the search box.
  const height = useMemo(() => {
    const groupHeaders = new Set(
      options.map((option) => option.group).filter(Boolean),
    ).size;
    const rowHeight = options.some((option) => option.sublabel) ? 56 : 40;
    const HEADER = 48;
    const SEARCH = 64;
    const LIST_PADDING = 12;

    return Math.min(
      480,
      Math.max(
        220,
        HEADER +
          SEARCH +
          LIST_PADDING +
          groupHeaders * 34 +
          options.length * rowHeight,
      ),
    );
  }, [options]);

  return (
    <DropdownShell
      visible={visible}
      title={title}
      anchor={anchor}
      width={380}
      height={height}
      onClose={onClose}
      onReset={selected.length > 0 ? () => onChange([]) : undefined}
    >
      <MultiSelectOptions
        options={options}
        selected={selected}
        onChange={onChange}
        searchPlaceholder={searchPlaceholder}
        emptyLabel={`No ${title.toLowerCase()} yet.`}
      />
    </DropdownShell>
  );
}

export function DesktopChoiceDropdown<T extends string>({
  visible,
  title,
  anchor,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  anchor: FilterAnchor | null;
  options: Array<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (next: T) => void;
  onClose: () => void;
}) {
  return (
    <DropdownShell
      visible={visible}
      title={title}
      anchor={anchor}
      width={300}
      height={Math.min(420, 48 + options.length * 58)}
      onClose={onClose}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
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
              className="flex-row items-center gap-3 px-4 py-3 hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800 dark:active:bg-ink-800"
            >
              <View className="min-w-0 flex-1">
                <Text
                  className={`text-sm ${
                    active
                      ? 'font-semibold text-mint-600 dark:text-mint-400'
                      : 'text-ink-900 dark:text-ink-50'
                  }`}
                >
                  {option.label}
                </Text>
                {option.description ? (
                  <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {option.description}
                  </Text>
                ) : null}
              </View>

              {active ? (
                <Ionicons name="checkmark" size={18} color="#1FA678" />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </DropdownShell>
  );
}

export function DesktopAmountDropdown({
  visible,
  anchor,
  min,
  max,
  onChange,
  onClose,
}: {
  visible: boolean;
  anchor: FilterAnchor | null;
  min: string;
  max: string;
  onChange: (next: { min: string; max: string }) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <DropdownShell
      visible={visible}
      title="Amount"
      anchor={anchor}
      width={360}
      height={196}
      onClose={onClose}
      onReset={min || max ? () => onChange({ min: '', max: '' }) : undefined}
    >
      <View className="flex-1 p-4">
        <View className="flex-row items-end gap-3">
          <View className="flex-1">
            <Text className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">
              At least
            </Text>
            <TextInput
              value={min}
              onChangeText={(nextMin) => onChange({ min: nextMin, max })}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
            />
          </View>

          <Text className="pb-2.5 text-ink-400">–</Text>

          <View className="flex-1">
            <Text className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">
              At most
            </Text>
            <TextInput
              value={max}
              onChangeText={(nextMax) => onChange({ min, max: nextMax })}
              placeholder="Any"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
            />
          </View>
        </View>

        <Text className="mt-3 text-xs leading-4 text-ink-400 dark:text-ink-500">
          Uses the transaction size, regardless of whether money moved in or out.
        </Text>
      </View>
    </DropdownShell>
  );
}
