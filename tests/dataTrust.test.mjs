import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findDuplicateAccountCandidates,
  normalizeIdentityText,
} from '../packages/core/src/domain/dataTrust.ts';

const linkedAccount = (overrides = {}) => ({
  id: 'account-a',
  household_id: 'household',
  plaid_item_id: 'item-a',
  plaid_account_id: 'plaid-account-a',
  name: 'Total Checking',
  official_name: 'TOTAL CHECKING',
  mask: '1234',
  type: 'depository',
  subtype: 'checking',
  currency: 'USD',
  current_balance_cents: 245_67,
  available_balance_cents: 200_00,
  limit_cents: null,
  is_asset: true,
  is_manual: false,
  is_hidden: false,
  include_in_net_worth: true,
  display_order: 0,
  deleted_at: null,
  merged_into_account_id: null,
  merged_at: null,
  merged_by_user_id: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  institution: {
    id: 'ins_1',
    name: 'Example Bank',
    logo: null,
    phoneNumber: '+14155550100',
    status: 'good',
    errorMessage: null,
    lastSyncedAt: '2026-07-28T10:00:00.000Z',
  },
  ...overrides,
});

test('normalizes formatting without making partial names equivalent', () => {
  assert.equal(normalizeIdentityText(' Example-Bank, N.A. '), 'examplebankna');
  assert.notEqual(
    normalizeIdentityText('Example'),
    normalizeIdentityText('Example Bank'),
  );
});

test('finds a cross-Item duplicate only from strong account identity signals', () => {
  const first = linkedAccount();
  const second = linkedAccount({
    id: 'account-b',
    plaid_item_id: 'item-b',
    plaid_account_id: 'plaid-account-b',
    institution: {
      ...first.institution,
      phoneNumber: '+14155550101',
      lastSyncedAt: '2026-07-27T10:00:00.000Z',
    },
  });

  const [candidate] = findDuplicateAccountCandidates([first, second]);

  assert.equal(candidate?.confidence, 'high');
  assert.equal(candidate?.recommendedKeepId, first.id);
  assert.match(candidate?.reasons.join(' ') ?? '', /last four/);
});

test('prefers the healthier connection even when it synced less recently', () => {
  const first = linkedAccount({
    institution: {
      ...linkedAccount().institution,
      status: 'login_required',
      lastSyncedAt: '2026-07-28T12:00:00.000Z',
    },
  });
  const second = linkedAccount({
    id: 'account-b',
    plaid_item_id: 'item-b',
    plaid_account_id: 'plaid-account-b',
    institution: {
      ...linkedAccount().institution,
      status: 'good',
      lastSyncedAt: '2026-07-20T12:00:00.000Z',
    },
  });

  assert.equal(
    findDuplicateAccountCandidates([first, second])[0]?.recommendedKeepId,
    second.id,
  );
});

test('rejects ambiguous or unsafe account pairs', () => {
  const base = linkedAccount();
  const variants = [
    linkedAccount({ id: 'same-item', plaid_account_id: 'other' }),
    linkedAccount({
      id: 'other-mask',
      plaid_item_id: 'item-b',
      mask: '9876',
    }),
    linkedAccount({
      id: 'other-bank',
      plaid_item_id: 'item-b',
      institution: { ...base.institution, id: 'ins_2' },
    }),
    linkedAccount({
      id: 'other-currency',
      plaid_item_id: 'item-b',
      currency: 'CAD',
    }),
    linkedAccount({
      id: 'manual',
      plaid_item_id: 'item-b',
      is_manual: true,
    }),
    linkedAccount({
      id: 'archived',
      plaid_item_id: 'item-b',
      deleted_at: '2026-07-28T00:00:00.000Z',
    }),
  ];

  for (const variant of variants) {
    assert.deepEqual(
      findDuplicateAccountCandidates([base, variant]),
      [],
      `unexpected candidate ${variant.id}`,
    );
  }
});

test('uses exact normalized institution name only when a provider id is absent', () => {
  const first = linkedAccount({
    institution: { ...linkedAccount().institution, id: null },
  });
  const formattedMatch = linkedAccount({
    id: 'account-b',
    plaid_item_id: 'item-b',
    institution: {
      ...linkedAccount().institution,
      id: null,
      name: 'Example-Bank',
    },
  });
  const partialName = linkedAccount({
    id: 'account-c',
    plaid_item_id: 'item-c',
    institution: { ...linkedAccount().institution, id: null, name: 'Example' },
  });

  assert.equal(
    findDuplicateAccountCandidates([first, formattedMatch]).length,
    1,
  );
  assert.equal(findDuplicateAccountCandidates([first, partialName]).length, 0);
});
