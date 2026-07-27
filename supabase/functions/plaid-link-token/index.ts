/**
 * Creates a Plaid Link token.
 *
 * Two modes:
 *  - New connection: no `itemId`, requests the `transactions` product.
 *  - Update mode: `itemId` given, passes that Item's access token so Link
 *    re-authenticates the existing connection instead of creating a duplicate.
 */
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { plaid, requireEnv } from '../_shared/plaid.ts';
import { loadItemForCaller, requireCaller } from '../_shared/supabase.ts';

type Body = { itemId?: string; redirectUri?: string };

type LinkTokenCreateResponse = {
  link_token: string;
  expiration: string;
};

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const body = await readJson<Body>(req);

    const countryCodes = (Deno.env.get('PLAID_COUNTRY_CODES') ?? 'US')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);

    // Plaid posts here when new transactions are ready. Publicly reachable and
    // JWT-verified inside the webhook function itself.
    const webhook = `${requireEnv('SUPABASE_URL')}/functions/v1/plaid-webhook`;

    const request: Record<string, unknown> = {
      user: { client_user_id: caller.userId },
      client_name: 'Mintea',
      language: 'en',
      country_codes: countryCodes,
      webhook,
    };

    if (body.itemId) {
      const item = await loadItemForCaller(caller, body.itemId);
      // Update mode: `products` must be omitted or Plaid rejects the request.
      request.access_token = item.accessToken;
    } else {
      request.products = ['transactions'];
      request.transactions = { days_requested: 730 };
    }

    // Required for OAuth institutions on web; must exactly match an allowed
    // redirect URI configured in the Plaid dashboard.
    const redirectUri = body.redirectUri ?? Deno.env.get('PLAID_REDIRECT_URI');
    if (redirectUri) request.redirect_uri = redirectUri;

    const response = await plaid<LinkTokenCreateResponse>(
      '/link/token/create',
      request,
    );

    if (!response.link_token) {
      throw new HttpError(502, 'Plaid did not return a link token');
    }

    return json({
      linkToken: response.link_token,
      expiration: response.expiration,
    });
  }),
);
