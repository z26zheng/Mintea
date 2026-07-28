import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BALANCE_REFRESH_COOLDOWN_MS,
  BALANCE_REFRESH_COOLDOWN_SECONDS,
  balanceRefreshWindow,
  cachedBalanceSyncDue,
} from '../supabase/functions/_shared/balanceThrottle.ts';

const NOW = new Date('2026-07-28T20:00:00.000Z');

test('a Plaid Item with no real-time balance refresh is immediately due', () => {
  assert.deepEqual(balanceRefreshWindow(null, NOW), {
    due: true,
    nextRefreshAt: null,
  });
});

test('real-time balance refreshes are throttled for one hour', () => {
  assert.equal(BALANCE_REFRESH_COOLDOWN_SECONDS, 3600);

  assert.deepEqual(
    balanceRefreshWindow('2026-07-28T19:30:00.000Z', NOW),
    {
      due: false,
      nextRefreshAt: '2026-07-28T20:30:00.000Z',
    },
  );
});

test('the cooldown boundary permits another real-time balance refresh', () => {
  const lastRefreshedAt = new Date(
    NOW.getTime() - BALANCE_REFRESH_COOLDOWN_MS,
  ).toISOString();

  assert.deepEqual(balanceRefreshWindow(lastRefreshedAt, NOW), {
    due: true,
    nextRefreshAt: NOW.toISOString(),
  });
});

test('a malformed legacy timestamp fails open instead of blocking forever', () => {
  assert.deepEqual(balanceRefreshWindow('not-a-date', NOW), {
    due: true,
    nextRefreshAt: null,
  });
});

test('cached webhooks cannot overwrite a recent real-time balance', () => {
  assert.equal(
    cachedBalanceSyncDue('2026-07-28T19:30:00.000Z', NOW),
    false,
  );
  assert.equal(
    cachedBalanceSyncDue('2026-07-27T19:30:00.000Z', NOW),
    true,
  );
});
