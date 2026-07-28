import type { MinteaClient } from './client';
import { unwrap } from './client';
import type { FinancialChartPointRow } from '../types/database';
import type { DateRange, IsoDate } from '../domain/dates';
import type { FinancialSeriesPoint } from '../domain/financialCharts';

export async function fetchFinancialChartSeries(
  client: MinteaClient,
  range: DateRange,
): Promise<FinancialSeriesPoint[]> {
  const rows: FinancialChartPointRow[] = unwrap(
    await client.rpc('financial_chart_series', {
      p_start: range.start,
      p_end: range.end,
    }),
  );

  return rows.map((row) => ({
    date: row.day,
    assetsCents: row.assets_cents,
    liabilitiesCents: row.liabilities_cents,
    cashCents: row.cash_cents,
    netCents: row.net_cents,
    cashFlowCents: row.cash_flow_cents,
  }));
}

/**
 * Floors the "All" range at the first balance or posted transaction. Balance
 * metrics remain null before the first real snapshot, while cash flow can use
 * older imported transactions.
 */
export async function fetchEarliestFinancialActivityDate(
  client: MinteaClient,
): Promise<IsoDate | null> {
  const [balance, transaction] = await Promise.all([
    client
      .from('account_balances')
      .select('date')
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    client
      .from('transactions')
      .select('date')
      .is('deleted_at', null)
      .eq('is_hidden', false)
      .eq('is_pending', false)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (balance.error) throw new Error(balance.error.message);
  if (transaction.error) throw new Error(transaction.error.message);

  const dates = [balance.data?.date, transaction.data?.date].filter(
    (date): date is string => Boolean(date),
  );

  return dates.sort()[0] ?? null;
}
