/**
 * Minimal Plaid REST client.
 *
 * Deliberately `fetch` rather than the `plaid` npm SDK: the SDK is built around
 * Node's http stack and pulls in a large dependency tree, while the parts we
 * need are half a dozen JSON endpoints.
 *
 * `PLAID_CLIENT_ID` and `PLAID_SECRET` are read from the function environment
 * and never leave it.
 */
import { HttpError } from './http.ts';

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new HttpError(
      500,
      `Missing ${name}. Set it with: supabase secrets set ${name}=…`,
    );
  }

  return value;
}

const PLAID_HOSTS: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

export function plaidHost(): string {
  const env = Deno.env.get('PLAID_ENV') ?? 'sandbox';
  const host = PLAID_HOSTS[env];

  if (!host) {
    throw new HttpError(
      500,
      `PLAID_ENV must be "sandbox" or "production" (got "${env}")`,
    );
  }

  return host;
}

export type PlaidErrorBody = {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
};

export class PlaidApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: PlaidErrorBody,
  ) {
    super(body.error_message ?? `Plaid request failed (${status})`);
    this.name = 'PlaidApiError';
  }

  get code(): string | null {
    return this.body.error_code ?? null;
  }
}

export async function plaid<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${plaidHost()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('PLAID_CLIENT_ID'),
      secret: requireEnv('PLAID_SECRET'),
      ...body,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new PlaidApiError(response.status, payload as PlaidErrorBody);
  }

  return payload as T;
}

// ------------------------------------------------------------ response types

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: {
    current: number | null;
    available: number | null;
    limit: number | null;
    iso_currency_code: string | null;
    unofficial_currency_code: string | null;
  };
};

export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  logo_url: string | null;
  pending: boolean;
  pending_transaction_id: string | null;
  personal_finance_category: {
    primary: string;
    detailed: string;
    confidence_level?: string;
  } | null;
};

export type TransactionsSyncResponse = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
};

export type InstitutionResponse = {
  institution: {
    institution_id: string;
    name: string;
    logo: string | null;
    primary_color: string | null;
  };
};

/**
 * Plaid returns amounts as floats. Rounding through cents here is the single
 * point where that float becomes an exact integer.
 */
export const toCents = (amount: number | null | undefined): number =>
  amount == null ? 0 : Math.round(amount * 100);

/** Plaid's account taxonomy mapped onto ours. */
export function mapAccountType(
  type: string,
): 'depository' | 'credit' | 'loan' | 'investment' | 'other' {
  switch (type) {
    case 'depository':
      return 'depository';
    case 'credit':
      return 'credit';
    case 'loan':
      return 'loan';
    case 'investment':
    case 'brokerage':
      return 'investment';
    default:
      return 'other';
  }
}

export const isAssetAccount = (type: string): boolean => {
  const mapped = mapAccountType(type);
  return mapped !== 'credit' && mapped !== 'loan';
};
