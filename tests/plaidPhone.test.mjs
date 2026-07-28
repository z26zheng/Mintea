import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePlaidPhoneNumber } from '../packages/core/src/plaid/index.ts';

test('normalizes US and Canadian Plaid phone numbers to E.164', () => {
  assert.equal(normalizePlaidPhoneNumber('(415) 555-0010'), '+14155550010');
  assert.equal(normalizePlaidPhoneNumber('1 416 555 0022'), '+14165550022');
});

test('preserves an explicit international country code', () => {
  assert.equal(normalizePlaidPhoneNumber('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePlaidPhoneNumber('+52 55 1234 5678'), '+525512345678');
});

test('rejects ambiguous or invalid phone numbers', () => {
  assert.equal(normalizePlaidPhoneNumber(''), null);
  assert.equal(normalizePlaidPhoneNumber('555-0010'), null);
  assert.equal(normalizePlaidPhoneNumber('44 7700 900123'), null);
  assert.equal(normalizePlaidPhoneNumber('+0123456789'), null);
  assert.equal(normalizePlaidPhoneNumber('+1234567890123456'), null);
});
