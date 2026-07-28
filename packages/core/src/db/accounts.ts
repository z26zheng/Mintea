import type { MinteaClient } from './client';
import { unwrap } from './client';
import type {
  AccountRow,
  AccountType,
  PlaidItemRow,
} from '../types/database';
import type { AccountWithInstitution } from '../domain/accounts';
import { isAssetType } from '../domain/accounts';
import { toIsoDateInTimeZone } from '../domain/dates';

export async function fetchAccounts(
  client: MinteaClient,
): Promise<AccountRow[]> {
  return unwrap(
    await client
      .from('accounts')
      .select('*')
      .is('deleted_at', null)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
  );
}

export async function fetchPlaidItems(
  client: MinteaClient,
): Promise<PlaidItemRow[]> {
  return unwrap(await client.from('plaid_items').select('*'));
}

/**
 * Joins accounts to their institution in JS rather than with a PostgREST
 * embedded select. There are only ever a handful of Items, and this keeps the
 * two result sets independently cacheable — a balance refresh doesn't
 * invalidate institution metadata.
 */
export function attachInstitutions(
  accounts: AccountRow[],
  items: PlaidItemRow[],
): AccountWithInstitution[] {
  const byId = new Map(items.map((item) => [item.id, item]));

  return accounts.map((account) => {
    const item = account.plaid_item_id
      ? byId.get(account.plaid_item_id)
      : undefined;

    return {
      ...account,
      institution: item
        ? {
            name: item.institution_name,
            logo: item.institution_logo,
            status: item.status,
            errorMessage: item.error_message,
          }
        : null,
    };
  });
}

export type CreateManualAccountInput = {
  householdId: string;
  name: string;
  type: AccountType;
  subtype?: string | null;
  /**
   * What the account is worth as a positive number. The signed net-worth
   * contribution is derived from `isAsset`, so callers never deal with signs.
   */
  balanceCents: number;
  isAsset?: boolean;
  currency?: string;
};

export async function createManualAccount(
  client: MinteaClient,
  input: CreateManualAccountInput,
): Promise<AccountRow> {
  const isAsset = input.isAsset ?? isAssetType(input.type);
  const signedBalance = isAsset
    ? Math.abs(input.balanceCents)
    : -Math.abs(input.balanceCents);

  const account = unwrap(
    await client
      .from('accounts')
      .insert({
        household_id: input.householdId,
        name: input.name,
        type: input.type,
        subtype: input.subtype ?? null,
        currency: input.currency ?? 'USD',
        current_balance_cents: signedBalance,
        is_asset: isAsset,
        is_manual: true,
      })
      .select()
      .single(),
  );

  // Seed today's snapshot so the account appears on the net worth chart
  // immediately rather than after the first nightly sync.
  await recordBalanceSnapshot(client, {
    householdId: input.householdId,
    accountId: account.id,
    balanceCents: signedBalance,
  });

  return account;
}

export async function updateAccount(
  client: MinteaClient,
  id: string,
  patch: Partial<
    Pick<
      AccountRow,
      | 'name'
      | 'type'
      | 'subtype'
      | 'is_asset'
      | 'is_hidden'
      | 'include_in_net_worth'
      | 'display_order'
      | 'current_balance_cents'
      | 'limit_cents'
    >
  >,
): Promise<AccountRow> {
  return unwrap(
    await client.from('accounts').update(patch).eq('id', id).select().single(),
  );
}

/**
 * Updates a manual account's balance and records the snapshot, so the net worth
 * history reflects the change from today forward.
 */
export async function setManualBalance(
  client: MinteaClient,
  account: AccountRow,
  balanceCents: number,
): Promise<AccountRow> {
  const signed = account.is_asset
    ? Math.abs(balanceCents)
    : -Math.abs(balanceCents);

  const updated = await updateAccount(client, account.id, {
    current_balance_cents: signed,
  });

  await recordBalanceSnapshot(client, {
    householdId: account.household_id,
    accountId: account.id,
    balanceCents: signed,
  });

  return updated;
}

export async function recordBalanceSnapshot(
  client: MinteaClient,
  input: {
    householdId: string;
    accountId: string;
    balanceCents: number;
    date?: string;
  },
): Promise<void> {
  let date = input.date;

  if (!date) {
    const household = unwrap(
      await client
        .from('households')
        .select('timezone')
        .eq('id', input.householdId)
        .single(),
    );

    date = toIsoDateInTimeZone(new Date(), household.timezone);
  }

  const { error } = await client.from('account_balances').upsert(
    {
      household_id: input.householdId,
      account_id: input.accountId,
      date,
      balance_cents: input.balanceCents,
    },
    { onConflict: 'account_id,date' },
  );

  if (error) throw new Error(error.message);
}

/**
 * Soft delete. Transactions and balance history are kept so historical reports
 * don't silently change; the account just stops appearing.
 */
export async function softDeleteAccount(
  client: MinteaClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
