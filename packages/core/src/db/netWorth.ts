import type { MinteaClient } from './client';
import { unwrap } from './client';
import type { NetWorthPointRow } from '../types/database';
import type { DateRange, IsoDate } from '../domain/dates';
import type { NetWorthPoint } from '../domain/netWorth';

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
