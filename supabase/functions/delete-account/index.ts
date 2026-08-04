/**
 * Deletes the caller's account.
 *
 * Two outcomes, decided by who else is in the household:
 *
 *  - Sole member: every Plaid Item is disconnected at Plaid, then the household
 *    row is deleted. Everything else — accounts, balances, transactions, tags,
 *    rules, properties, the profile — goes with it by cascade. Finally the Auth
 *    user is removed.
 *  - Other members remain: the caller leaves. Their membership and profile go,
 *    and the Auth user is removed, but the household's financial data belongs
 *    to the people still in it and stays exactly as it is.
 *
 * Plaid is contacted before anything local is removed. Dropping our rows while
 * an Item is still live at Plaid would leave a connection that keeps its access
 * to the user's bank — and that we can no longer see, let alone revoke. If
 * Plaid refuses for any reason other than "already gone", the whole delete
 * fails and the user can retry; a failed delete is recoverable, an orphaned
 * bank connection is not.
 *
 * Requires a valid session. The service role is used only after the JWT has
 * been verified and the household it belongs to resolved from it — never from
 * anything the caller sent.
 */
import {
  isAlreadyDisconnected,
  planAccountDeletion,
} from '../_shared/accountDeletion.ts';
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { plaid, PlaidApiError } from '../_shared/plaid.ts';
import { parsePlaidEnvironment } from '../_shared/plaidEnvironment.ts';
import {
  findHousehold,
  requireUser,
  type Caller,
} from '../_shared/supabase.ts';

type Body = {
  /** Explicit opt-in, so an empty probe cannot delete an account. */
  confirm?: boolean;
};

type Outcome = 'household-deleted' | 'left-household';

/** Removes every Plaid Item in the household from Plaid, then locally. */
async function disconnectPlaidItems(caller: Caller): Promise<number> {
  const { data: items, error } = await caller.admin
    .from('plaid_items')
    .select('id, plaid_environment')
    .eq('household_id', caller.householdId);

  if (error) throw new HttpError(500, error.message);
  if (!items || items.length === 0) return 0;

  const { data: secrets, error: secretsError } = await caller.admin
    .from('plaid_item_secrets')
    .select('item_id, access_token')
    .in(
      'item_id',
      items.map((item) => item.id as string),
    );

  if (secretsError) throw new HttpError(500, secretsError.message);

  const tokens = new Map(
    (secrets ?? []).map((row) => [
      row.item_id as string,
      row.access_token as string,
    ]),
  );

  for (const item of items) {
    const accessToken = tokens.get(item.id as string);

    // No token means the Item is already unusable — there is nothing to revoke
    // and nothing that could still be reading the user's bank.
    if (!accessToken) continue;

    try {
      await plaid(
        '/item/remove',
        { access_token: accessToken },
        parsePlaidEnvironment(item.plaid_environment),
      );
    } catch (error) {
      // See isAlreadyDisconnected: only ITEM_NOT_FOUND is benign now that each
      // Item carries its own environment.
      const alreadyGone =
        error instanceof PlaidApiError && isAlreadyDisconnected(error.code);

      if (!alreadyGone) {
        throw new HttpError(
          502,
          'Could not disconnect a bank connection from Plaid, so nothing was ' +
            'deleted. Try again in a few minutes.',
        );
      }
    }
  }

  return items.length;
}

Deno.serve(
  handler(async (req) => {
    const { userId, admin } = await requireUser(req);
    const body = await readJson<Body>(req);

    if (body.confirm !== true) {
      throw new HttpError(400, 'Deletion must be confirmed');
    }

    // Resolved leniently rather than through `requireCaller`, which refuses a
    // user with no household. A previous attempt that removed the household and
    // then failed to remove the Auth user would otherwise leave an account that
    // can neither be used nor deleted. Here it simply finishes the job.
    const householdId = await findHousehold(admin, userId);

    if (!householdId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new HttpError(500, error.message);

      return json({
        deleted: true,
        outcome: 'household-deleted' satisfies Outcome,
        connectionsRemoved: 0,
      });
    }

    const caller: Caller = { userId, householdId, admin };

    const { data: members, error: membersError } = await caller.admin
      .from('household_members')
      .select('user_id, role')
      .eq('household_id', caller.householdId);

    if (membersError) throw new HttpError(500, membersError.message);

    const plan = planAccountDeletion(
      (members ?? []).map((member) => ({
        user_id: member.user_id as string,
        role: member.role as string,
      })),
      caller.userId,
    );

    if (plan.action === 'refuse') throw new HttpError(409, plan.reason);

    let outcome: Outcome;
    let connectionsRemoved = 0;

    if (plan.action === 'delete-household') {
      connectionsRemoved = await disconnectPlaidItems(caller);

      // Cascades through every household-scoped table, including profiles.
      const { error } = await caller.admin
        .from('households')
        .delete()
        .eq('id', caller.householdId);

      if (error) throw new HttpError(500, error.message);
      outcome = 'household-deleted';
    } else {
      const { error: membershipError } = await caller.admin
        .from('household_members')
        .delete()
        .eq('household_id', caller.householdId)
        .eq('user_id', caller.userId);

      if (membershipError) throw new HttpError(500, membershipError.message);

      const { error: profileError } = await caller.admin
        .from('profiles')
        .delete()
        .eq('id', caller.userId);

      if (profileError) throw new HttpError(500, profileError.message);

      outcome = 'left-household';
    }

    // Last, because it is the one step that cannot be retried: with the Auth
    // user gone the caller can no longer prove who they were.
    const { error: userError } = await caller.admin.auth.admin.deleteUser(
      caller.userId,
    );

    if (userError) throw new HttpError(500, userError.message);

    return json({ deleted: true, outcome, connectionsRemoved });
  }),
);
