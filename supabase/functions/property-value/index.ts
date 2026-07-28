/**
 * Refreshes real estate valuations from RentCast.
 *
 *   POST { accountId }  → revalue one property (explicit user action)
 *   POST { }            → revalue every automatic property in the household
 *
 * A successful valuation updates the account balance and writes today's
 * snapshot, so the property flows through net worth exactly like a bank
 * account. A failure is recorded on the property rather than thrown away, so
 * the UI can show why a number is stale instead of quietly serving old data.
 */
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { fetchValueEstimate, hasRentCastKey } from '../_shared/rentcast.ts';
import { requireCaller, type Caller } from '../_shared/supabase.ts';

type Body = { accountId?: string };

type PropertyRow = {
  account_id: string;
  household_id: string;
  address_line: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_footage: number | null;
  valuation_source: string;
  last_valued_at: string | null;
};

/**
 * A bulk refresh skips anything valued recently. Home values do not move on a
 * daily timescale, and the free tier is 50 calls a month — an over-eager cron
 * shouldn't be able to exhaust it.
 */
const BULK_MIN_AGE_DAYS = 25;

export type PropertyValueResult = {
  refreshed: number;
  skipped: number;
  failed: number;
  errors: Array<{ accountId: string; message: string }>;
};

/** Composes the single-line address string RentCast expects. */
function addressFor(property: PropertyRow): string {
  return [
    property.address_line,
    property.city,
    property.state,
    property.postal_code,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

async function revalue(
  caller: Caller,
  property: PropertyRow,
): Promise<'refreshed' | 'failed'> {
  try {
    const estimate = await fetchValueEstimate({
      address: addressFor(property),
      propertyType: property.property_type,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      squareFootage: property.square_footage,
    });

    const valuedAt = new Date();
    const today = valuedAt.toISOString().slice(0, 10);

    await caller.admin
      .from('property_details')
      .update({
        last_valuation_cents: estimate.priceCents,
        last_valuation_low_cents: estimate.lowCents,
        last_valuation_high_cents: estimate.highCents,
        last_valued_at: valuedAt.toISOString(),
        valuation_source: 'rentcast',
        valuation_error: null,
        ...(estimate.formattedAddress
          ? { formatted_address: estimate.formattedAddress }
          : {}),
        ...(estimate.latitude != null ? { latitude: estimate.latitude } : {}),
        ...(estimate.longitude != null ? { longitude: estimate.longitude } : {}),
      })
      .eq('account_id', property.account_id);

    // A property is always an asset, so the stored balance is the positive
    // valuation. The mortgage is a separate account carrying the debt.
    await caller.admin
      .from('accounts')
      .update({ current_balance_cents: estimate.priceCents })
      .eq('id', property.account_id);

    await caller.admin.from('account_balances').upsert(
      {
        household_id: property.household_id,
        account_id: property.account_id,
        date: today,
        balance_cents: estimate.priceCents,
      },
      { onConflict: 'account_id,date' },
    );

    return 'refreshed';
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Valuation failed';

    // Recorded, not thrown: one bad address shouldn't abort a bulk refresh,
    // and the balance is deliberately left at its last good value.
    await caller.admin
      .from('property_details')
      .update({ valuation_error: message })
      .eq('account_id', property.account_id);

    return 'failed';
  }
}

Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const { accountId } = await readJson<Body>(req);

    if (!hasRentCastKey()) {
      throw new HttpError(
        501,
        'Automatic valuations are not configured. Add a RentCast API key with: ' +
          'supabase secrets set RENTCAST_API_KEY=…',
      );
    }

    let query = caller.admin
      .from('property_details')
      .select(
        'account_id, household_id, address_line, city, state, postal_code, ' +
          'property_type, bedrooms, bathrooms, square_footage, ' +
          'valuation_source, last_valued_at',
      )
      .eq('household_id', caller.householdId);

    if (accountId) query = query.eq('account_id', accountId);

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);

    const properties = (data ?? []) as PropertyRow[];

    if (accountId && properties.length === 0) {
      throw new HttpError(404, 'Property not found');
    }

    const result: PropertyValueResult = {
      refreshed: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    for (const property of properties) {
      // An explicit single refresh always runs — the user asked for it, and it
      // is also how a manually-valued property opts in to automatic updates.
      if (!accountId) {
        if (property.valuation_source !== 'rentcast') {
          result.skipped += 1;
          continue;
        }

        if (property.last_valued_at) {
          const ageDays =
            (Date.now() - Date.parse(property.last_valued_at)) / 86_400_000;

          if (ageDays < BULK_MIN_AGE_DAYS) {
            result.skipped += 1;
            continue;
          }
        }
      }

      const outcome = await revalue(caller, property);

      if (outcome === 'refreshed') {
        result.refreshed += 1;
      } else {
        result.failed += 1;

        const { data: row } = await caller.admin
          .from('property_details')
          .select('valuation_error')
          .eq('account_id', property.account_id)
          .single();

        result.errors.push({
          accountId: property.account_id,
          message: (row?.valuation_error as string) ?? 'Valuation failed',
        });
      }
    }

    // A single explicit refresh that failed should surface as an error, not a
    // 200 the UI has to inspect.
    if (accountId && result.failed === 1) {
      throw new HttpError(502, result.errors[0]?.message ?? 'Valuation failed');
    }

    return json(result);
  }),
);
