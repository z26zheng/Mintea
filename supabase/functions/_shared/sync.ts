/**
 * Transaction and balance sync. Shared by the `plaid-sync` function (user
 * pressed refresh) and `plaid-webhook` (Plaid says there's new data).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  isAssetAccount,
  plaid,
  PlaidApiError,
  toCents,
  type PlaidAccount,
  type PlaidTransaction,
  type TransactionsSyncResponse,
} from './plaid.ts';
import { buildCategoryLookup, resolveCategoryId } from './categoryMap.ts';
import { calendarDateInTimeZone } from './dates.ts';

export type SyncResult = {
  added: number;
  modified: number;
  removed: number;
  accountsUpdated: number;
};

const PAGE_SIZE = 500;

/** Supabase caps request size; large first syncs are written in chunks. */
async function inChunks<T>(
  rows: T[],
  size: number,
  write: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size));
  }
}

export async function syncItem(
  admin: SupabaseClient,
  item: {
    id: string;
    householdId: string;
    accessToken: string;
    cursor: string | null;
  },
): Promise<SyncResult> {
  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: string[] = [];

  let cursor = item.cursor;
  let hasMore = true;

  try {
    while (hasMore) {
      const page = await plaid<TransactionsSyncResponse>('/transactions/sync', {
        access_token: item.accessToken,
        ...(cursor ? { cursor } : {}),
        count: PAGE_SIZE,
      });

      added.push(...page.added);
      modified.push(...page.modified);
      removed.push(...page.removed.map((entry) => entry.transaction_id));

      cursor = page.next_cursor;
      hasMore = page.has_more;
    }
  } catch (error) {
    await recordItemError(admin, item.id, error);
    throw error;
  }

  let accountsUpdated: number;

  try {
    accountsUpdated = await syncBalances(admin, item);
  } catch (error) {
    await recordItemError(admin, item.id, error);
    throw error;
  }

  // Map Plaid account ids to our rows; a transaction for an account we don't
  // have (a newly added one, mid-sync) is skipped rather than orphaned.
  const { data: accountRows } = await admin
    .from('accounts')
    .select('id, plaid_account_id')
    .eq('plaid_item_id', item.id);

  const accountByPlaidId = new Map<string, string>(
    (accountRows ?? [])
      .filter((row): row is { id: string; plaid_account_id: string } =>
        Boolean(row.plaid_account_id),
      )
      .map((row) => [row.plaid_account_id, row.id]),
  );

  const { data: categoryRows } = await admin
    .from('categories')
    .select('id, name, system_key')
    .eq('household_id', item.householdId);

  const categoryLookup = buildCategoryLookup(categoryRows ?? []);

  const merchantIds = await upsertMerchants(
    admin,
    item.householdId,
    [...added, ...modified],
  );

  // When a pending transaction posts, Plaid sends the posted version in `added`
  // (pointing at the pending id) and the pending one in `removed`. Carrying the
  // user's edits across means a category they set while it was pending sticks.
  const carryOver = await loadPendingEdits(admin, added);

  const addedRows = added.flatMap((transaction) => {
    const accountId = accountByPlaidId.get(transaction.account_id);
    if (!accountId) return [];

    const previous = transaction.pending_transaction_id
      ? carryOver.get(transaction.pending_transaction_id)
      : undefined;

    const merchantName = transaction.merchant_name ?? transaction.name;

    return [
      {
        household_id: item.householdId,
        account_id: accountId,
        plaid_transaction_id: transaction.transaction_id,
        date: transaction.date,
        authorized_date: transaction.authorized_date,
        // Plaid: positive = money out. Ours: negative = money out.
        amount_cents: -toCents(transaction.amount),
        currency:
          transaction.iso_currency_code ??
          transaction.unofficial_currency_code ??
          'USD',
        merchant_id: merchantIds.get(merchantName.toLowerCase()) ?? null,
        description: previous?.description ?? merchantName,
        original_description: transaction.name,
        category_id:
          previous?.category_id ??
          resolveCategoryId(transaction.personal_finance_category, categoryLookup),
        notes: previous?.notes ?? null,
        is_pending: transaction.pending,
        needs_review: previous ? previous.needs_review : true,
        plaid_category: transaction.personal_finance_category,
      },
    ];
  });

  await inChunks(addedRows, 500, async (chunk) => {
    const { error } = await admin
      .from('transactions')
      .upsert(chunk, {
        onConflict: 'plaid_transaction_id',
        ignoreDuplicates: true,
      });

    if (error) throw new Error(`Failed to insert transactions: ${error.message}`);
  });

  // On `modified`, only bank-owned fields are touched. Description, category,
  // merchant and notes are left alone so a re-sync never undoes a user's edit.
  for (const transaction of modified) {
    const { error } = await admin
      .from('transactions')
      .update({
        date: transaction.date,
        authorized_date: transaction.authorized_date,
        amount_cents: -toCents(transaction.amount),
        original_description: transaction.name,
        is_pending: transaction.pending,
        plaid_category: transaction.personal_finance_category,
      })
      .eq('plaid_transaction_id', transaction.transaction_id);

    if (error) {
      console.warn(
        `Could not update ${transaction.transaction_id}: ${error.message}`,
      );
    }
  }

  await inChunks(removed, 500, async (chunk) => {
    const { error } = await admin
      .from('transactions')
      .delete()
      .in('plaid_transaction_id', chunk);

    if (error) throw new Error(`Failed to remove transactions: ${error.message}`);
  });

  await admin
    .from('plaid_items')
    .update({
      transactions_cursor: cursor,
      last_synced_at: new Date().toISOString(),
      status: 'good',
      error_code: null,
      error_message: null,
    })
    .eq('id', item.id);

  return {
    added: addedRows.length,
    modified: modified.length,
    removed: removed.length,
    accountsUpdated,
  };
}

