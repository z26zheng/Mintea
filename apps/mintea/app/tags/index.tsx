import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTag,
  deleteTag,
  describeTagNameProblem,
  normalizeTagName,
  profileQuery,
  tagColor,
  tagsWithUsageQuery,
  updateTag,
  validateTagName,
  DEFAULT_TAG_COLOR,
  TAG_COLORS,
  type TagWithUsage,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import { useBreakpoint } from '../../lib/breakpoints';
import { useDismiss } from '../../lib/useDismiss';
import { useTheme } from '../../lib/theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  IconBadge,
  IconButton,
  Loading,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';

/** Swatch row shared by the create and rename forms. */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View
      className="flex-row flex-wrap gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel="Tag colour"
    >
      {TAG_COLORS.map((color) => {
        const active = color === value;

        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`Colour ${color}`}
            className={`h-10 w-10 items-center justify-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
              active
                ? 'border-ink-900 dark:border-ink-50'
                : 'border-transparent hover:border-ink-300 dark:hover:border-ink-600'
            }`}
          >
            <View
              style={{ backgroundColor: color }}
              className="h-7 w-7 items-center justify-center rounded-full"
            >
              {active ? (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Tags() {
  const client = useClient();
  const queryClient = useQueryClient();
  const dismiss = useDismiss('/(tabs)/settings');
  const { colors } = useTheme();
  const { isLarge } = useBreakpoint();

  const tags = useQuery(tagsWithUsageQuery(client));
  const profile = useQuery(profileQuery(client));

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [deleting, setDeleting] = useState<TagWithUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = tags.data ?? [];
  const usedTags = all.filter((tag) => tag.transactionCount > 0).length;
  const totalAssignments = all.reduce(
    (total, tag) => total + tag.transactionCount,
    0,
  );

  const newProblem = newName.trim() ? validateTagName(newName, all) : null;
  const canCreate = normalizeTagName(newName) !== null && newProblem === null;

  const draftProblem =
    editingId && draftName.trim()
      ? validateTagName(draftName, all, editingId)
      : null;
  const canSaveDraft =
    normalizeTagName(draftName) !== null && draftProblem === null;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    ]);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      const name = normalizeTagName(newName);
      if (!name) throw new Error('Enter a tag name');

      return createTag(client, {
        householdId: profile.data.household_id,
        name,
        color: newColor,
      });
    },
    onSuccess: async () => {
      setNewName('');
      setNewColor(DEFAULT_TAG_COLOR);
      setError(null);
      await refresh();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not create'),
  });

  const rename = useMutation({
    mutationFn: async () => {
      const name = normalizeTagName(draftName);
      if (!editingId || !name) throw new Error('Enter a tag name');

      return updateTag(client, editingId, { name, color: draftColor });
    },
    onSuccess: async () => {
      setEditingId(null);
      setError(null);
      await refresh();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
  });

  const remove = useMutation({
    mutationFn: (tag: TagWithUsage) => deleteTag(client, tag.id),
    onSuccess: async () => {
      setDeleting(null);
      setError(null);
      await refresh();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not delete'),
  });

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Tags"
        subtitle="Add flexible labels across categories and accounts"
        onClose={dismiss}
      />

      <ScrollView
        contentContainerClassName="pb-16"
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorNotice message={error} /> : null}

        <View
          className={`gap-4 p-4 ${isLarge ? 'flex-row items-start' : ''}`}
        >
          <View className={isLarge ? 'w-[340px] shrink-0 gap-4' : 'gap-4'}>
            <Card className="overflow-hidden p-4">
              <View className="mb-4 flex-row items-center gap-3">
                <IconBadge name="pricetag-outline" size={42} />
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                    Create a tag
                  </Text>
                  <Text className="mt-0.5 text-xs leading-4 text-ink-500 dark:text-ink-400">
                    Use tags for projects, trips, taxes, or reimbursements.
                  </Text>
                </View>
              </View>

              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Name
              </Text>
              <TextInput
                value={newName}
                onChangeText={(value) => {
                  setNewName(value);
                  setError(null);
                }}
                placeholder="Tax deductible"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                accessibilityLabel="New tag name"
                onSubmitEditing={() => canCreate && create.mutate()}
                className="h-12 rounded-xl border border-ink-300 bg-white px-4 text-base text-ink-900 focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
              />

              {newProblem ? (
                <Text className="mt-2 text-sm text-negative">
                  {describeTagNameProblem(newProblem)}
                </Text>
              ) : null}

              <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Colour
              </Text>
              <ColorPicker value={newColor} onChange={setNewColor} />

              <Button
                label={create.isPending ? 'Adding…' : 'Add tag'}
                onPress={() => create.mutate()}
                disabled={!canCreate || create.isPending}
                className="mt-5"
              />
            </Card>

            <Card className="p-4">
              <View className="flex-row items-center gap-3">
                <IconBadge name="analytics-outline" size={38} tone="neutral" />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    Tag coverage
                  </Text>
                  <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {usedTags} of {all.length} used ·{' '}
                    {totalAssignments.toLocaleString()} assignments
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View className={isLarge ? 'min-w-0 flex-1' : ''}>
            <View className="mb-3 flex-row items-end justify-between gap-3 px-1">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                  Your tags
                </Text>
                <Text className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
                  Cross-category labels
                </Text>
              </View>
              {!tags.isPending ? (
                <Text className="text-sm tabular-nums text-ink-500 dark:text-ink-400">
                  {all.length} total
                </Text>
              ) : null}
            </View>

            {tags.isPending ? (
              <Loading label="Loading tags…" />
            ) : tags.isError ? (
              <ErrorNotice
                message={tags.error.message}
                onRetry={() => tags.refetch()}
              />
            ) : all.length === 0 ? (
              <Card className="overflow-hidden">
                <EmptyState
                  icon="🏷️"
                  title="No tags yet"
                  message="Create a tag to group related activity without changing its category."
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                {all.map((tag, index) => (
                  <View key={tag.id}>
                    {index > 0 ? <Divider /> : null}

                    {deleting?.id === tag.id ? (
                      // Confirm in place. A panel pinned to the top of the list
                      // would scroll out of view for any tag below the fold.
                      <View className="bg-red-50 p-4 dark:bg-red-950/30">
                        <View className="flex-row items-center gap-3">
                          <IconBadge
                            name="trash-outline"
                            size={38}
                            tone="danger"
                          />
                          <Text className="min-w-0 flex-1 text-base font-semibold text-ink-900 dark:text-ink-50">
                            Delete "{tag.name}"?
                          </Text>
                        </View>
                        <Text className="mb-4 mt-3 text-sm leading-5 text-ink-500 dark:text-ink-400">
                          {tag.transactionCount === 0
                            ? "It isn't used on any transactions."
                            : `It will be removed from ${tag.transactionCount} transaction${
                                tag.transactionCount === 1 ? '' : 's'
                              }. The transactions themselves are kept.`}
                        </Text>
                        <View className="flex-row gap-3">
                          <Button
                            label="Cancel"
                            variant="secondary"
                            onPress={() => setDeleting(null)}
                            className="flex-1"
                          />
                          <Button
                            label={remove.isPending ? 'Deleting…' : 'Delete'}
                            variant="danger"
                            disabled={remove.isPending}
                            onPress={() => remove.mutate(tag)}
                            className="flex-1"
                          />
                        </View>
                      </View>
                    ) : editingId === tag.id ? (
                      <View className="bg-ink-50/80 p-4 dark:bg-ink-800/40">
                        <View className="mb-3 flex-row items-center gap-3">
                          <View
                            style={{ backgroundColor: draftColor }}
                            className="h-10 w-10 items-center justify-center rounded-xl"
                          >
                            <Ionicons
                              name="pricetag"
                              size={18}
                              color="#FFFFFF"
                            />
                          </View>
                          <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                            Edit tag
                          </Text>
                        </View>
                        <TextInput
                          value={draftName}
                          onChangeText={setDraftName}
                          autoFocus
                          accessibilityLabel={`Rename ${tag.name}`}
                          onSubmitEditing={() =>
                            canSaveDraft && rename.mutate()
                          }
                          className="h-12 rounded-xl border border-ink-300 bg-white px-4 text-base text-ink-900 focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                        />

                        {draftProblem ? (
                          <Text className="mt-2 text-sm text-negative">
                            {describeTagNameProblem(draftProblem)}
                          </Text>
                        ) : null}

                        <View className="mt-3">
                          <ColorPicker
                            value={draftColor}
                            onChange={setDraftColor}
                          />
                        </View>

                        <View className="mt-4 flex-row gap-3">
                          <Button
                            label="Cancel"
                            variant="secondary"
                            onPress={() => setEditingId(null)}
                            className="flex-1"
                          />
                          <Button
                            label={rename.isPending ? 'Saving…' : 'Save'}
                            onPress={() => rename.mutate()}
                            disabled={!canSaveDraft || rename.isPending}
                            className="flex-1"
                          />
                        </View>
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-3 px-4 py-3">
                        <View
                          style={{ backgroundColor: tagColor(tag) }}
                          className="h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        >
                          <Ionicons
                            name="pricetag"
                            size={18}
                            color="#FFFFFF"
                          />
                        </View>

                        <View className="min-w-0 flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-base font-medium text-ink-900 dark:text-ink-50"
                          >
                            {tag.name}
                          </Text>
                          <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                            {tag.transactionCount === 0
                              ? 'Not used yet'
                              : `${tag.transactionCount} transaction${
                                  tag.transactionCount === 1 ? '' : 's'
                                }`}
                          </Text>
                        </View>

                        <IconButton
                          name="pencil-outline"
                          label={`Edit ${tag.name}`}
                          onPress={() => {
                            setEditingId(tag.id);
                            setDraftName(tag.name);
                            setDraftColor(tagColor(tag));
                            setError(null);
                          }}
                        />

                        <IconButton
                          name="trash-outline"
                          label={`Delete ${tag.name}`}
                          tone="danger"
                          onPress={() => {
                            setDeleting(tag);
                            setError(null);
                          }}
                        />
                      </View>
                    )}
                  </View>
                ))}
              </Card>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function TagsRoute() {
  return (
    <RequireAuth>
      <Tags />
    </RequireAuth>
  );
}
