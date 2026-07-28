import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoryTreeQuery,
  createCategory,
  deleteCategory,
  profileQuery,
  updateCategory,
  type CategoryRow,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import {
  Button,
  Card,
  Divider,
  ErrorNotice,
  Loading,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';
import { CategoryPicker } from '../../components/CategoryPicker';

/**
 * Category management. Renaming and re-icon-ing happen inline; deleting asks
 * where the existing transactions should go, because silently orphaning a
 * year of history is the kind of thing you only forgive once.
 */
function Categories() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const tree = useQuery(categoryTreeQuery(client));
  const profile = useQuery(profileQuery(client));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState('');
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (category: CategoryRow) =>
      updateCategory(client, category.id, {
        name: draftName.trim() || category.name,
        icon: draftIcon.trim() || category.icon,
      }),
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not rename'),
  });

  const add = useMutation({
    mutationFn: (groupId: string) => {
      if (!profile.data) throw new Error('Profile not loaded yet');

      return createCategory(client, {
        householdId: profile.data.household_id,
        groupId,
        name: newName.trim(),
      });
    },
    onSuccess: async () => {
      setAddingToGroup(null);
      setNewName('');
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not add'),
  });

  const remove = useMutation({
    mutationFn: ({
      category,
      reassignTo,
    }: {
      category: CategoryRow;
      reassignTo: string | null;
    }) => deleteCategory(client, category.id, reassignTo),
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not delete'),
  });

  if (tree.isPending) return <Loading />;

  return (
    <Screen>
      <ModalHeader title="Categories" onClose={() => router.back()} />

      <ScrollView contentContainerClassName="pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        {deleting ? (
          <Card className="m-4 p-4 border-red-300 dark:border-red-900">
            <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
              Delete "{deleting.name}"?
            </Text>
            <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
              Choose where its existing transactions should go. They keep their
              amounts and dates either way.
            </Text>

            <View className="gap-3">
              <Button
                label="Move them to another category…"
                variant="secondary"
                onPress={() => setReassigning(true)}
              />
              <Button
                label="Leave them uncategorized"
                variant="secondary"
                onPress={() =>
                  remove.mutate({ category: deleting, reassignTo: null })
                }
              />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setDeleting(null)}
              />
            </View>
          </Card>
        ) : null}

        {tree.data?.map((group) => (
          <View key={group.id} className="mt-5">
            <View className="flex-row items-center justify-between px-5 mb-2">
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {group.name}
              </Text>
              <Pressable
                onPress={() => {
                  setAddingToGroup(
                    addingToGroup === group.id ? null : group.id,
                  );
                  setNewName('');
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                  + Add
                </Text>
              </Pressable>
            </View>

            <Card className="mx-4 overflow-hidden">
              {addingToGroup === group.id ? (
                <View className="p-3 flex-row gap-2 items-center">
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Category name"
                    placeholderTextColor="#A4ADB8"
                    autoFocus
                    onSubmitEditing={() => newName.trim() && add.mutate(group.id)}
                    className="flex-1 h-11 px-3 rounded-lg bg-ink-50 dark:bg-ink-800 text-base text-ink-900 dark:text-ink-50"
                  />
                  <Pressable
                    onPress={() => newName.trim() && add.mutate(group.id)}
                    accessibilityRole="button"
                    className="px-3 py-2"
                  >
                    <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                      Save
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {group.categories.map((category, index) => (
                <View key={category.id}>
                  {index > 0 || addingToGroup === group.id ? <Divider /> : null}

                  {editingId === category.id ? (
                    <View className="p-3 flex-row gap-2 items-center">
                      <TextInput
                        value={draftIcon}
                        onChangeText={setDraftIcon}
                        className="w-12 h-11 rounded-lg bg-ink-50 dark:bg-ink-800 text-center text-lg"
                        maxLength={4}
                      />
                      <TextInput
                        value={draftName}
                        onChangeText={setDraftName}
                        autoFocus
                        onSubmitEditing={() => rename.mutate(category)}
                        className="flex-1 h-11 px-3 rounded-lg bg-ink-50 dark:bg-ink-800 text-base text-ink-900 dark:text-ink-50"
                      />
                      <Pressable
                        onPress={() => rename.mutate(category)}
                        accessibilityRole="button"
                        className="px-2 py-2"
                      >
                        <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                          Save
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setEditingId(null)}
                        accessibilityRole="button"
                        className="px-2 py-2"
                      >
                        <Text className="text-sm text-ink-500">Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="flex-row items-center px-4 py-3 gap-3">
                      <Text className="text-lg">{category.icon}</Text>
                      <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
                        {category.name}
                      </Text>

                      <Pressable
                        onPress={() => {
                          setEditingId(category.id);
                          setDraftName(category.name);
                          setDraftIcon(category.icon);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${category.name}`}
                        hitSlop={8}
                        className="px-2"
                      >
                        <Text className="text-sm text-ink-500 dark:text-ink-400">
                          Edit
                        </Text>
                      </Pressable>

                      {/* System categories are load-bearing — ingest falls back
                          to "Uncategorized", transfers need "Transfer". */}
                      {category.is_system ? null : (
                        <Pressable
                          onPress={() => {
                            setError(null);
                            setDeleting(category);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${category.name}`}
                          hitSlop={8}
                          className="px-2"
                        >
                          <Text className="text-sm text-negative">Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ))}

              {group.categories.length === 0 && addingToGroup !== group.id ? (
                <Text className="text-sm text-ink-400 dark:text-ink-500 p-4">
                  No categories in this group.
                </Text>
              ) : null}
            </Card>
          </View>
        ))}
      </ScrollView>

      <CategoryPicker
        visible={reassigning}
        onClose={() => setReassigning(false)}
        title="Move transactions to"
        onSelect={(target) => {
          if (deleting) {
            remove.mutate({ category: deleting, reassignTo: target.id });
          }
          setReassigning(false);
        }}
      />
    </Screen>
  );
}

export default function CategoriesRoute() {
  return (
    <RequireAuth>
      <Categories />
    </RequireAuth>
  );
}
