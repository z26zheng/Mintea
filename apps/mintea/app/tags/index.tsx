import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import { useDismiss } from '../../lib/useDismiss';
import { useTheme } from '../../lib/theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
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
    <View className="flex-row flex-wrap gap-2">
      {TAG_COLORS.map((color) => {
        const active = color === value;

        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Colour ${color}`}
            className={`w-8 h-8 rounded-full items-center justify-center border-2 ${
              active ? 'border-ink-900 dark:border-ink-50' : 'border-transparent'
            }`}
          >
            <View
              style={{ backgroundColor: color }}
              className="w-6 h-6 rounded-full"
            />
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
    <Screen>
      <ModalHeader title="Tags" onClose={dismiss} />

      <ScrollView
        contentContainerClassName="pb-16"
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorNotice message={error} /> : null}

        {/* ------------------------------------------------------- create */}
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-5 pt-5 pb-2">
          New tag
        </Text>
        <Card className="mx-4 p-4">
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
            className="h-12 px-4 rounded-xl bg-ink-50 dark:bg-ink-800 text-base text-ink-900 dark:text-ink-50"
          />

          {newProblem ? (
            <Text className="text-sm text-negative mt-2">
              {describeTagNameProblem(newProblem)}
            </Text>
          ) : null}

          <View className="mt-4">
            <ColorPicker value={newColor} onChange={setNewColor} />
          </View>

          <Button
            label={create.isPending ? 'Adding…' : 'Add tag'}
            onPress={() => create.mutate()}
            disabled={!canCreate || create.isPending}
            className="mt-4"
          />
        </Card>

        {/* -------------------------------------------------------- list */}
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-5 pt-8 pb-2">
          Your tags
        </Text>

        {tags.isPending ? (
          <Loading label="Loading tags…" />
        ) : tags.isError ? (
          <ErrorNotice
            message={tags.error.message}
            onRetry={() => tags.refetch()}
          />
        ) : all.length === 0 ? (
          <EmptyState
            icon="🏷️"
            title="No tags yet"
            message="Tags cut across categories — things like reimbursable, tax deductible, or a trip name."
          />
        ) : (
          <Card className="mx-4 overflow-hidden">
            {all.map((tag, index) => (
              <View key={tag.id}>
                {index > 0 ? <Divider /> : null}

                {deleting?.id === tag.id ? (
                  // Confirm in place. A panel pinned to the top of the list
                  // would scroll out of view for any tag below the fold, so
                  // pressing Delete would look like nothing happened.
                  <View className="p-4 bg-red-50 dark:bg-red-950/30">
                    <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                      Delete "{tag.name}"?
                    </Text>
                    <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
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
                  <View className="p-4">
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      autoFocus
                      accessibilityLabel={`Rename ${tag.name}`}
                      onSubmitEditing={() => canSaveDraft && rename.mutate()}
                      className="h-11 px-3 rounded-lg bg-ink-50 dark:bg-ink-800 text-base text-ink-900 dark:text-ink-50"
                    />

                    {draftProblem ? (
                      <Text className="text-sm text-negative mt-2">
                        {describeTagNameProblem(draftProblem)}
                      </Text>
                    ) : null}

                    <View className="mt-3">
                      <ColorPicker value={draftColor} onChange={setDraftColor} />
                    </View>

                    <View className="flex-row gap-3 mt-4">
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
                  <View className="flex-row items-center px-4 py-3 gap-3">
                    <View
                      style={{ backgroundColor: tagColor(tag) }}
                      className="w-3 h-3 rounded-full"
                    />

                    <View className="flex-1 min-w-0">
                      <Text
                        numberOfLines={1}
                        className="text-base text-ink-900 dark:text-ink-50"
                      >
                        {tag.name}
                      </Text>
                      <Text className="text-sm text-ink-500 dark:text-ink-400">
                        {tag.transactionCount === 0
                          ? 'Not used yet'
                          : `${tag.transactionCount} transaction${
                              tag.transactionCount === 1 ? '' : 's'
                            }`}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        setEditingId(tag.id);
                        setDraftName(tag.name);
                        setDraftColor(tagColor(tag));
                        setError(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${tag.name}`}
                      hitSlop={8}
                      className="px-2"
                    >
                      <Text className="text-sm text-ink-500 dark:text-ink-400">
                        Edit
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setDeleting(tag);
                        setError(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${tag.name}`}
                      hitSlop={8}
                      className="px-2"
                    >
                      <Text className="text-sm text-negative">Delete</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </Card>
        )}
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
