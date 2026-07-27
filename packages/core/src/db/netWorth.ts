import type { MinteaClient } from './client';
import { unwrap } from './client';
import type { NetWorthPointRow } from '../types/database';
import type { DateRange, IsoDate } from '../domain/dates';

export type NetWorthPoint = {
  date: IsoDate;
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
};

/**
 * Daily assets/liabilities/net across the range. The heavy lifting — carrying
 * each account's last known balance forward across days it wasn't observed —
 * happens in the `net_worth_series` SQL function.
 */
export async function fetchNetWorthSeries(
  client: MinteaClient,
  range: DateRange,
): Promise<NetWorthPoint[]> {
  const rows: NetWorthPointRow[] = unwrap(
    await client.rpc('net_worth_series', {
      p_start: range.start,
      p_end: range.end,
    }),
  );

  return rows.map((row) => ({
    date: row.day,
    assetsCents: row.assets_cents,
    liabilitiesCents: row.liabilities_cents,
    netCents: row.net_cents,
  }));
}

/**
 * Oldest balance snapshot on record, used to floor the "All" range so the
 * series doesn't generate empty rows back to the default five-year limit.
 */
export async function fetchEarliestBalanceDate(
  client: MinteaClient,
): Promise<IsoDate | null> {
  const { data, error } = await client
    .from('account_balances')
    .select('date')
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data?.date ?? null;
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
