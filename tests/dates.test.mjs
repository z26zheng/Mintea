import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidTimeZone,
  resolveRange,
  toIsoDateInTimeZone,
} from '../packages/core/src/domain/dates.ts';
import { calendarDateInTimeZone } from '../supabase/functions/_shared/dates.ts';

const UTC_AFTER_MIDNIGHT = new Date('2026-07-28T06:30:00.000Z');

test('the same instant uses the household calendar on client and Edge', () => {
  assert.equal(
    toIsoDateInTimeZone(UTC_AFTER_MIDNIGHT, 'America/Los_Angeles'),
    '2026-07-27',
  );
  assert.equal(
    calendarDateInTimeZone(UTC_AFTER_MIDNIGHT, 'America/Los_Angeles'),
    '2026-07-27',
  );

  assert.equal(toIsoDateInTimeZone(UTC_AFTER_MIDNIGHT, 'UTC'), '2026-07-28');
  assert.equal(calendarDateInTimeZone(UTC_AFTER_MIDNIGHT, 'UTC'), '2026-07-28');
});

test('reporting-zone formatting handles both sides of the date line', () => {
  const instant = new Date('2026-01-01T00:30:00.000Z');

  assert.equal(toIsoDateInTimeZone(instant, 'America/New_York'), '2025-12-31');
  assert.equal(toIsoDateInTimeZone(instant, 'Pacific/Kiritimati'), '2026-01-01');
});

test('invalid IANA time zones are rejected instead of silently using UTC', () => {
  assert.equal(isValidTimeZone('America/Los_Angeles'), true);
  assert.equal(isValidTimeZone('Not/A_Real_Zone'), false);
  assert.throws(
    () => toIsoDateInTimeZone(UTC_AFTER_MIDNIGHT, 'Not/A_Real_Zone'),
    /Invalid IANA time zone/,
  );
  assert.throws(
    () => calendarDateInTimeZone(UTC_AFTER_MIDNIGHT, 'Not/A_Real_Zone'),
    /Invalid IANA time zone/,
  );
});

test('chart ranges end on the zone-resolved reporting date', () => {
  assert.deepEqual(
    resolveRange('1M', { todayIso: '2026-07-27' }),
    { start: '2026-06-27', end: '2026-07-27' },
  );
  assert.deepEqual(
    resolveRange('YTD', { todayIso: '2026-01-01' }),
    { start: '2026-01-01', end: '2026-01-01' },
  );
});

test('invalid reporting dates cannot produce malformed chart ranges', () => {
  assert.throws(
    () => resolveRange('1M', { todayIso: '2026-02-31' }),
    /Invalid ISO date/,
  );
});
