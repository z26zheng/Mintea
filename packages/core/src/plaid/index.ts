/**
 * Client-side wrappers around the Plaid Edge Functions.
 *
 * The app never talks to Plaid's API directly — it can't, because every Plaid
 * call needs the `client_secret` and per-Item `access_token`, neither of which
 * may ship in a bundle. These helpers call the Supabase functions that hold
 * them; `functions.invoke` forwards the user's JWT, and each function re-checks
 * that the caller belongs to the household it's acting on.
 */
import type { MinteaClient } from '../db/client';

export type LinkTokenResponse = { linkToken: string; expiration: string };

export type LinkTokenOptions = {
  itemId?: string;
  redirectUri?: string;
  /**
   * Optional E.164 number used only for this Link session. Supplying it asks
   * Plaid to verify that returning-user profile instead of relying on the
   * profile remembered on the current device.
   */
  phoneNumber?: string;
};

export type ExchangeResponse = {
  itemId: string;
  institutionName: string | null;
  accountsLinked: number;
};

export type SyncResponse = {
  added: number;
  modified: number;
  removed: number;
  accountsUpdated: number;
};

async function invoke<T>(
  client: MinteaClient,
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(name, {
    body: body ?? {},
  });

  if (error) {
    // FunctionsHttpError carries the response; surface the function's own
    // message rather than a generic "Edge Function returned a non-2xx status".
    // Typed structurally rather than as `Response` so this package needs no
    // DOM lib — it also runs under Hermes.
    const context = (error as { context?: { json?: () => Promise<unknown> } })
      .context;

    if (context && typeof context.json === 'function') {
      try {
        const payload = (await context.json()) as { error?: string };
        if (payload?.error) throw new Error(payload.error);
      } catch {
        // Fall through to the generic message below.
      }
    }

    throw new Error(error.message);
  }

  if (data === null) throw new Error(`${name} returned no data`);

  return data;
}

/**
 * Creates a Link token. Pass `itemId` to enter update mode, which re-opens
 * Link against an existing connection so the user can re-authenticate without
 * creating a duplicate Item. Pass `phoneNumber` for a new connection that
 * should verify a specific Plaid returning-user profile.
 */
export const createLinkToken = (
  client: MinteaClient,
  options: LinkTokenOptions = {},
) => invoke<LinkTokenResponse>(client, 'plaid-link-token', { ...options });

/**
 * Normalizes user-entered phone numbers for Plaid's E.164-only API.
 *
 * Ten-digit numbers are treated as US/Canada. International numbers must
 * include a leading `+`, which prevents us from guessing the country code.
 */
export function normalizePlaidPhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;

  return null;
}

/** Human-readable display for the North American numbers Mintea commonly uses. */
export function formatPlaidPhoneNumber(phoneNumber: string): string {
  const match = phoneNumber.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return match
    ? `+1 (${match[1]}) ${match[2]}-${match[3]}`
    : phoneNumber;
}

/** Exchanges the public token Link hands back, then imports the accounts. */
export const exchangePublicToken = (
  client: MinteaClient,
  input: {
    publicToken: string;
    phoneNumber?: string;
    institutionId?: string;
    institutionName?: string;
  },
) => invoke<ExchangeResponse>(client, 'plaid-exchange', { ...input });

/** Pulls new transactions and balances. Omit `itemId` to sync every Item. */
export const syncPlaidItem = (client: MinteaClient, itemId?: string) =>
  invoke<SyncResponse>(client, 'plaid-sync', itemId ? { itemId } : {});

/** Disconnects at Plaid and soft-deletes the Item's accounts. */
export const removePlaidItem = (client: MinteaClient, itemId: string) =>
  invoke<{ removed: true }>(client, 'plaid-remove', { itemId });
