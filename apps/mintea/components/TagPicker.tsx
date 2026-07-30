import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTag,
  describeTagNameProblem,
  normalizeTagName,
  profileQuery,
  tagColor,
  tagsQuery,
  validateTagName,
  type TagRow,
} from '@mintea/core';

import { useClient } from '../lib/auth';
import { useTheme } from '../lib/theme';

/**
 * Chooses which tags a transaction carries, and creates new ones inline.
 *
 * Creating from here matters: tagging is a cleanup activity, and forcing a
 * detour to Settings to define a tag before using it is what makes tagging
 * features go unused.
 */
export function TagPicker({
  visible,
  selected,
  onChange,
  onClose,
}: {
  visible: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const client = useClient();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const tags = useQuery({ ...tagsQuery(client), enabled: visible });
  const profile = useQuery({ ...profileQuery(client), enabled: visible });

  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => tags.data ?? [], [tags.data]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matching = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((tag) => tag.name.toLowerCase().includes(term));
  }, [all, search]);

  const normalized = normalizeTagName(search);
  const problem = normalized ? validateTagName(search, all) : null;
  // Offer creation only when the typed name is new and valid — an exact
  // existing match should select it, not offer a duplicate.
  const canCreate = normalized !== null && problem === null;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      if (!normalized) throw new Error('Enter a tag name');

      return createTag(client, {
        householdId: profile.data.household_id,
        name: normalized,
      });
    },
    onSuccess: async (tag: TagRow) => {
      setSearch('');
      setError(null);
      onChange([...selected, tag.id]);
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not create that tag',
      ),
  });

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-ink-50 dark:bg-ink-950">
        <View className="flex-row items-center justify-between px-4 h-14 border-b border-ink-200 dark:border-ink-800">
          <Pressable
            onPress={() => onChange([])}
            disabled={selected.length === 0}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text
              className={`text-base ${
                selected.length > 0
                  ? 'text-ink-500 dark:text-ink-400'
                  : 'text-transparent'
              }`}
            >
              Clear
            </Text>
          </Pressable>

          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
            Tags
          </Text>

          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text className="text-base font-semibold text-mint-600 dark:text-mint-400">
              Done
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 w-full max-w-3xl self-center">
          <View className="px-4 py-3">
            <View className="flex-row items-center bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 rounded-xl h-11 px-3 gap-2">
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setError(null);
                }}
                placeholder="Search or create a tag"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                accessibilityLabel="Search or create a tag"
                className="flex-1 text-base text-ink-900 dark:text-ink-50"
              />
              {search ? (
                <Pressable
                  onPress={() => setSearch('')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>

            {problem && normalized ? (
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-2">
                {describeTagNameProblem(problem)}
              </Text>
            ) : null}

            {error ? (
              <Text className="text-sm text-negative mt-2">{error}</Text>
            ) : null}
          </View>

          {tags.isPending ? (
            <View className="py-10">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="pb-16"
            >
              {canCreate ? (
                <Pressable
                  onPress={() => create.mutate()}
                  disabled={create.isPending}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 px-4 py-3.5 active:bg-ink-100 dark:active:bg-ink-800"
                >
                  <Ionicons name="add-circle" size={22} color={colors.accent} />
                  <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
                    Create{' '}
                    <Text className="font-semibold">"{normalized}"</Text>
                  </Text>
                  {create.isPending ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : null}
                </Pressable>
              ) : null}

              {matching.length === 0 && !canCreate ? (
                <Text className="text-sm text-ink-500 dark:text-ink-400 px-4 py-6 text-center">
                  {all.length === 0
                    ? 'No tags yet. Type a name above to create your first one.'
                    : `Nothing matches "${search.trim()}".`}
                </Text>
              ) : null}

              {matching.map((tag) => {
                const checked = selectedSet.has(tag.id);

                return (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggle(tag.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    aria-checked={checked}
                    accessibilityLabel={tag.name}
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

                    <View
                      style={{ backgroundColor: tagColor(tag) }}
                      className="w-2.5 h-2.5 rounded-full"
                    />

                    <Text
                      numberOfLines={1}
                      className="flex-1 text-base text-ink-900 dark:text-ink-50"
                    >
                      {tag.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
