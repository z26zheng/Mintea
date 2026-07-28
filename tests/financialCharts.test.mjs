import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFinancialChartSeries,
  chartGranularityForPreset,
  financialChartChange,
  financialMetricHeadline,
  financialMetricValue,
} from '../packages/core/src/domain/financialCharts.ts';

const point = (
  date,
  {
    assets = 100_000,
    liabilities = -25_000,
    cash = 40_000,
    net = 75_000,
    cashFlow = 0,
  } = {},
) => ({
  date,
  assetsCents: assets,
  liabilitiesCents: liabilities,
  cashCents: cash,
  netCents: net,
  cashFlowCents: cashFlow,
});

test('one-month charts stay daily while longer ranges are monthly', () => {
  assert.equal(chartGranularityForPreset('1M'), 'daily');
  assert.equal(chartGranularityForPreset('3M'), 'monthly');
  assert.equal(chartGranularityForPreset('ALL'), 'monthly');
});

test('balance charts preserve the range start and later month-end values', () => {
  const series = [
    point('2026-04-27', { net: 75_000 }),
    point('2026-04-30', { net: 77_000 }),
    point('2026-05-01', { net: 78_000 }),
    point('2026-05-31', { net: 82_000 }),
    point('2026-06-30', { net: 86_000 }),
  ];

  assert.deepEqual(
    buildFinancialChartSeries(series, 'netWorth', 'monthly'),
    [
      { date: '2026-04-27', valueCents: 75_000 },
      { date: '2026-05-31', valueCents: 82_000 },
      { date: '2026-06-30', valueCents: 86_000 },
    ],
  );
});

test('cash flow charts sum daily activity into monthly net flow', () => {
  const series = [
    point('2026-04-27', { cashFlow: 100_000 }),
    point('2026-04-28', { cashFlow: -25_000 }),
    point('2026-05-01', { cashFlow: 200_000 }),
    point('2026-05-15', { cashFlow: -80_000 }),
  ];

  const chart = buildFinancialChartSeries(series, 'cashFlow', 'monthly');

  assert.deepEqual(chart, [
    { date: '2026-04-28', valueCents: 75_000 },
    { date: '2026-05-15', valueCents: 120_000 },
  ]);
  assert.equal(financialMetricHeadline(chart, 'cashFlow'), 195_000);
});

test('liabilities are charted as a positive amount owed', () => {
  const record = point('2026-07-27', { liabilities: -42_500 });

  assert.equal(financialMetricValue(record, 'liabilities'), 42_500);
  assert.deepEqual(
    buildFinancialChartSeries([record], 'liabilities', 'daily'),
    [{ date: '2026-07-27', valueCents: 42_500 }],
  );
});

test('balance charts omit pre-snapshot nulls instead of inventing zero', () => {
  const series = [
    point('2026-07-25', {
      assets: null,
      liabilities: null,
      cash: null,
      net: null,
      cashFlow: -2_500,
    }),
    point('2026-07-26', { net: 75_000, cashFlow: 0 }),
  ];

  assert.deepEqual(
    buildFinancialChartSeries(series, 'netWorth', 'daily'),
    [{ date: '2026-07-26', valueCents: 75_000 }],
  );
  assert.deepEqual(
    buildFinancialChartSeries(series, 'cashFlow', 'daily'),
    [
      { date: '2026-07-25', valueCents: -2_500 },
      { date: '2026-07-26', valueCents: 0 },
    ],
  );
});

test('financialChartChange compares the first and latest plotted values', () => {
  assert.deepEqual(
    financialChartChange([
      { date: '2026-05-01', valueCents: 50_000 },
      { date: '2026-07-01', valueCents: 62_500 },
    ]),
    { changeCents: 12_500, changeRatio: 0.25 },
  );

  assert.deepEqual(
    financialChartChange([
      { date: '2026-05-01', valueCents: -5_000 },
      { date: '2026-07-01', valueCents: 10_000 },
    ]),
    { changeCents: 15_000, changeRatio: null },
  );
});
