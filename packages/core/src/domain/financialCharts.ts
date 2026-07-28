import type { IsoDate, RangePreset } from './dates';

export type FinancialMetric =
  | 'netWorth'
  | 'cash'
  | 'assets'
  | 'liabilities'
  | 'cashFlow';

export type ChartGranularity = 'daily' | 'monthly';

export type FinancialSeriesPoint = {
  date: IsoDate;
  /**
   * Balance values are null before the household's first real snapshot. This
   * keeps the chart from inventing a $0 starting balance.
   */
  assetsCents: number | null;
  liabilitiesCents: number | null;
  cashCents: number | null;
  netCents: number | null;
  cashFlowCents: number;
};

export type FinancialChartPoint = {
  date: IsoDate;
  valueCents: number;
};

export type FinancialMetricDefinition = {
  label: string;
  shortLabel: string;
  periodLabel: string;
  emptyMessage: string;
};

export const FINANCIAL_METRICS: FinancialMetric[] = [
  'netWorth',
  'cash',
  'assets',
  'liabilities',
  'cashFlow',
];

export const FINANCIAL_METRIC_DEFINITIONS: Record<
  FinancialMetric,
  FinancialMetricDefinition
> = {
  netWorth: {
    label: 'Net worth',
    shortLabel: 'Net worth',
    periodLabel: 'Latest net worth',
    emptyMessage: 'Net worth history appears after the first balance snapshot.',
  },
  cash: {
    label: 'Cash',
    shortLabel: 'Cash',
    periodLabel: 'Latest cash balance',
    emptyMessage: 'Cash history appears after a cash account has a balance snapshot.',
  },
  assets: {
    label: 'Assets',
    shortLabel: 'Assets',
    periodLabel: 'Latest asset balance',
    emptyMessage: 'Asset history appears after the first balance snapshot.',
  },
  liabilities: {
    label: 'Liabilities',
    shortLabel: 'Debt',
    periodLabel: 'Latest liabilities',
    emptyMessage: 'Liability history appears after the first balance snapshot.',
  },
  cashFlow: {
    label: 'Cash flow',
    shortLabel: 'Cash flow',
    periodLabel: 'Net cash flow this period',
    emptyMessage: 'Cash flow appears after posted transactions are imported.',
  },
};

export function chartGranularityForPreset(
  preset: RangePreset,
): ChartGranularity {
  return preset === '1M' ? 'daily' : 'monthly';
}

/**
 * Converts a database point into the value users expect to see. Liabilities
 * are stored as negative net-worth contributions but charted as a positive
 * amount owed.
 */
export function financialMetricValue(
  point: FinancialSeriesPoint,
  metric: FinancialMetric,
): number | null {
  switch (metric) {
    case 'netWorth':
      return point.netCents;
    case 'cash':
      return point.cashCents;
    case 'assets':
      return point.assetsCents;
    case 'liabilities':
      return point.liabilitiesCents === null
        ? null
        : Math.abs(point.liabilitiesCents);
    case 'cashFlow':
      return point.cashFlowCents;
  }
}

/**
 * Produces chart-ready points with metric-aware aggregation.
 *
 * Balances are stocks: monthly charts use the range's first value and then
 * each month end. Cash flow is a flow: monthly charts sum every day in the
 * month. The one-month preset stays daily so recent movement remains visible.
 */
export function buildFinancialChartSeries(
  series: FinancialSeriesPoint[],
  metric: FinancialMetric,
  granularity: ChartGranularity,
): FinancialChartPoint[] {
  const daily = series.flatMap((point) => {
    const valueCents = financialMetricValue(point, metric);

    return valueCents === null
      ? []
      : [{ date: point.date, valueCents }];
  });

  if (granularity === 'daily' || daily.length === 0) return daily;

  const months: FinancialChartPoint[][] = [];

  for (const point of daily) {
    const monthKey = point.date.slice(0, 7);
    const currentMonth = months[months.length - 1];

    if (currentMonth?.[0]?.date.slice(0, 7) === monthKey) {
      currentMonth.push(point);
    } else {
      months.push([point]);
    }
  }

  if (metric === 'cashFlow') {
    return months.flatMap((month) => {
      const latest = month[month.length - 1];
      if (!latest) return [];

      return [
        {
          date: latest.date,
          valueCents: month.reduce(
            (total, point) => total + point.valueCents,
            0,
          ),
        },
      ];
    });
  }

  if (months.length === 1) {
    const latest = months[0]?.[months[0].length - 1];
    return latest ? [latest] : [];
  }

  return months.flatMap((month, index) => {
    const point = index === 0 ? month[0] : month[month.length - 1];
    return point ? [point] : [];
  });
}

/**
 * The default headline is the latest balance, or the net cash flow across the
 * whole selected period.
 */
export function financialMetricHeadline(
  points: FinancialChartPoint[],
  metric: FinancialMetric,
): number | null {
  if (points.length === 0) return null;

  if (metric === 'cashFlow') {
    return points.reduce((total, point) => total + point.valueCents, 0);
  }

  return points[points.length - 1]?.valueCents ?? null;
}

export function financialChartChange(points: FinancialChartPoint[]): {
  changeCents: number;
  changeRatio: number | null;
} {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) return { changeCents: 0, changeRatio: null };

  const changeCents = last.valueCents - first.valueCents;
  const crossesZero =
    (first.valueCents < 0 && last.valueCents > 0) ||
    (first.valueCents > 0 && last.valueCents < 0);

  return {
    changeCents,
    changeRatio:
      first.valueCents === 0 || crossesZero
        ? null
        : changeCents / Math.abs(first.valueCents),
  };
}
