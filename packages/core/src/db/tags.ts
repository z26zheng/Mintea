import type { MinteaClient } from './client';
import { unwrap } from './client';
import type { TagRow } from '../types/database';
import { attachTagUsage, sortTagsForDisplay, type TagWithUsage } from '../domain/tags';

export async function fetchTags(client: MinteaClient): Promise<TagRow[]> {
  return unwrap(
    await client.from('tags').select('*').order('name', { ascending: true }),
  );
}

/**
 * Tags plus how many live transactions carry each one.
 *
 * Two requests rather than an embedded count: the counts come from a SQL
 * function that already excludes removed rows and split children, so the
 * number shown in a delete confirmation matches what the transaction list
 * would actually show.
 */
export async function fetchTagsWithUsage(
  client: MinteaClient,
): Promise<TagWithUsage[]> {
  const [tags, counts] = await Promise.all([
    fetchTags(client),
    client.rpc('tag_usage_counts'),
  ]);

  if (counts.error) throw new Error(counts.error.message);

  return sortTagsForDisplay(attachTagUsage(tags, counts.data ?? []));
}

export async function createTag(
  client: MinteaClient,
  input: { householdId: string; name: string; color?: string },
): Promise<TagRow> {
  return unwrap(
    await client
      .from('tags')
      .insert({
        household_id: input.householdId,
        name: input.name,
        ...(input.color ? { color: input.color } : {}),
      })
      .select()
      .single(),
  );
}

export async function updateTag(
  client: MinteaClient,
  id: string,
  patch: Partial<Pick<TagRow, 'name' | 'color'>>,
): Promise<TagRow> {
  return unwrap(
    await client.from('tags').update(patch).eq('id', id).select().single(),
  );
}

/**
 * Deletes a tag. `transaction_tags` cascades, so the assignments go with it
 * while the transactions themselves are untouched.
 */
export async function deleteTag(
  client: MinteaClient,
  id: string,
): Promise<void> {
  const { error } = await client.from('tags').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchTransactionTagIds(
  client: MinteaClient,
  transactionId: string,
): Promise<string[]> {
  const rows = unwrap(
    await client
      .from('transaction_tags')
      .select('tag_id')
      .eq('transaction_id', transactionId),
  );

  return rows.map((row) => row.tag_id);
}

/**
 * Replaces a transaction's tags in one call.
 *
 * Routed through a SQL function so the delete and insert are atomic — the
 * previous two-request version could leave a transaction with no tags if the
 * insert failed.
 */
export async function setTransactionTags(
  client: MinteaClient,
  transactionId: string,
  tagIds: string[],
): Promise<void> {
  const { error } = await client.rpc('set_transaction_tags', {
    p_transaction_id: transactionId,
    p_tag_ids: tagIds,
  });

  if (error) throw new Error(error.message);
}

/**
 * Adds or removes one tag across a selection.
 *
 * Returns how many transactions actually changed, which is not always the
 * size of the selection — already-tagged and removed rows are skipped.
 */
export async function bulkTagTransactions(
  client: MinteaClient,
  input: { tagId: string; transactionIds: string[]; attach: boolean },
): Promise<number> {
  const { data, error } = await client.rpc('bulk_tag_transactions', {
    p_tag_id: input.tagId,
    p_transaction_ids: input.transactionIds,
    p_attach: input.attach,
  });

  if (error) throw new Error(error.message);

  return data ?? 0;
}

/**
 * Tag assignments for a page of transactions, so the list can show them
 * without a request per row.
 */
export async function fetchTagsForTransactions(
  client: MinteaClient,
  transactionIds: string[],
): Promise<Map<string, string[]>> {
  if (transactionIds.length === 0) return new Map();

  const rows = unwrap(
    await client
      .from('transaction_tags')
      .select('transaction_id, tag_id')
      .in('transaction_id', transactionIds),
  );

  const byTransaction = new Map<string, string[]>();

  for (const row of rows) {
    const bucket = byTransaction.get(row.transaction_id);
    if (bucket) bucket.push(row.tag_id);
    else byTransaction.set(row.transaction_id, [row.tag_id]);
  }

  return byTransaction;
}
