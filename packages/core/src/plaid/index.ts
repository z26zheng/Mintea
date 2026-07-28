/**
 * Client-side wrappers around the Plaid Edge Functions.
 *
 * The app never talks to Plaid's API directly — it can't, because every Plaid
 * call needs the `client_secret` and per-Item `access_token`, neither of which
 * may ship in a bundle. These helpers call the Supabase functions that hold
 * them; `functions.invoke` forwards the user's JWT, and each function re-checks
 * that the caller belongs to the household it's acting on.
 */
import { invokeFunction, type MinteaClient } from '../db/client';

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
  /** Number of Plaid Items that received a real-time Balance request. */
  balanceRefreshes: number;
  /** Number of Items protected from another Balance request by the cooldown. */
  balanceRefreshesSkipped: number;
  balanceRefreshCooldownSeconds: number;
  errors?: string[];
};

/** Shared with the property functions; see `invokeFunction` in db/client. */
const invoke = invokeFunction;

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

// Re-exported from its home in `domain/phone` so existing imports of
// `@mintea/core` keep working.
export {
  formatPlaidPhoneNumber,
  normalizePlaidPhoneNumber,
} from '../domain/phone';


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

/**
 * Pulls new transactions and refreshes real-time balances when the server-side
 * cooldown permits it. Omit `itemId` to sync every Item.
 */
export const syncPlaidItem = (client: MinteaClient, itemId?: string) =>
  invoke<SyncResponse>(client, 'plaid-sync', itemId ? { itemId } : {});

/** Disconnects at Plaid and soft-deletes the Item's accounts. */
export const removePlaidItem = (client: MinteaClient, itemId: string) =>
  invoke<{ removed: true }>(client, 'plaid-remove', { itemId });
