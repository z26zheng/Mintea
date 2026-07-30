import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  IconBadge,
  IconButton,
  Loading,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';
import { useBreakpoint } from '../../lib/breakpoints';
import { useDismiss } from '../../lib/useDismiss';
import { useTheme } from '../../lib/theme';
import { CategoryPicker } from '../../components/CategoryPicker';

const GROUP_TYPES: Array<{ value: CategoryType; label: string }> = [
  { value: 'expense', label: 'Spending' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const groupTypeLabel = (type: CategoryType) =>
  GROUP_TYPES.find((option) => option.value === type)?.label ?? type;

/**
 * Category management. Renaming and re-icon-ing happen inline; deleting asks
 * where the existing transactions should go, because silently orphaning a
 * year of history is the kind of thing you only forgive once.
 */
function Categories() {
  const client = useClient();
  const dismiss = useDismiss('/(tabs)/settings');
  const queryClient = useQueryClient();
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();

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
  const totalCategories = (tree.data ?? []).reduce(
    (total, group) => total + group.categories.length,
    0,
  );

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
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Categories"
        subtitle="Organize how every transaction rolls into reports"
        onClose={() => dismiss()}
      />

      <ScrollView contentContainerClassName="pb-16">
        {error ? <ErrorNotice message={error} /> : null}

        {notice ? (
          <Card className="mx-4 mt-4 flex-row items-center gap-3 border-mint-200 bg-mint-50 p-4 dark:border-mint-900 dark:bg-mint-950/40">
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.accent}
            />
            <Text
              accessibilityLiveRegion="polite"
              className="min-w-0 flex-1 text-sm text-mint-800 dark:text-mint-200"
            >
              {notice}
            </Text>
          </Card>
        ) : null}

        <Card className="mx-4 mt-4 overflow-hidden">
          <View className="h-1 bg-mint-500" />
          <View
            className={`gap-4 p-4 ${
              isLarge ? 'flex-row items-center justify-between' : ''
            }`}
          >
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <IconBadge name="folder-open-outline" size={42} />
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                  Your reporting structure
                </Text>
                <Text className="mt-0.5 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Groups decide whether categories count as spending, income, or
                  transfers.
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <View className="min-w-[92px] rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800">
                <Text className="text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                  {tree.data?.length ?? 0}
                </Text>
                <Text className="text-xs text-ink-500 dark:text-ink-400">
                  Groups
                </Text>
              </View>
              <View className="min-w-[92px] rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800">
                <Text className="text-xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                  {totalCategories}
                </Text>
                <Text className="text-xs text-ink-500 dark:text-ink-400">
                  Categories
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {deletingGroup ? (
          <Card className="mx-4 mt-4 border-red-300 p-4 dark:border-red-900">
            <View className="flex-row items-center gap-3">
              <IconBadge name="trash-outline" size={40} tone="danger" />
              <Text className="min-w-0 flex-1 text-base font-semibold text-ink-900 dark:text-ink-50">
                Delete "{deletingGroup.name}"?
              </Text>
            </View>

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
                <View
                  className="mt-2 flex-row flex-wrap gap-2"
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Destination group"
                >
                  {destinationsFor(allGroups, deletingGroup.id).map((option) => (
                    <Pressable
                      key={option.id}
                      onPress={() => setMoveToGroupId(option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: moveToGroupId === option.id,
                      }}
                      className={`rounded-full border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                        moveToGroupId === option.id
                          ? 'border-mint-600 bg-mint-600'
                          : 'border-ink-300 bg-white hover:border-mint-300 hover:bg-mint-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-800'
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
          <Card className="mx-4 mt-4 border-red-300 p-4 dark:border-red-900">
            <View className="flex-row items-center gap-3">
              <IconBadge name="trash-outline" size={40} tone="danger" />
              <Text className="min-w-0 flex-1 text-base font-semibold text-ink-900 dark:text-ink-50">
                Delete "{deleting.name}"?
              </Text>
            </View>
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

        <View
          className={
            isLarge ? 'flex-row flex-wrap items-start px-2' : undefined
          }
        >
          {tree.data?.map((group, groupIndex) => (
          <View
            key={group.id}
            className={isLarge ? 'mt-4 w-1/2 px-2' : 'mt-4 px-4'}
          >
            {editingGroupId === group.id ? (
              <Card className="overflow-hidden p-4">
                <View className="mb-4 flex-row items-center gap-3">
                  <IconBadge name="create-outline" size={38} />
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                      Edit group
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      This classification changes report calculations.
                    </Text>
                  </View>
                </View>
                <TextInput
                  value={groupDraftName}
                  onChangeText={setGroupDraftName}
                  autoFocus
                  accessibilityLabel={`Rename ${group.name}`}
                  placeholderTextColor="#A4ADB8"
                  className="h-12 rounded-xl border border-ink-300 bg-white px-4 text-base text-ink-900 focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
                />

                {groupNameProblem ? (
                  <Text className="text-sm text-negative mt-2">
                    {describeGroupNameProblem(groupNameProblem, groupDraftName)}
                  </Text>
                ) : null}

                <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Counts as
                </Text>
                <View
                  className="mt-2 flex-row flex-wrap gap-2"
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`Reporting type for ${group.name}`}
                >
                  {GROUP_TYPES.map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => setGroupDraftType(option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: groupDraftType === option.value,
                      }}
                      className={`rounded-full border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                        groupDraftType === option.value
                          ? 'border-mint-600 bg-mint-600'
                          : 'border-ink-300 bg-white hover:border-mint-300 hover:bg-mint-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-800'
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
                  <IconButton
                    name="arrow-up"
                    label={`Move ${group.name} up`}
                    onPress={() => moveGroup(groupIndex, groupIndex - 1)}
                    disabled={groupIndex === 0}
                  />
                  <IconButton
                    name="arrow-down"
                    label={`Move ${group.name} down`}
                    onPress={() => moveGroup(groupIndex, groupIndex + 1)}
                    disabled={groupIndex === (tree.data?.length ?? 0) - 1}
                  />

                  <View className="flex-1" />

                  <IconButton
                    name="trash-outline"
                    label={`Delete ${group.name}`}
                    tone="danger"
                    onPress={() => {
                      setDeletingGroup(group);
                      setMoveToGroupId(
                        destinationsFor(tree.data ?? [], group.id)[0]?.id ?? null,
                      );
                      setEditingGroupId(null);
                    }}
                  />
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
              <View className="mb-2 flex-row items-center justify-between gap-3 px-1">
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    className="text-base font-semibold text-ink-900 dark:text-ink-50"
                  >
                    {group.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {groupTypeLabel(group.type)} · {group.categories.length}{' '}
                    categor{group.categories.length === 1 ? 'y' : 'ies'}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <IconButton
                    name="pencil-outline"
                    label={`Edit group ${group.name}`}
                    onPress={() => {
                      setEditingGroupId(group.id);
                      setGroupDraftName(group.name);
                      setGroupDraftType(group.type);
                      setAddingToGroup(null);
                      setError(null);
                    }}
                  />
                  <IconButton
                    name={
                      addingToGroup === group.id ? 'close' : 'add'
                    }
                    label={
                      addingToGroup === group.id
                        ? `Cancel adding to ${group.name}`
                        : `Add category to ${group.name}`
                    }
                    tone="accent"
                    onPress={() => {
                      setAddingToGroup(
                        addingToGroup === group.id ? null : group.id,
                      );
                      setNewName('');
                    }}
                  />
                </View>
              </View>
            )}

            <Card className="overflow-hidden">
              {addingToGroup === group.id ? (
                <View className="flex-row items-center gap-2 bg-mint-50/60 p-3 dark:bg-mint-950/20">
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Category name"
                    placeholderTextColor="#A4ADB8"
                    autoFocus
                    accessibilityLabel={`New category in ${group.name}`}
                    onSubmitEditing={() => newName.trim() && add.mutate(group.id)}
                    className="h-11 flex-1 rounded-xl border border-ink-300 bg-white px-3 text-base text-ink-900 focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                  />
                  <IconButton
                    name="checkmark"
                    label={`Save category in ${group.name}`}
                    tone="accent"
                    disabled={!newName.trim() || add.isPending}
                    onPress={() => newName.trim() && add.mutate(group.id)}
                  />
                </View>
              ) : null}

              {group.categories.map((category, index) => (
                <View key={category.id}>
                  {index > 0 || addingToGroup === group.id ? <Divider /> : null}

                  {editingId === category.id ? (
                    <View className="flex-row items-center gap-2 bg-ink-50/80 p-3 dark:bg-ink-800/50">
                      <TextInput
                        value={draftIcon}
                        onChangeText={setDraftIcon}
                        accessibilityLabel={`Icon for ${category.name}`}
                        className="h-11 w-12 rounded-xl border border-ink-300 bg-white text-center text-lg focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-900"
                        maxLength={4}
                      />
                      <TextInput
                        value={draftName}
                        onChangeText={setDraftName}
                        autoFocus
                        accessibilityLabel={`Name for ${category.name}`}
                        onSubmitEditing={() => rename.mutate(category)}
                        className="h-11 flex-1 rounded-xl border border-ink-300 bg-white px-3 text-base text-ink-900 focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                      />
                      <IconButton
                        name="checkmark"
                        label={`Save ${category.name}`}
                        tone="accent"
                        disabled={rename.isPending}
                        onPress={() => rename.mutate(category)}
                      />
                      <IconButton
                        name="close"
                        label={`Cancel editing ${category.name}`}
                        onPress={() => setEditingId(null)}
                      />
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-3 px-4 py-3">
                      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 dark:bg-ink-800">
                        <Text className="text-lg">{category.icon}</Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text
                          numberOfLines={1}
                          className="text-base font-medium text-ink-900 dark:text-ink-50"
                        >
                          {category.name}
                        </Text>
                        {category.is_system ? (
                          <Text className="mt-0.5 text-xs text-ink-400 dark:text-ink-500">
                            System category
                          </Text>
                        ) : null}
                      </View>

                      <IconButton
                        name="pencil-outline"
                        label={`Rename ${category.name}`}
                        onPress={() => {
                          setEditingId(category.id);
                          setDraftName(category.name);
                          setDraftIcon(category.icon);
                        }}
                      />

                      {/* System categories are load-bearing — ingest falls back
                          to "Uncategorized", transfers need "Transfer". */}
                      {category.is_system ? null : (
                        <IconButton
                          name="trash-outline"
                          label={`Delete ${category.name}`}
                          tone="danger"
                          onPress={() => {
                            setError(null);
                            setDeleting(category);
                          }}
                        />
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
        </View>

        {addingGroup ? (
          <Card className="mx-4 mt-6 overflow-hidden p-4">
            <View className="mb-4 flex-row items-center gap-3">
              <IconBadge name="add-circle-outline" size={40} />
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                  New group
                </Text>
                <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  Choose how its categories should count in reports.
                </Text>
              </View>
            </View>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
              placeholder="Subscriptions"
              placeholderTextColor="#A4ADB8"
              accessibilityLabel="New group name"
              className="h-12 rounded-xl border border-ink-300 bg-white px-4 text-base text-ink-900 focus:border-mint-500 focus:outline-none dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
            />

            {newGroupProblem ? (
              <Text className="text-sm text-negative mt-2">
                {describeGroupNameProblem(newGroupProblem, newGroupName)}
              </Text>
            ) : null}

            <View
              className="mt-4 flex-row flex-wrap gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="New group reporting type"
            >
              {GROUP_TYPES.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setNewGroupType(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: newGroupType === option.value,
                  }}
                  className={`rounded-full border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                    newGroupType === option.value
                      ? 'border-mint-600 bg-mint-600'
                      : 'border-ink-300 bg-white hover:border-mint-300 hover:bg-mint-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-mint-800'
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
