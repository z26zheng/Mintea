import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTransactionMatch,
  resolveTransactionCleanup,
} from '../supabase/functions/_shared/transactionRules.ts';

test('transaction rule matching normalizes only case and whitespace', () => {
  assert.equal(
    normalizeTransactionMatch('  BLUE   Bottle Coffee #1842  '),
    'blue bottle coffee #1842',
  );
  assert.notEqual(
    normalizeTransactionMatch('BLUE BOTTLE COFFEE #1842'),
    normalizeTransactionMatch('BLUE BOTTLE COFFEE #1843'),
  );
  assert.notEqual(
    normalizeTransactionMatch('BLUE-BOTTLE'),
    normalizeTransactionMatch('BLUE BOTTLE'),
  );
});

test('rules beat Plaid defaults while explicit pending edits beat rules', () => {
  assert.deepEqual(
    resolveTransactionCleanup({
      bankMerchantId: 'bank-merchant',
      bankCategoryId: 'bank-category',
      rule: {
        merchantId: 'rule-merchant',
        categoryId: 'rule-category',
      },
    }),
    {
      merchantId: 'rule-merchant',
      categoryId: 'rule-category',
      needsReview: false,
      merchantOverridden: true,
    },
  );

  assert.deepEqual(
    resolveTransactionCleanup({
      bankMerchantId: 'bank-merchant',
      bankCategoryId: 'bank-category',
      rule: {
        merchantId: 'rule-merchant',
        categoryId: 'rule-category',
      },
      pending: {
        merchantId: null,
        merchantOverridden: true,
        categoryId: 'user-category',
        needsReview: false,
      },
    }),
    {
      merchantId: null,
      categoryId: 'user-category',
      needsReview: false,
      merchantOverridden: true,
    },
  );
});
