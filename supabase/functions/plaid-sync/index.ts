/**
 * Pulls transactions and, when the server-side cooldown permits it, real-time
 * balances. Called when the user taps refresh and after linking a new
 * institution.
 *
 * Omit `itemId` to sync every connection in the household.
 */
import { handler, json, readJson } from '../_shared/http.ts';
import { requireCaller } from '../_shared/supabase.ts';
import { parsePlaidEnvironment } from '../_shared/plaidEnvironment.ts';
import {
  balanceRefreshCooldownSeconds,
  refreshRealtimeBalancesIfDue,
  syncTransactions,
  type SyncResult,
} from '../_shared/sync.ts';

type Body = { itemId?: string };

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const { itemId } = await readJson<Body>(req);

    let query = caller.admin
      .from('plaid_items')
      .select(
        'id, transactions_cursor, last_balance_refreshed_at, plaid_environment, plaid_item_secrets(access_token)',
      )
      .eq('household_id', caller.householdId);

    if (itemId) query = query.eq('id', itemId);

    const { data: items, error } = await query;

    if (error) throw new Error(error.message);

    const totals: SyncResult = {
      added: 0,
      modified: 0,
      removed: 0,
      accountsUpdated: 0,
      balanceRefreshes: 0,
      balanceRefreshesSkipped: 0,
      balanceRefreshCooldownSeconds,
    };

    const failures: string[] = [];

    for (const item of items ?? []) {
      // The embedded select returns an array for the one-to-one relationship.
      const secret = Array.isArray(item.plaid_item_secrets)
        ? item.plaid_item_secrets[0]
        : item.plaid_item_secrets;

      const accessToken = (secret as { access_token?: string } | null)
        ?.access_token;

      if (!accessToken) {
        failures.push(`${item.id}: missing access token`);
        continue;
      }

      try {
        // Per Item, not once per request. A household is single-environment
        // today, but per-Item is what the stored column promises.
        const plaidEnvironment = parsePlaidEnvironment(item.plaid_environment);

        const transactions = await syncTransactions(caller.admin, {
          id: item.id as string,
          householdId: caller.householdId,
          accessToken,
          cursor: item.transactions_cursor as string | null,
          plaidEnvironment,
        });

        totals.added += transactions.added;
        totals.modified += transactions.modified;
        totals.removed += transactions.removed;

        const balances = await refreshRealtimeBalancesIfDue(caller.admin, {
          id: item.id as string,
          householdId: caller.householdId,
          accessToken,
          lastBalanceRefreshedAt:
            item.last_balance_refreshed_at as string | null,
          plaidEnvironment,
        });

        totals.accountsUpdated += balances.accountsUpdated;
        totals.balanceRefreshes += balances.refreshed ? 1 : 0;
        totals.balanceRefreshesSkipped += balances.skipped ? 1 : 0;
      } catch (itemError) {
        // One broken connection shouldn't stop the others from syncing; the
        // Item's status row already records why it failed.
        failures.push(
          `${item.id}: ${itemError instanceof Error ? itemError.message : itemError}`,
        );
      }
    }

    if (failures.length > 0 && failures.length === (items?.length ?? 0)) {
      return json({ ...totals, errors: failures }, 502);
    }

    return json(failures.length ? { ...totals, errors: failures } : totals);
  }),
);
