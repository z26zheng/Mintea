import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyNotificationStates,
  buildBudgetNotifications,
  buildDerivedNotifications,
  buildFamilyMembershipNotification,
  countUnreadNotifications,
} from '../packages/core/src/domain/notifications.ts';

const healthy = {
  severity: 'ok',
  label: 'Connected',
  detail: 'Synced today.',
  action: null,
};

const reconnect = {
  severity: 'critical',
  label: 'Needs sign-in',
  detail: 'Your bank needs you to sign in again before it will share new data.',
  action: 'reconnect',
};

const stale = {
  severity: 'warning',
  label: 'Out of date',
  detail: 'No new data for 5 days. Balances and totals may be behind.',
  action: null,
};

const source = (id, institutionName, health) => ({
  id,
  institutionName,
  health,
});

test('groups current connection conditions and duplicate review into one centre', () => {
  const notifications = buildDerivedNotifications(
    [
      source('item-stale-a', 'Chase', stale),
      source('item-stale-b', 'PNC', stale),
      source('item-login', 'Wells Fargo', reconnect),
      source('item-good', 'Ally', healthy),
    ],
    2,
  );

  assert.deepEqual(
    notifications.map(({ key }) => key),
    [
      'condition:connection-reconnect',
      'condition:duplicate-accounts',
      'condition:connection-stale',
    ],
  );
  assert.match(
    notifications.find(({ key }) => key === 'condition:connection-stale').message,
    /five days/,
  );
  assert.match(
    notifications.find(({ key }) => key === 'condition:connection-reconnect').title,
    /Wells Fargo/,
  );
  assert.equal(
    notifications.find(({ key }) => key === 'condition:duplicate-accounts').severity,
    'critical',
  );
});

test('healthy and informational connections do not create attention rows', () => {
  assert.deepEqual(
    buildDerivedNotifications(
      [source('item-good', 'Ally', healthy)],
      0,
    ),
    [],
  );
});

test('read state is per key, while dismissal hides a condition until reminder time', () => {
  const [notification] = buildDerivedNotifications(
    [source('item-login', 'Wells Fargo', reconnect)],
    0,
  );
  const now = new Date('2026-08-09T12:00:00Z');

  const read = applyNotificationStates(
    [notification],
    [
      {
        notification_key: notification.key,
        read_at: '2026-08-09T11:00:00Z',
        dismissed_until: null,
      },
    ],
    now,
  );
  assert.equal(read.length, 1);
  assert.equal(read[0].isUnread, false);

  const dismissed = applyNotificationStates(
    [notification],
    [
      {
        notification_key: notification.key,
        read_at: null,
        dismissed_until: '2026-08-10T12:00:00Z',
      },
    ],
    now,
  );
  assert.deepEqual(dismissed, []);

  const returned = applyNotificationStates(
    [notification],
    [
      {
        notification_key: notification.key,
        read_at: null,
        dismissed_until: '2026-08-09T11:00:00Z',
      },
    ],
    now,
  );
  assert.equal(returned[0].isUnread, true);
  assert.equal(countUnreadNotifications(returned), 1);
});

test('budget conditions keep over-budget and unallocated income distinct', () => {
  const notifications = buildBudgetNotifications(
    [
      {
        categoryId: 'dining',
        categoryName: 'Dining out',
        month: '2026-08-01',
        plannedCents: 30000,
        spentCents: 38750,
      },
    ],
    { month: '2026-08-01', unallocatedCents: 142500 },
  );

  assert.deepEqual(
    notifications.map(({ key }) => key),
    [
      'condition:budget-over:2026-08-01:dining',
      'condition:budget-unallocated-income:2026-08-01',
    ],
  );
  assert.match(notifications[0].message, /\$87\.50/);
  assert.match(notifications[1].message, /\$1425\.00/);
});

test('family events are durable-looking records with stable, distinct keys', () => {
  const joined = buildFamilyMembershipNotification('joined', 'event-1');
  const left = buildFamilyMembershipNotification('left', 'event-2');

  assert.equal(joined.class, 'event');
  assert.equal(joined.kind, 'family-membership');
  assert.match(joined.title, /joined/);
  assert.match(left.title, /left/);
  assert.notEqual(joined.key, left.key);
});
