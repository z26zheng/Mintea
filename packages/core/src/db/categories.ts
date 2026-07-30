import type { MinteaClient } from './client';
import { unwrap } from './client';
import type {
  CategoryGroupRow,
  CategoryRow,
  CategoryType,
  MerchantRow,
  TagRow,
} from '../types/database';

/** A category group with its categories attached, ordered for display. */
export type CategoryTreeNode = CategoryGroupRow & {
  categories: CategoryRow[];
};

export async function fetchCategories(
  client: MinteaClient,
): Promise<CategoryRow[]> {
  return unwrap(
    await client
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
  );
}

export async function fetchCategoryGroups(
  client: MinteaClient,
): Promise<CategoryGroupRow[]> {
  return unwrap(
    await client
      .from('category_groups')
      .select('*')
      .order('display_order', { ascending: true }),
  );
}

export function buildCategoryTree(
  groups: CategoryGroupRow[],
  categories: CategoryRow[],
): CategoryTreeNode[] {
  const byGroup = new Map<string, CategoryRow[]>();

  for (const category of categories) {
    const bucket = byGroup.get(category.group_id);
    if (bucket) bucket.push(category);
    else byGroup.set(category.group_id, [category]);
  }

  return groups.map((group) => ({
    ...group,
    categories: byGroup.get(group.id) ?? [],
  }));
}

export const findSystemCategory = (
  categories: CategoryRow[],
  key: string,
): CategoryRow | undefined => categories.find((c) => c.system_key === key);

export async function createCategory(
  client: MinteaClient,
  input: {
    householdId: string;
    groupId: string;
    name: string;
    icon?: string;
    color?: string | null;
  },
): Promise<CategoryRow> {
  return unwrap(
    await client
      .from('categories')
      .insert({
        household_id: input.householdId,
        group_id: input.groupId,
        name: input.name,
        icon: input.icon ?? '💸',
        color: input.color ?? null,
      })
      .select()
      .single(),
  );
}

export async function updateCategory(
  client: MinteaClient,
  id: string,
  patch: Partial<
    Pick<
      CategoryRow,
      | 'name'
      | 'icon'
      | 'color'
      | 'group_id'
      | 'display_order'
      | 'exclude_from_budget'
      | 'rollover_enabled'
    >
  >,
): Promise<CategoryRow> {
  return unwrap(
    await client.from('categories').update(patch).eq('id', id).select().single(),
  );
}

/**
 * Deletes a category, first moving its transactions elsewhere. Passing
 * `reassignTo: null` leaves them uncategorised — the FK is `on delete set null`,
 * so this is really about giving the user an explicit choice rather than
 * silently orphaning history.
 */
export async function deleteCategory(
  client: MinteaClient,
  id: string,
  reassignTo: string | null,
): Promise<void> {
  if (reassignTo) {
    const { error: moveError } = await client
      .from('transactions')
      .update({ category_id: reassignTo })
      .eq('category_id', id);

    if (moveError) throw new Error(moveError.message);
  }

  const { error } = await client
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('is_system', false);

  if (error) throw new Error(error.message);
}

export async function createCategoryGroup(
  client: MinteaClient,
  input: {
    householdId: string;
    name: string;
    type: CategoryType;
    displayOrder?: number;
  },
): Promise<CategoryGroupRow> {
  return unwrap(
    await client
      .from('category_groups')
      .insert({
        household_id: input.householdId,
        name: input.name,
        type: input.type,
        display_order: input.displayOrder ?? 0,
      })
      .select()
      .single(),
  );
}

export async function updateCategoryGroup(
  client: MinteaClient,
  id: string,
  changes: { name?: string; type?: CategoryType },
): Promise<CategoryGroupRow> {
  return unwrap(
    await client
      .from('category_groups')
      .update(changes)
      .eq('id', id)
      .select()
      .single(),
  );
}

/**
 * Removes a group, moving its categories to `moveToGroupId`.
 *
 * Goes through a SQL function rather than a plain delete: `categories.group_id`
 * cascades, so deleting a group directly destroys every category in it and
 * silently uncategorises every transaction that used them. The function
 * refuses unless the group is empty or its categories have somewhere to go.
 *
 * Returns how many categories moved.
 */
export async function deleteCategoryGroup(
  client: MinteaClient,
  id: string,
  moveToGroupId: string | null,
): Promise<number> {
  const { data, error } = await client.rpc('delete_category_group', {
    p_group_id: id,
    p_move_to_group_id: moveToGroupId,
  });

  if (error) throw new Error(error.message);
  return data ?? 0;
}

/** Applies a whole ordering at once, so the list never shows duplicate positions. */
export async function reorderCategoryGroups(
  client: MinteaClient,
  orderedIds: string[],
): Promise<number> {
  const { data, error } = await client.rpc('reorder_category_groups', {
    p_group_ids: orderedIds,
  });

  if (error) throw new Error(error.message);
  return data ?? 0;
}

// ----------------------------------------------------------------- merchants

export async function fetchMerchants(
  client: MinteaClient,
): Promise<MerchantRow[]> {
  return unwrap(
    await client.from('merchants').select('*').order('name', { ascending: true }),
  );
}

/**
 * Returns the merchant with this name, creating it if needed. Used on ingest
 * and whenever the user renames a transaction's merchant.
 */
export async function upsertMerchant(
  client: MinteaClient,
  householdId: string,
  name: string,
  logoUrl?: string | null,
): Promise<MerchantRow> {
  return unwrap(
    await client
      .from('merchants')
      .upsert(
        {
          household_id: householdId,
          name,
          ...(logoUrl ? { logo_url: logoUrl } : {}),
        },
        { onConflict: 'household_id,name' },
      )
      .select()
      .single(),
  );
}
