import type { MinteaClient } from './client';
import { unwrap } from './client';
import type { MatchCandidate, ParsedRow } from '../domain/csvImport';

/**
 * Existing transactions in the window a file covers, for duplicate matching.
 *
 * Only date and amount are fetched: those are what the match is on, and
 * pulling whole rows for a multi-year import would be wasteful.
 */
export async function fetchImportMatchCandidates(
  client: MinteaClient,
  accountId: string,
  range: { start: string; end: string },
): Promise<MatchCandidate[]> {
  const rows: MatchCandidate[] = [];
  const PAGE = 1000;

  for (let offset = 0; ; offset += PAGE) {
    const chunk = unwrap(
      await client
        .from('transactions')
        .select('date,amount_cents')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .gte('date', range.start)
        .lte('date', range.end)
        .range(offset, offset + PAGE - 1),
    );

    rows.push(
      ...chunk.map((row) => ({ date: row.date, amountCents: row.amount_cents })),
    );

    if (chunk.length < PAGE) return rows;
  }
}

/**
 * Writes imported rows.
 *
 * Marked `needs_review` so an import lands in the same triage queue as a fresh
 * Plaid sync rather than quietly joining the reviewed history, and left
 * uncategorised so existing rules and the user decide rather than the file.
 */
export async function importTransactions(
  client: MinteaClient,
  input: {
    householdId: string;
    accountId: string;
    currency: string;
    rows: ParsedRow[];
  },
): Promise<number> {
  if (input.rows.length === 0) return 0;

  const payload = input.rows.map((row) => ({
    household_id: input.householdId,
    account_id: input.accountId,
    date: row.date,
    description: row.description,
    original_description: row.description,
    amount_cents: row.amountCents,
    currency: input.currency,
    needs_review: true,
  }));

  for (let i = 0; i < payload.length; i += 500) {
    unwrap(
      await client
        .from('transactions')
        .insert(payload.slice(i, i + 500))
        .select('id'),
    );
  }

  return payload.length;
}
