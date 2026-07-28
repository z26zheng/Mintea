import assert from 'node:assert/strict';
import test from 'node:test';

import {
  equityGain,
  interpolateValuationHistory,
  isValuationStale,
  propertyAddress,
} from '../packages/core/src/domain/property.ts';

const TODAY = new Date('2026-07-27T12:00:00Z');

test('anchors the curve to the purchase and the current value', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 40_000_000,
    purchaseDate: '2019-03-15',
    currentValueCents: 61_500_000,
    today: TODAY,
  });

  assert.equal(points.at(0).date, '2019-03-15');
  assert.equal(points.at(0).balanceCents, 40_000_000);
  assert.equal(points.at(-1).date, '2026-07-27');
  assert.equal(points.at(-1).balanceCents, 61_500_000);
});

test('rises monotonically when the property appreciated', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 40_000_000,
    purchaseDate: '2019-03-15',
    currentValueCents: 61_500_000,
    today: TODAY,
  });

  for (let i = 1; i < points.length; i += 1) {
    assert.ok(
      points[i].balanceCents >= points[i - 1].balanceCents,
      `expected ${points[i].date} >= ${points[i - 1].date}`,
    );
  }
});

test('falls monotonically when the property lost value', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 50_000_000,
    purchaseDate: '2024-01-10',
    currentValueCents: 44_000_000,
    today: TODAY,
  });

  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].balanceCents <= points[i - 1].balanceCents);
  }
});

test('emits one point per month plus both endpoints', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 10_000_000,
    purchaseDate: '2026-01-15',
    currentValueCents: 11_000_000,
    today: TODAY,
  });

  // Purchase, the 1st of Feb–Jul, then today.
  assert.deepEqual(
    points.map((p) => p.date),
    [
      '2026-01-15',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-07-27',
    ],
  );
});

test('produces no duplicate dates when bought on the first of a month', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 10_000_000,
    purchaseDate: '2026-02-01',
    currentValueCents: 12_000_000,
    today: TODAY,
  });

  const dates = points.map((p) => p.date);
  assert.equal(new Set(dates).size, dates.length);
  // `account_balances` is unique on (account, date); a collision would make the
  // whole upsert fail.
  assert.equal(dates.at(0), '2026-02-01');
});

test('returns nothing for a purchase date in the future', () => {
  assert.deepEqual(
    interpolateValuationHistory({
      purchasePriceCents: 10_000_000,
      purchaseDate: '2027-01-01',
      currentValueCents: 10_000_000,
      today: TODAY,
    }),
    [],
  );
});

test('returns a single point when bought today', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 10_000_000,
    purchaseDate: '2026-07-27',
    currentValueCents: 10_000_000,
    today: TODAY,
  });

  assert.equal(points.length, 1);
  assert.equal(points[0].date, '2026-07-27');
});

test('falls back to a straight line when the purchase price is zero', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 0,
    purchaseDate: '2026-05-27',
    currentValueCents: 6_000_000,
    today: TODAY,
  });

  // Compounding from zero is undefined; the line must still be finite and rise.
  for (const point of points) {
    assert.ok(Number.isFinite(point.balanceCents));
    assert.ok(Number.isInteger(point.balanceCents));
  }
  assert.equal(points.at(0).balanceCents, 0);
  assert.equal(points.at(-1).balanceCents, 6_000_000);
});

test('every balance is an exact integer number of cents', () => {
  const points = interpolateValuationHistory({
    purchasePriceCents: 33_333_333,
    purchaseDate: '2020-06-07',
    currentValueCents: 71_777_777,
    today: TODAY,
  });

  for (const point of points) {
    assert.ok(Number.isInteger(point.balanceCents), `${point.date} not integer`);
  }
});

test('equityGain compares against the purchase price', () => {
  const details = { purchase_price_cents: 40_000_000 };

  assert.deepEqual(equityGain(details, 50_000_000), {
    changeCents: 10_000_000,
    changeRatio: 0.25,
  });

  assert.equal(equityGain({ purchase_price_cents: null }, 50_000_000), null);
});

test('only automatic valuations go stale', () => {
  const now = new Date('2026-07-27T00:00:00Z');
  const old = '2026-01-01T00:00:00Z';

  assert.equal(
    isValuationStale(
      { valuation_source: 'rentcast', last_valued_at: old },
      { now },
    ),
    true,
  );

  // A number the user typed in is theirs to keep.
  assert.equal(
    isValuationStale({ valuation_source: 'manual', last_valued_at: old }, { now }),
    false,
  );

  assert.equal(
    isValuationStale(
      { valuation_source: 'rentcast', last_valued_at: '2026-07-20T00:00:00Z' },
      { now },
    ),
    false,
  );
});

test('propertyAddress prefers the provider-normalised form', () => {
  assert.equal(
    propertyAddress({
      formatted_address: '123 Elm St, Austin, TX 78701',
      address_line: '123 elm street',
      city: 'austin',
      state: 'tx',
      postal_code: '78701',
    }),
    '123 Elm St, Austin, TX 78701',
  );

  assert.equal(
    propertyAddress({
      formatted_address: null,
      address_line: '123 Elm St',
      city: 'Austin',
      state: 'TX',
      postal_code: null,
    }),
    '123 Elm St, Austin, TX',
  );
});
