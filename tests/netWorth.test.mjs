import assert from 'node:assert/strict';
import test from 'node:test';

import {
  monthlyNetWorthSeries,
  netWorthChange,
} from '../packages/core/src/domain/netWorth.ts';

const point = (date, netCents) => ({
  date,
  assetsCents: Math.max(netCents, 0),
  liabilitiesCents: Math.min(netCents, 0),
  netCents,
});

test('monthlyNetWorthSeries returns the latest point for one month', () => {
  const series = [
    point('2026-07-01', 10_000),
    point('2026-07-15', 11_000),
    point('2026-07-27', 12_000),
  ];

  assert.deepEqual(monthlyNetWorthSeries(series), [
    point('2026-07-27', 12_000),
  ]);
});

test('monthlyNetWorthSeries preserves the range start and month-end values', () => {
  const series = [
    point('2026-04-27', 10_000),
    point('2026-04-30', 11_000),
    point('2026-05-01', 12_000),
    point('2026-05-31', 13_000),
    point('2026-06-01', 14_000),
    point('2026-06-30', 15_000),
    point('2026-07-27', 16_000),
  ];

  const monthly = monthlyNetWorthSeries(series);

  assert.deepEqual(monthly, [
    point('2026-04-27', 10_000),
    point('2026-05-31', 13_000),
    point('2026-06-30', 15_000),
    point('2026-07-27', 16_000),
  ]);
  assert.deepEqual(netWorthChange(monthly), {
    changeCents: 6_000,
    changeRatio: 0.6,
  });
});

test('monthlyNetWorthSeries handles empty input without mutation', () => {
  const series = [
    point('2026-06-27', -50_000),
    point('2026-07-27', -40_000),
  ];
  const original = structuredClone(series);

  assert.deepEqual(monthlyNetWorthSeries([]), []);
  assert.deepEqual(monthlyNetWorthSeries(series), series);
  assert.deepEqual(series, original);
});
