import type { IsoDate } from './dates';

export type NetWorthPoint = {
  date: IsoDate;
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
};

/**
 * Reduces a daily net-worth series to one representative point per calendar
 * month for charting.
 *
 * The first partial month keeps the range's first point so the plotted start
 * agrees with the period-change calculation. Every later month uses its latest
 * point, including the current partial month. A single-month series uses its
 * latest point because there is no earlier month to compare against.
 */
export function monthlyNetWorthSeries(
  series: NetWorthPoint[],
): NetWorthPoint[] {
  if (series.length === 0) return [];

  const months: NetWorthPoint[][] = [];

  for (const point of series) {
    const monthKey = point.date.slice(0, 7);
    const currentMonth = months[months.length - 1];

    if (
      currentMonth &&
      currentMonth[0]?.date.slice(0, 7) === monthKey
    ) {
      currentMonth.push(point);
    } else {
      months.push([point]);
    }
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

/** Absolute and percentage change between the first and last point of a series. */
export function netWorthChange(series: NetWorthPoint[]): {
  changeCents: number;
  changeRatio: number | null;
} {
  const first = series[0];
  const last = series[series.length - 1];

  if (!first || !last) return { changeCents: 0, changeRatio: null };

  const changeCents = last.netCents - first.netCents;

  return {
    changeCents,
    // A percentage is meaningless when the starting point is zero (or when net
    // worth crosses zero), so the UI falls back to the absolute figure.
    changeRatio:
      first.netCents === 0 ? null : changeCents / Math.abs(first.netCents),
  };
}
