import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { categoryTreeQuery, type CategoryRow } from '@mintea/core';

import { useClient } from '../lib/auth';
import { Loading } from './ui';

/**
 * Full-screen category chooser. Uses RN's `Modal`, which react-native-web
 * renders as an overlay, so one implementation serves all three platforms.
 */
export function CategoryPicker({
  visible,
  onClose,
  onSelect,
  selectedId,
  title = 'Choose a category',
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (category: CategoryRow) => void;
  selectedId?: string | null;
  title?: string;
}) {
  const client = useClient();
  const tree = useQuery({ ...categoryTreeQuery(client), enabled: visible });
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    if (!tree.data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return tree.data;

    return tree.data
      .map((group) => ({
        ...group,
        categories: group.categories.filter((category) =>
          category.name.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.categories.length > 0);
  }, [tree.data, search]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-ink-50 dark:bg-ink-950">
        <View className="flex-row items-center justify-between px-4 h-14 border-b border-ink-200 dark:border-ink-800">
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text className="text-base text-ink-500 dark:text-ink-400">
              Cancel
            </Text>
          </Pressable>
          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            {title}
          </Text>
          <View className="w-12" />
        </View>

        <View className="px-4 py-3">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories"
            placeholderTextColor="#A4ADB8"
            autoCapitalize="none"
            className="h-11 px-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 text-base text-ink-900 dark:text-ink-50"
          />
        </View>

        {tree.isPending ? (
          <Loading />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(group) => group.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="pb-16"
            renderItem={({ item: group }) => (
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-4 pt-5 pb-1.5">
                  {group.name}
                </Text>

                {group.categories.map((category) => {
                  const active = category.id === selectedId;

                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => {
                        onSelect(category);
                        onClose();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className="flex-row items-center px-4 py-3 gap-3 active:bg-ink-100 dark:active:bg-ink-800"
                    >
                      <Text className="text-lg">{category.icon}</Text>
                      <Text
                        className={`flex-1 text-base ${
                          active
                            ? 'font-semibold text-mint-600 dark:text-mint-400'
                            : 'text-ink-900 dark:text-ink-50'
                        }`}
                      >
                        {category.name}
                      </Text>
                      {active ? (
                        <Text className="text-mint-600 dark:text-mint-400">✓</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
