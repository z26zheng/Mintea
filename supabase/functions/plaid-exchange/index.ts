/**
 * Exchanges the public token Plaid Link returns for a long-lived access token,
 * stores it out of reach of the client, and imports the Item's accounts.
 *
 * The access token is written to `plaid_item_secrets`, a table with RLS on and
 * no policies — only the service role used here can ever read it back.
 */
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import {
  isAssetAccount,
  mapAccountType,
  plaid,
  toCents,
  type InstitutionResponse,
  type PlaidAccount,
} from '../_shared/plaid.ts';
import { requireCaller } from '../_shared/supabase.ts';

type Body = { publicToken?: string };

type ExchangeResponse = { access_token: string; item_id: string };
type ItemGetResponse = { item: { institution_id: string | null } };
type AccountsGetResponse = { accounts: PlaidAccount[] };

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const { publicToken } = await readJson<Body>(req);

    if (!publicToken) {
      throw new HttpError(400, 'publicToken is required');
    }

    const exchange = await plaid<ExchangeResponse>(
      '/item/public_token/exchange',
      { public_token: publicToken },
    );

    const accessToken = exchange.access_token;

    // Institution metadata isn't in the exchange response; fetch it so the UI
    // has a name and logo to show straight away.
    const itemInfo = await plaid<ItemGetResponse>('/item/get', {
      access_token: accessToken,
    });

    const institutionId = itemInfo.item.institution_id;
    let institutionName: string | null = null;
    let institutionLogo: string | null = null;

    if (institutionId) {
      try {
        const institution = await plaid<InstitutionResponse>(
          '/institutions/get_by_id',
          {
            institution_id: institutionId,
            country_codes: (Deno.env.get('PLAID_COUNTRY_CODES') ?? 'US')
              .split(',')
              .map((code) => code.trim())
              .filter(Boolean),
            options: { include_optional_metadata: true },
          },
        );
        institutionName = institution.institution.name;
        institutionLogo = institution.institution.logo;
      } catch (error) {
        // Cosmetic only — never fail a connection over a missing logo.
        console.warn('Could not load institution metadata', error);
      }
    }

    const { data: item, error: itemError } = await caller.admin
      .from('plaid_items')
      .insert({
        household_id: caller.householdId,
        plaid_item_id: exchange.item_id,
        plaid_institution_id: institutionId,
        institution_name: institutionName,
        institution_logo: institutionLogo,
        status: 'good',
      })
      .select('id')
      .single();

    if (itemError || !item) {
      // A duplicate `plaid_item_id` means this institution is already linked.
      if (itemError?.code === '23505') {
        throw new HttpError(409, 'That institution is already connected');
      }
      throw new HttpError(500, itemError?.message ?? 'Could not save connection');
    }

    const { error: secretError } = await caller.admin
      .from('plaid_item_secrets')
      .insert({ item_id: item.id, access_token: accessToken });

    if (secretError) {
      // Without the token the Item is useless; roll it back rather than leaving
      // a broken connection in the list.
      await caller.admin.from('plaid_items').delete().eq('id', item.id);
      throw new HttpError(500, 'Could not store connection credentials');
    }

    const { accounts } = await plaid<AccountsGetResponse>('/accounts/get', {
      access_token: accessToken,
    });

    const today = new Date().toISOString().slice(0, 10);

    const rows = accounts.map((account, index) => {
      const isAsset = isAssetAccount(account.type);
      const magnitude = toCents(account.balances.current);

      return {
        household_id: caller.householdId,
        plaid_item_id: item.id,
        plaid_account_id: account.account_id,
        name: account.name,
        official_name: account.official_name,
        mask: account.mask,
        type: mapAccountType(account.type),
        subtype: account.subtype,
        currency:
          account.balances.iso_currency_code ??
          account.balances.unofficial_currency_code ??
          'USD',
        // Stored as the signed contribution to net worth.
        current_balance_cents: isAsset ? magnitude : -magnitude,
        available_balance_cents:
          account.balances.available === null
            ? null
            : toCents(account.balances.available),
        limit_cents:
          account.balances.limit === null ? null : toCents(account.balances.limit),
        is_asset: isAsset,
        is_manual: false,
        display_order: index,
      };
    });

    const { data: inserted, error: accountsError } = await caller.admin
      .from('accounts')
      .upsert(rows, { onConflict: 'plaid_item_id,plaid_account_id' })
      .select('id, current_balance_cents');

    if (accountsError) {
      throw new HttpError(500, accountsError.message);
    }

    // Seed today's snapshot so the net worth chart has a point immediately.
    if (inserted?.length) {
      await caller.admin.from('account_balances').upsert(
        inserted.map((account) => ({
          household_id: caller.householdId,
          account_id: account.id,
          date: today,
          balance_cents: account.current_balance_cents,
        })),
        { onConflict: 'account_id,date' },
      );
    }

    return json({
      itemId: item.id,
      institutionName,
      accountsLinked: rows.length,
    });
  }),
);