/** Refreshes balances and writes today's net worth snapshot. */
async function syncBalances(
  admin: SupabaseClient,
  item: { id: string; householdId: string; accessToken: string },
): Promise<number> {
  const { data: household, error: householdError } = await admin
    .from('households')
    .select('timezone')
    .eq('id', item.householdId)
    .single();

  if (householdError || !household) {
    throw new Error(
      `Could not load household reporting time zone: ${
        householdError?.message ?? 'household not found'
      }`,
    );
  }

  const { accounts } = await plaid<{ accounts: PlaidAccount[] }>(
    '/accounts/balance/get',
    { access_token: item.accessToken },
  );

  const snapshotDate = calendarDateInTimeZone(
    new Date(),
    household.timezone as string,
  );
  let updated = 0;

  for (const account of accounts) {
    const isAsset = isAssetAccount(account.type);
    const magnitude = toCents(account.balances.current);
    const signed = isAsset ? magnitude : -magnitude;

    const { data, error } = await admin
      .from('accounts')
      .update({
        current_balance_cents: signed,
        available_balance_cents:
          account.balances.available === null
            ? null
            : toCents(account.balances.available),
        limit_cents:
          account.balances.limit === null
            ? null
            : toCents(account.balances.limit),
      })
      .eq('plaid_item_id', item.id)
      .eq('plaid_account_id', account.account_id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to update balance for account ${account.account_id}: ${error.message}`,
      );
    }

    // Plaid can expose a newly added account before its account row has been
    // imported. It will be picked up by a later item update/link flow.
    if (!data) continue;

    updated += 1;

    const { error: snapshotError } = await admin
      .from('account_balances')
      .upsert(
        {
          household_id: item.householdId,
          account_id: data.id,
          date: snapshotDate,
          balance_cents: signed,
        },
        { onConflict: 'account_id,date' },
      );

    if (snapshotError) {
      throw new Error(
        `Failed to record balance snapshot for account ${account.account_id}: ${snapshotError.message}`,
      );
    }
  }

  return updated;
}

async function upsertMerchants(
  admin: SupabaseClient,
  householdId: string,
  transactions: PlaidTransaction[],
): Promise<Map<string, string>> {
  const names = new Map<string, { name: string; logo: string | null }>();

  for (const transaction of transactions) {
    const name = transaction.merchant_name ?? transaction.name;
    if (!name) continue;

    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, { name, logo: transaction.logo_url });
  }

  if (names.size === 0) return new Map();

  const rows = [...names.values()].map((merchant) => ({
    household_id: householdId,
    name: merchant.name,
    ...(merchant.logo ? { logo_url: merchant.logo } : {}),
  }));

  await inChunks(rows, 500, async (chunk) => {
    const { error } = await admin
      .from('merchants')
      .upsert(chunk, { onConflict: 'household_id,name', ignoreDuplicates: true });

    if (error) console.warn(`Merchant upsert failed: ${error.message}`);
  });

  const { data } = await admin
    .from('merchants')
    .select('id, name')
    .eq('household_id', householdId)
    .in('name', [...names.values()].map((merchant) => merchant.name));

  return new Map(
    (data ?? []).map((merchant) => [
      (merchant.name as string).toLowerCase(),
      merchant.id as string,
    ]),
  );
}

type CarriedEdits = {
  description: string;
  category_id: string | null;
  notes: string | null;
  needs_review: boolean;
};

async function loadPendingEdits(
  admin: SupabaseClient,
  added: PlaidTransaction[],
): Promise<Map<string, CarriedEdits>> {
  const pendingIds = added
    .map((transaction) => transaction.pending_transaction_id)
    .filter((id): id is string => Boolean(id));

  if (pendingIds.length === 0) return new Map();

  const { data } = await admin
    .from('transactions')
    .select('plaid_transaction_id, description, category_id, notes, needs_review')
    .in('plaid_transaction_id', pendingIds);

  return new Map(
    (data ?? []).map((row) => [
      row.plaid_transaction_id as string,
      {
        description: row.description as string,
        category_id: row.category_id as string | null,
        notes: row.notes as string | null,
        needs_review: row.needs_review as boolean,
      },
    ]),
  );
}

/** Records a Plaid failure on the Item so the UI can prompt a reconnect. */
export async function recordItemError(
  admin: SupabaseClient,
  itemId: string,
  error: unknown,
): Promise<void> {
  const code = error instanceof PlaidApiError ? error.code : null;
  const message = error instanceof Error ? error.message : String(error);

  const status =
    code === 'ITEM_LOGIN_REQUIRED'
      ? 'login_required'
      : code === 'ITEM_NOT_FOUND' || code === 'ACCESS_NOT_GRANTED'
        ? 'revoked'
        : 'error';

  await admin
    .from('plaid_items')
    .update({ status, error_code: code, error_message: message })
    .eq('id', itemId);
}
