/**
 * Which Plaid environment a call belongs to, and where it should go.
 *
 * Deliberately dependency-free. Deno and Docker are not installed on the dev
 * machine, so Edge Functions cannot be run or type-checked locally; the only
 * way to test this logic is to import it from `tests/*.test.mjs` under Node's
 * type-stripping loader. That loader rejects TypeScript parameter properties,
 * which both `HttpError` and `PlaidApiError` use — so importing `plaid.ts` or
 * `http.ts` from here would make the whole module untestable. Everything in
 * this file is a pure function over strings for the same reason.
 *
 * The environment is a property of the household and of each stored Item. It
 * is never read from a request, and never inferred from a global secret at
 * call time — see the migration that added `plaid_environment` for why.
 */

export type PlaidEnvironment = 'sandbox' | 'production';

export const PLAID_ENVIRONMENTS: readonly PlaidEnvironment[] = [
  'sandbox',
  'production',
];

const PLAID_HOSTS: Record<PlaidEnvironment, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

export function isPlaidEnvironment(value: unknown): value is PlaidEnvironment {
  return value === 'sandbox' || value === 'production';
}

/** Renders an unusable value for an error message without dumping objects. */
function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return typeof value;
}

/**
 * Validates an environment, throwing when it is missing or unrecognised.
 *
 * There is deliberately no default. The previous code fell back to `sandbox`
 * whenever `PLAID_ENV` was unset, which meant a single missing secret would
 * silently route production access tokens at the sandbox host: every call
 * fails with INVALID_ACCESS_TOKEN, and nothing records that the Item and the
 * request disagreed. A loud failure is the only safe behaviour here.
 */
export function parsePlaidEnvironment(value: unknown): PlaidEnvironment {
  if (!isPlaidEnvironment(value)) {
    throw new Error(
      `Plaid environment must be "sandbox" or "production" (got ${describe(value)})`,
    );
  }

  return value;
}

export function plaidHost(environment: PlaidEnvironment): string {
  return PLAID_HOSTS[parsePlaidEnvironment(environment)];
}

/**
 * Secret names to try for an environment, most specific first.
 *
 * The bare `PLAID_SECRET` fallback keeps the deploy from being ordering-
 * sensitive: functions can ship before the new secrets exist, and a project
 * that only ever uses one environment never has to set them at all.
 */
export function plaidSecretNames(environment: PlaidEnvironment): string[] {
  return [
    `PLAID_SECRET_${parsePlaidEnvironment(environment).toUpperCase()}`,
    'PLAID_SECRET',
  ];
}
