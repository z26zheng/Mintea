import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoryGroupsQuery,
  categoryTreeQuery,
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  describeGroupNameProblem,
  destinationsFor,
  moveInOrder,
  normalizeGroupName,
  profileQuery,
  reorderCategoryGroups,
  updateCategory,
  updateCategoryGroup,
  validateGroupName,
  type CategoryGroupRow,
  type CategoryRow,
  type CategoryType,
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
import { useDismiss } from '../../lib/useDismiss';
import { CategoryPicker } from '../../components/CategoryPicker';

const GROUP_TYPES: Array<{ value: CategoryType; label: string }> = [
  { value: 'expense', label: 'Spending' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

/**
 * Category management. Renaming and re-icon-ing happen inline; deleting asks
 * where the existing transactions should go, because silently orphaning a
 * year of history is the kind of thing you only forgive once.
 */
function Categories() {
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/settings');
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
  const [notice, setNotice] = useState<string | null>(null);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupDraftName, setGroupDraftName] = useState('');
  const [groupDraftType, setGroupDraftType] = useState<CategoryType>('expense');
  const [deletingGroup, setDeletingGroup] = useState<CategoryGroupRow | null>(null);
  const [moveToGroupId, setMoveToGroupId] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<CategoryType>('expense');

  const groups = useQuery(categoryGroupsQuery(client));
  const allGroups = groups.data ?? [];

  const groupNameProblem =
    editingGroupId && groupDraftName.trim()
      ? validateGroupName(groupDraftName, allGroups, editingGroupId)
      : null;

  const newGroupProblem = newGroupName.trim()
    ? validateGroupName(newGroupName, allGroups)
    : null;

  const refreshAll = () => queryClient.invalidateQueries();

  const addGroup = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      const name = normalizeGroupName(newGroupName);
      if (!name) throw new Error('Enter a group name');

      return createCategoryGroup(client, {
        householdId: profile.data.household_id,
        name,
        type: newGroupType,
        // One past the highest position, not the count: deleting a group
        // leaves a gap, after which the count collides with an existing row
        // and two groups share an order, making their sequence undefined.
        displayOrder:
          allGroups.reduce((max, group) => Math.max(max, group.display_order), -1) + 1,
      });
    },
    onSuccess: async () => {
      setAddingGroup(false);
      setNewGroupName('');
      setNewGroupType('expense');
      setError(null);
      await refreshAll();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not add group'),
  });

  const renameGroup = useMutation({
    mutationFn: async (id: string) => {
      const name = normalizeGroupName(groupDraftName);
      if (!name) throw new Error('Enter a group name');
      return updateCategoryGroup(client, id, { name, type: groupDraftType });
    },
    onSuccess: async () => {
      setEditingGroupId(null);
      setError(null);
      await refreshAll();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not save group'),
  });

  const removeGroup = useMutation({
    mutationFn: (group: CategoryGroupRow) =>
      deleteCategoryGroup(client, group.id, moveToGroupId),
    onSuccess: async (moved: number) => {
      setDeletingGroup(null);
      setMoveToGroupId(null);
      setError(null);
      await refreshAll();
      if (moved > 0) {
        setNotice(
          `Moved ${moved} categor${moved === 1 ? 'y' : 'ies'} and removed the group.`,
        );
      }
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not remove group'),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderCategoryGroups(client, orderedIds),
    onSuccess: refreshAll,
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not reorder'),
  });

  const groupCategoryCount = (groupId: string) =>
    (tree.data ?? []).find((group) => group.id === groupId)?.categories.length ?? 0;

  const moveGroup = (from: number, to: number) => {
    const current = (tree.data ?? []).map((group) => group.id);
    const next = moveInOrder(current, from, to);
    // moveInOrder returns the same array when the move is a no-op, so an
    // arrow at either end does not fire a pointless write.
    if (next !== current) reorder.mutate(next);
  };

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
      <ModalHeader title="Categories" onClose={() => dismiss()} />

      <ScrollView contentContainerClassName="pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        {notice ? (
          <Card className="m-4 p-3">
            <Text className="text-sm text-ink-700 dark:text-ink-200">{notice}</Text>
          </Card>
        ) : null}

        {deletingGroup ? (
          <Card className="m-4 p-4 border-red-300 dark:border-red-900">
            <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
              Delete "{deletingGroup.name}"?
            </Text>

            {groupCategoryCount(deletingGroup.id) === 0 ? (
              <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
                It has no categories, so nothing else changes.
              </Text>
            ) : (
              <>
                <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                  It holds {groupCategoryCount(deletingGroup.id)} categor
                  {groupCategoryCount(deletingGroup.id) === 1 ? 'y' : 'ies'}.
                  They move to another group, keeping every transaction
                  categorised exactly as it is now.
                </Text>

                <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Move them to
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {destinationsFor(allGroups, deletingGroup.id).map((option) => (
                    <Pressable
                      key={option.id}
                      onPress={() => setMoveToGroupId(option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: moveToGroupId === option.id }}
                      className={`rounded-full border px-3 py-1.5 ${
                        moveToGroupId === option.id
                          ? 'border-mint-600 bg-mint-600'
                          : 'border-ink-300 dark:border-ink-700'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          moveToGroupId === option.id
                            ? 'text-white'
                            : 'text-ink-600 dark:text-ink-300'
                        }`}
                      >
                        {option.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View className="h-4" />
              </>
            )}

            <View className="flex-row gap-3">
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setDeletingGroup(null);
                  setMoveToGroupId(null);
                }}
                className="flex-1"
              />
              <Button
                label={removeGroup.isPending ? 'Removing…' : 'Delete group'}
                variant="danger"
                disabled={
                  removeGroup.isPending ||
                  (groupCategoryCount(deletingGroup.id) > 0 && !moveToGroupId)
                }
                onPress={() => removeGroup.mutate(deletingGroup)}
                className="flex-1"
              />
            </View>
          </Card>
        ) : null}

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

        {tree.data?.map((group, groupIndex) => (
          <View key={group.id} className="mt-5">
            {editingGroupId === group.id ? (
              <Card className="mx-4 mb-2 p-4">
                <TextInput
                  value={groupDraftName}
                  onChangeText={setGroupDraftName}
                  autoFocus
                  accessibilityLabel={`Rename ${group.name}`}
                  placeholderTextColor="#A4ADB8"
                  className="h-11 px-3 rounded-lg bg-ink-50 dark:bg-ink-800 text-base text-ink-900 dark:text-ink-50"
                />

                {groupNameProblem ? (
                  <Text className="text-sm text-negative mt-2">
                    {describeGroupNameProblem(groupNameProblem, groupDraftName)}
                  </Text>
                ) : null}

                <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Counts as
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {GROUP_TYPES.map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => setGroupDraftType(option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: groupDraftType === option.value }}
                      className={`rounded-full border px-3 py-1.5 ${
                        groupDraftType === option.value
                          ? 'border-mint-600 bg-mint-600'
                          : 'border-ink-300 dark:border-ink-700'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          groupDraftType === option.value
                            ? 'text-white'
                            : 'text-ink-600 dark:text-ink-300'
                        }`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mt-2 text-xs leading-4 text-ink-400 dark:text-ink-500">
                  Changing this moves every category in the group between income
                  and spending in your reports.
                </Text>

                <View className="mt-4 flex-row items-center gap-3">
                  <Pressable
                    onPress={() => moveGroup(groupIndex, groupIndex - 1)}
                    disabled={groupIndex === 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${group.name} up`}
                    hitSlop={8}
                    className="px-2 py-1"
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        groupIndex === 0
                          ? 'text-ink-300 dark:text-ink-700'
                          : 'text-mint-600 dark:text-mint-400'
                      }`}
                    >
                      ↑ Up
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveGroup(groupIndex, groupIndex + 1)}
                    disabled={groupIndex === (tree.data?.length ?? 0) - 1}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${group.name} down`}
                    hitSlop={8}
                    className="px-2 py-1"
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        groupIndex === (tree.data?.length ?? 0) - 1
                          ? 'text-ink-300 dark:text-ink-700'
                          : 'text-mint-600 dark:text-mint-400'
                      }`}
                    >
                      ↓ Down
                    </Text>
                  </Pressable>

                  <View className="flex-1" />

                  <Pressable
                    onPress={() => {
                      setDeletingGroup(group);
                      setMoveToGroupId(
                        destinationsFor(tree.data ?? [], group.id)[0]?.id ?? null,
                      );
                      setEditingGroupId(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${group.name}`}
                    hitSlop={8}
                    className="px-2 py-1"
                  >
                    <Text className="text-sm font-semibold text-negative">
                      Delete
                    </Text>
                  </Pressable>
                </View>

                <View className="mt-4 flex-row gap-3">
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setEditingGroupId(null)}
                    className="flex-1"
                  />
                  <Button
                    label={renameGroup.isPending ? 'Saving…' : 'Save'}
                    disabled={groupNameProblem !== null || renameGroup.isPending}
                    onPress={() => renameGroup.mutate(group.id)}
                    className="flex-1"
                  />
                </View>
              </Card>
            ) : (
              <View className="flex-row items-center justify-between px-5 mb-2">
                <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  {group.name}
                </Text>
                <View className="flex-row items-center gap-4">
                  <Pressable
                    onPress={() => {
                      setEditingGroupId(group.id);
                      setGroupDraftName(group.name);
                      setGroupDraftType(group.type);
                      setAddingToGroup(null);
                      setError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit group ${group.name}`}
                    hitSlop={8}
                  >
                    <Text className="text-sm font-semibold text-ink-500 dark:text-ink-400">
                      Edit
                    </Text>
                  </Pressable>
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
              </View>
            )}

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

        {addingGroup ? (
          <Card className="mx-4 mt-6 p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              New group
            </Text>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
              placeholder="Subscriptions"
              placeholderTextColor="#A4ADB8"
              accessibilityLabel="New group name"
              className="mt-2 h-11 px-3 rounded-lg bg-ink-50 dark:bg-ink-800 text-base text-ink-900 dark:text-ink-50"
            />

            {newGroupProblem ? (
              <Text className="text-sm text-negative mt-2">
                {describeGroupNameProblem(newGroupProblem, newGroupName)}
              </Text>
            ) : null}

            <View className="mt-4 flex-row flex-wrap gap-2">
              {GROUP_TYPES.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setNewGroupType(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: newGroupType === option.value }}
                  className={`rounded-full border px-3 py-1.5 ${
                    newGroupType === option.value
                      ? 'border-mint-600 bg-mint-600'
                      : 'border-ink-300 dark:border-ink-700'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      newGroupType === option.value
                        ? 'text-white'
                        : 'text-ink-600 dark:text-ink-300'
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-4 flex-row gap-3">
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setAddingGroup(false);
                  setNewGroupName('');
                }}
                className="flex-1"
              />
              <Button
                label={addGroup.isPending ? 'Adding…' : 'Add group'}
                disabled={
                  normalizeGroupName(newGroupName) === null ||
                  newGroupProblem !== null ||
                  addGroup.isPending
                }
                onPress={() => addGroup.mutate()}
                className="flex-1"
              />
            </View>
          </Card>
        ) : (
          <View className="px-4 mt-6">
            <Button
              label="New group"
              variant="secondary"
              onPress={() => {
                setAddingGroup(true);
                setEditingGroupId(null);
                setError(null);
              }}
            />
          </View>
        )}
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
