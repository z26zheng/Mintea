import assert from 'node:assert/strict';
import test from 'node:test';

import { filterAccountsForList } from '../packages/core/src/domain/accountList.ts';

test('the zero-balance account filter is reversible and keeps nonzero rows', () => {
  const accounts = [
    { id: 'zero', current_balance_cents: 0, is_hidden: false },
    { id: 'asset', current_balance_cents: 125_00, is_hidden: false },
    { id: 'debt', current_balance_cents: -80_00, is_hidden: false },
    { id: 'hidden-zero', current_balance_cents: 0, is_hidden: true },
  ];

  assert.deepEqual(
    filterAccountsForList(accounts).map((account) => account.id),
    ['zero', 'asset', 'debt'],
  );
  assert.deepEqual(
    filterAccountsForList(accounts, true).map((account) => account.id),
    ['asset', 'debt'],
  );
});
