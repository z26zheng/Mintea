/**
 * Disconnects an institution: tells Plaid to stop billing and stop syncing,
 * then removes the local connection.
 *
 * Accounts are soft-deleted rather than dropped so historical transactions and
 * net worth history stay intact — disconnecting a bank shouldn't rewrite last
 * year's spending.
 */
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { plaid, PlaidApiError } from '../_shared/plaid.ts';
import { loadItemForCaller, requireCaller } from '../_shared/supabase.ts';
import { isAlreadyDisconnected } from '../_shared/accountDeletion.ts';

type Body = { itemId?: string };

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const { itemId } = await readJson<Body>(req);

    if (!itemId) throw new HttpError(400, 'itemId is required');

    const item = await loadItemForCaller(caller, itemId);

    try {
      await plaid(
        '/item/remove',
        { access_token: item.accessToken },
        item.plaidEnvironment,
      );
    } catch (error) {
      // If Plaid has already forgotten the Item, carry on with local cleanup —
      // otherwise the user can never clear a stale connection. INVALID_ACCESS_
      // TOKEN is deliberately no longer accepted here; see
      // isAlreadyDisconnected for why that changed.
      const alreadyGone =
        error instanceof PlaidApiError && isAlreadyDisconnected(error.code);

      if (!alreadyGone) throw error;
    }

    const { error: accountsError } = await caller.admin
      .from('accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('plaid_item_id', item.id);

    if (accountsError) throw new HttpError(500, accountsError.message);

    // Cascades to plaid_item_secrets.
    const { error: deleteError } = await caller.admin
      .from('plaid_items')
      .delete()
      .eq('id', item.id);

    if (deleteError) throw new HttpError(500, deleteError.message);

    return json({ removed: true });
  }),
);
