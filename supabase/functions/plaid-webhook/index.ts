/**
 * Receives Plaid webhooks.
 *
 * This is the one function reachable without a user session (see
 * `verify_jwt = false` in supabase/config.toml), so it authenticates the
 * request itself: Plaid signs every webhook with an ES256 JWT whose
 * `request_body_sha256` claim must match the body we actually received.
 * Without that check anyone could POST here and trigger syncs or flip an
 * Item's status.
 */
import { jwtVerify, decodeProtectedHeader, importJWK, type JWK } from 'npm:jose@5';
import { corsHeaders, handler, json } from '../_shared/http.ts';
import { plaid } from '../_shared/plaid.ts';
import { serviceClient } from '../_shared/supabase.ts';
import {
  syncCachedBalances,
  syncTransactions,
} from '../_shared/sync.ts';

type WebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string; error_message?: string } | null;
  consent_expiration_time?: string | null;
};

const MAX_AGE_SECONDS = 5 * 60;

const keyCache = new Map<string, JWK>();

async function verificationKey(keyId: string): Promise<JWK> {
  const cached = keyCache.get(keyId);
  if (cached) return cached;

  const response = await plaid<{ key: JWK }>('/webhook_verification_key/get', {
    key_id: keyId,
  });

  keyCache.set(keyId, response.key);
  return response.key;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns true only if the request genuinely came from Plaid. */
async function isFromPlaid(token: string, rawBody: string): Promise<boolean> {
  try {
    const header = decodeProtectedHeader(token);

    // Plaid signs with ES256. Refusing anything else blocks the classic
    // "alg: none" and HMAC-confusion downgrades.
    if (header.alg !== 'ES256' || !header.kid) return false;

    const key = await importJWK(await verificationKey(header.kid), 'ES256');
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'] });

    const issuedAt = payload.iat;
    if (typeof issuedAt !== 'number') return false;
    if (Math.floor(Date.now() / 1000) - issuedAt > MAX_AGE_SECONDS) return false;

    const expected = payload.request_body_sha256;
    if (typeof expected !== 'string') return false;

    const actual = await sha256Hex(rawBody);

    // Constant-time comparison; both are fixed-length hex digests.
    if (expected.length !== actual.length) return false;

    let mismatch = 0;
    for (let i = 0; i < expected.length; i += 1) {
      mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    }

    return mismatch === 0;
  } catch (error) {
    console.warn('Webhook verification failed', error);
    return false;
  }
}

Deno.serve(
  handler(async (req) => {
    const token = req.headers.get('plaid-verification');
    const rawBody = await req.text();

    if (!token || !(await isFromPlaid(token, rawBody))) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = JSON.parse(rawBody) as WebhookBody;
    const admin = serviceClient();

    if (!body.item_id) return json({ ignored: true });

    const { data: item } = await admin
      .from('plaid_items')
      .select(
        'id, household_id, transactions_cursor, last_balance_refreshed_at',
      )
      .eq('plaid_item_id', body.item_id)
      .maybeSingle();

    if (!item) {
      // An Item we no longer track — acknowledge so Plaid stops retrying.
      return json({ ignored: true });
    }

    const code = body.webhook_code;

    if (body.webhook_type === 'ITEM') {
      const status =
        code === 'ERROR'
          ? body.error?.error_code === 'ITEM_LOGIN_REQUIRED'
            ? 'login_required'
            : 'error'
          : code === 'PENDING_EXPIRATION'
            ? 'pending_expiration'
            : code === 'USER_PERMISSION_REVOKED'
              ? 'revoked'
              : code === 'LOGIN_REPAIRED'
                ? 'good'
                : null;

      if (status) {
        await admin
          .from('plaid_items')
          .update({
            status,
            error_code: body.error?.error_code ?? null,
            error_message: body.error?.error_message ?? null,
            consent_expires_at: body.consent_expiration_time ?? null,
          })
          .eq('id', item.id);
      }

      return json({ handled: code });
    }

    const shouldSync =
      body.webhook_type === 'TRANSACTIONS' &&
      (code === 'SYNC_UPDATES_AVAILABLE' ||
        code === 'INITIAL_UPDATE' ||
        code === 'HISTORICAL_UPDATE' ||
        code === 'DEFAULT_UPDATE');

    if (!shouldSync) return json({ ignored: true, code });

    const { data: secret } = await admin
      .from('plaid_item_secrets')
      .select('access_token')
      .eq('item_id', item.id)
      .single();

    if (!secret) return json({ ignored: true });

    const syncContext = {
      id: item.id as string,
      householdId: item.household_id as string,
      accessToken: secret.access_token as string,
      cursor: item.transactions_cursor as string | null,
      lastBalanceRefreshedAt:
        item.last_balance_refreshed_at as string | null,
    };

    const result = await syncTransactions(admin, syncContext);

    // Best effort only. `/accounts/get` uses Plaid's free cached balances, so
    // transaction webhooks continue producing daily net-worth snapshots
    // without ever invoking the billable real-time Balance endpoint.
    let accountsUpdated = 0;
    try {
      accountsUpdated = await syncCachedBalances(admin, syncContext);
    } catch (error) {
      console.warn('Could not sync cached balances after webhook', error);
    }

    return json({ handled: code, ...result, accountsUpdated });
  }),
);
