/**
 * Plaid transaction and balance sync primitives.
 *
 * The billing boundary is deliberate:
 * - webhooks call `syncTransactions` and `syncCachedBalances`;
 * - authenticated user refreshes may call `refreshRealtimeBalancesIfDue`.
 *
 * Keeping `/accounts/balance/get` behind a separately named, atomically
 * throttled function prevents a transaction webhook from creating a billable
 * Balance request.
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
import {
  BALANCE_REFRESH_COOLDOWN_MS,
  BALANCE_REFRESH_COOLDOWN_SECONDS,
  balanceRefreshWindow,
  cachedBalanceSyncDue,
} from './balanceThrottle.ts';

export type TransactionSyncResult = {
  added: number;
  modified: number;
  removed: number;
};

export type SyncResult = TransactionSyncResult & {
  accountsUpdated: number;
  balanceRefreshes: number;
  balanceRefreshesSkipped: number;
  balanceRefreshCooldownSeconds: number;
};

export type BalanceRefreshResult = {
  accountsUpdated: number;
  refreshed: boolean;
  skipped: boolean;
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

export async function syncTransactions(
  admin: SupabaseClient,
  item: {
    id: string;
    householdId: string;
    accessToken: string;
    cursor: string | null;
  },
): Promise<TransactionSyncResult> {
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
  };
}

/**
 * Writes cached Plaid balances after a transaction webhook.
 *
 * `/accounts/get` is free and does not trigger a real-time institution
 * extraction. It preserves automatic daily balance snapshots without coupling
 * webhooks to the billable Balance product.
 */
export async function syncCachedBalances(
  admin: SupabaseClient,
  item: {
    id: string;
    householdId: string;
    accessToken: string;
    lastBalanceRefreshedAt: string | null;
  },
  now: Date = new Date(),
): Promise<number> {
  if (!cachedBalanceSyncDue(item.lastBalanceRefreshedAt, now)) return 0;

  const fetchStartedAt = new Date().toISOString();
  const accounts = await loadBalancesFromPlaid(item, '/accounts/get');
  return persistBalances(admin, item, accounts, {
    // If a real-time refresh or user edit updates an account while this cached
    // request is in flight, leave the newer row and snapshot untouched.
    onlyAccountsUnchangedSince: fetchStartedAt,
  });
}

/**
 * Claims and performs a real-time Plaid Balance refresh when the Item is due.
 *
 * The conditional database update is the server-side lock: two function
 * instances can observe an old timestamp, but only one can replace it. If the
 * Plaid call fails, the previous value is restored so a genuine retry is not
 * hidden behind the cooldown.
 */
export async function refreshRealtimeBalancesIfDue(
  admin: SupabaseClient,
  item: {
    id: string;
    householdId: string;
    accessToken: string;
    lastBalanceRefreshedAt: string | null;
  },
  now: Date = new Date(),
): Promise<BalanceRefreshResult> {
  const window = balanceRefreshWindow(item.lastBalanceRefreshedAt, now);

  if (!window.due) {
    return { accountsUpdated: 0, refreshed: false, skipped: true };
  }

  const claimedAt = now.toISOString();
  const cutoff = new Date(
    now.getTime() - BALANCE_REFRESH_COOLDOWN_MS,
  ).toISOString();

  let claim = admin
    .from('plaid_items')
    .update({ last_balance_refreshed_at: claimedAt })
    .eq('id', item.id)
    .eq('household_id', item.householdId);

  claim = item.lastBalanceRefreshedAt
    ? claim.lte('last_balance_refreshed_at', cutoff)
    : claim.is('last_balance_refreshed_at', null);

  const { data: claimed, error: claimError } = await claim
    .select('id')
    .maybeSingle();

  if (claimError) {
    throw new Error(`Could not claim balance refresh: ${claimError.message}`);
  }

  // Another request won the claim after this function loaded the Item.
  if (!claimed) {
    return { accountsUpdated: 0, refreshed: false, skipped: true };
  }

  let balanceRequestSucceeded = false;

  try {
    const accounts = await loadBalancesFromPlaid(
      item,
      '/accounts/balance/get',
    );
    // A successful Balance response is the Plaid billing event. Keep the
    // cooldown claim even if a later database write fails, or retrying would
    // turn one paid extraction into two.
    balanceRequestSucceeded = true;
    const accountsUpdated = await persistBalances(admin, item, accounts);

    return { accountsUpdated, refreshed: true, skipped: false };
  } catch (error) {
    if (!balanceRequestSucceeded) {
      const { error: releaseError } = await admin
        .from('plaid_items')
        .update({
          last_balance_refreshed_at: item.lastBalanceRefreshedAt,
        })
        .eq('id', item.id)
        .eq('last_balance_refreshed_at', claimedAt);

      if (releaseError) {
        console.warn(
          `Could not release failed balance refresh claim: ${releaseError.message}`,
        );
      }
    }

    await recordItemError(admin, item.id, error);
    throw error;
  }
}

export const balanceRefreshCooldownSeconds =
  BALANCE_REFRESH_COOLDOWN_SECONDS;

async function loadBalancesFromPlaid(
  item: { accessToken: string },
  endpoint: '/accounts/get' | '/accounts/balance/get',
): Promise<PlaidAccount[]> {
  const { accounts } = await plaid<{ accounts: PlaidAccount[] }>(endpoint, {
    access_token: item.accessToken,
  });

  return accounts;
}

/** Persists Plaid balances and writes today's net worth snapshot. */
async function persistBalances(
  admin: SupabaseClient,
  item: { id: string; householdId: string },
  accounts: PlaidAccount[],
  options: { onlyAccountsUnchangedSince?: string } = {},
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

  const snapshotDate = calendarDateInTimeZone(
    new Date(),
    household.timezone as string,
  );
  let updated = 0;

  for (const account of accounts) {
    const isAsset = isAssetAccount(account.type);
    const magnitude = toCents(account.balances.current);
    const signed = isAsset ? magnitude : -magnitude;

    let update = admin
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
      .eq('plaid_account_id', account.account_id);

    if (options.onlyAccountsUnchangedSince) {
      update = update.lt(
        'updated_at',
        options.onlyAccountsUnchangedSince,
      );
    }

    const { data, error } = await update.select('id').maybeSingle();

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
