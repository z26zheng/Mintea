/**
 * Creates a Plaid Link token.
 *
 * Two modes:
 *  - New connection: no `itemId`, requests the `transactions` product. An
 *    optional E.164 `phoneNumber` selects a specific Plaid returning-user
 *    profile for this Link session.
 *  - Update mode: `itemId` given, passes that Item's access token so Link
 *    re-authenticates the existing connection instead of creating a duplicate.
 */
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { plaid, requireEnv } from '../_shared/plaid.ts';
import { loadItemForCaller, requireCaller } from '../_shared/supabase.ts';

type Body = {
  itemId?: string;
  redirectUri?: string;
  phoneNumber?: string;
  platform?: 'ios' | 'android' | 'web';
};

/**
 * Package name registered with Plaid for the Android app. It has to be sent on
 * every Android Link session and has to match the Dashboard entry exactly, or
 * OAuth institutions refuse to hand the user back.
 */
const ANDROID_PACKAGE_NAME =
  Deno.env.get('PLAID_ANDROID_PACKAGE_NAME') ?? 'com.mintea.app';

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

    let phoneNumber: string | undefined;

    if (body.phoneNumber !== undefined) {
      if (
        typeof body.phoneNumber !== 'string' ||
        !/^\+[1-9]\d{7,14}$/.test(body.phoneNumber)
      ) {
        throw new HttpError(
          400,
          'Enter a valid phone number including its country code',
        );
      }

      if (body.itemId) {
        throw new HttpError(
          400,
          'A different phone number cannot be used while reconnecting an existing institution',
        );
      }

      phoneNumber = body.phoneNumber;
    }

    const request: Record<string, unknown> = {
      user: {
        client_user_id: caller.userId,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      },
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

    // How an OAuth institution gets the user back differs per platform.
    //
    // Android uses the package name and Plaid rejects a request that also
    // carries a redirect URI. iOS and web use a redirect URI, but not the same
    // one: iOS needs a universal link the app claims, web needs a page on the
    // deployment that opened Link. Each must be registered in the Plaid
    // Dashboard before OAuth banks will work.
    if (body.platform === 'android') {
      request.android_package_name = ANDROID_PACKAGE_NAME;
    } else {
      const redirectUri =
        body.redirectUri ??
        (body.platform === 'ios'
          ? Deno.env.get('PLAID_IOS_REDIRECT_URI')
          : undefined) ??
        Deno.env.get('PLAID_REDIRECT_URI');

      if (redirectUri) request.redirect_uri = redirectUri;
    }

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
