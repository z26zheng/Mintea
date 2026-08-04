/**
 * Minimal Plaid REST client.
 *
 * Deliberately `fetch` rather than the `plaid` npm SDK: the SDK is built around
 * Node's http stack and pulls in a large dependency tree, while the parts we
 * need are half a dozen JSON endpoints.
 *
 * `PLAID_CLIENT_ID` and the per-environment secrets are read from the function
 * environment and never leave it.
 *
 * Every call names its environment explicitly. The environment-resolution
 * helpers live in `plaidEnvironment.ts` because they have to be unit-testable
 * from Node, which cannot import this file.
 */
import { HttpError } from './http.ts';
import {
  parsePlaidEnvironment,
  plaidHost,
  plaidSecretNames,
  type PlaidEnvironment,
} from './plaidEnvironment.ts';

export {
  isPlaidEnvironment,
  parsePlaidEnvironment,
  plaidHost,
  plaidSecretNames,
  PLAID_ENVIRONMENTS,
  type PlaidEnvironment,
} from './plaidEnvironment.ts';

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

/**
 * The secret for one environment.
 *
 * Tries `PLAID_SECRET_SANDBOX` / `PLAID_SECRET_PRODUCTION` first and falls back
 * to the original `PLAID_SECRET`, so a project mid-migration — or one that only
 * ever uses a single environment — keeps working.
 */
export function plaidSecret(environment: PlaidEnvironment): string {
  const names = plaidSecretNames(environment);

  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }

  throw new HttpError(
    500,
    `Missing the Plaid secret for the ${environment} environment. Set it with: ` +
      `supabase secrets set ${names[0]}=…`,
  );
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

/**
 * `environment` is required and has no default. Every caller must therefore
 * have resolved it from the household or from the stored Item, which is what
 * makes a cross-environment call impossible rather than merely unlikely.
 */
export async function plaid<T>(
  path: string,
  body: Record<string, unknown>,
  environment: PlaidEnvironment,
): Promise<T> {
  const env = parsePlaidEnvironment(environment);

  const response = await fetch(`${plaidHost(env)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Shared across environments; only the secret differs.
      client_id: requireEnv('PLAID_CLIENT_ID'),
      secret: plaidSecret(env),
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
