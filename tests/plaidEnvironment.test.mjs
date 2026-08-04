// Plaid environment resolution.
//
// Deno and Docker are not installed on the dev machine, so the Edge Functions
// cannot be run or type-checked locally. These pure helpers are the only part
// of the environment routing that can be proven before deploying, which is
// exactly why they were split out of `plaid.ts` into their own module.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPlaidEnvironment,
  parsePlaidEnvironment,
  plaidHost,
  plaidSecretNames,
  PLAID_ENVIRONMENTS,
} from '../supabase/functions/_shared/plaidEnvironment.ts';

test('the two supported environments are the only ones recognised', () => {
  assert.deepEqual([...PLAID_ENVIRONMENTS], ['sandbox', 'production']);

  assert.equal(isPlaidEnvironment('sandbox'), true);
  assert.equal(isPlaidEnvironment('production'), true);

  // Plaid retired "development" in 2024; accepting it would route to a host
  // that no longer exists.
  assert.equal(isPlaidEnvironment('development'), false);
  assert.equal(isPlaidEnvironment('Production'), false);
  assert.equal(isPlaidEnvironment(''), false);
  assert.equal(isPlaidEnvironment(undefined), false);
  assert.equal(isPlaidEnvironment(null), false);
});

test('each environment resolves to its own host', () => {
  assert.equal(plaidHost('sandbox'), 'https://sandbox.plaid.com');
  assert.equal(plaidHost('production'), 'https://production.plaid.com');
});

test('a missing environment fails loudly instead of defaulting', () => {
  // The regression this guards: plaidHost() used to read one global secret and
  // fall back to `sandbox` when it was unset, so a single missing value routed
  // production access tokens at the sandbox host. There must be no default.
  assert.throws(() => parsePlaidEnvironment(undefined), /got nothing/);
  assert.throws(() => parsePlaidEnvironment(null), /got null/);
  assert.throws(() => parsePlaidEnvironment(''), /sandbox.*production/);
});

test('an unrecognised environment is refused, and named in the error', () => {
  assert.throws(() => parsePlaidEnvironment('developement'), /"developement"/);
  assert.throws(() => plaidHost('staging'), /"staging"/);
  assert.throws(() => plaidSecretNames(42), /number/);
});

test('secret lookup prefers the environment-specific name', () => {
  assert.deepEqual(plaidSecretNames('sandbox'), [
    'PLAID_SECRET_SANDBOX',
    'PLAID_SECRET',
  ]);
  assert.deepEqual(plaidSecretNames('production'), [
    'PLAID_SECRET_PRODUCTION',
    'PLAID_SECRET',
  ]);
});

test('the bare PLAID_SECRET stays available as a fallback', () => {
  // Deploys are not ordering-sensitive: functions can ship before the new
  // secrets exist, and a single-environment project never has to set them.
  for (const environment of PLAID_ENVIRONMENTS) {
    const names = plaidSecretNames(environment);
    assert.equal(names.at(-1), 'PLAID_SECRET');
    assert.equal(names.length, 2);
  }
});
