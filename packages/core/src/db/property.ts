import type { MinteaClient } from './client';
import { unwrap } from './client';
import type {
  AccountRow,
  PropertyDetailsRow,
  ValuationSource,
} from '../types/database';
import type { Cents } from '../domain/money';
import { todayIso, type IsoDate } from '../domain/dates';
import {
  interpolateValuationHistory,
  type PropertyType,
} from '../domain/property';

export async function fetchProperties(
  client: MinteaClient,
): Promise<PropertyDetailsRow[]> {
  return unwrap(await client.from('property_details').select('*'));
}

export async function fetchProperty(
  client: MinteaClient,
  accountId: string,
): Promise<PropertyDetailsRow | null> {
  const { data, error } = await client
    .from('property_details')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export type CreatePropertyInput = {
  householdId: string;
  /** Display name, e.g. "Home on Elm Street". */
  name: string;
  addressLine: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  propertyType?: PropertyType | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
  /** What it's worth now — from the AVM preview, or the user's own figure. */
  estimatedValueCents: Cents;
  purchasePriceCents?: Cents | null;
  purchaseDate?: IsoDate | null;
  currency?: string;
  latitude?: number | null;
  longitude?: number | null;
  /**
   * `rentcast` records that the value came from the AVM, so the monthly sweep
   * will keep it current. `manual` (the default) means the user chose the
   * number and automatic refreshes must leave it alone.
   */
  valuationSource?: ValuationSource;
  valuationLowCents?: Cents | null;
  valuationHighCents?: Cents | null;
  formattedAddress?: string | null;
};

/**
 * Creates the account and its property record together, then backfills the
 * value history so the property appears on the net worth chart from the day it
 * was bought rather than the day it was added.
 */
export async function createProperty(
  client: MinteaClient,
  input: CreatePropertyInput,
): Promise<{ account: AccountRow; property: PropertyDetailsRow }> {
  const value = Math.abs(input.estimatedValueCents);

  const account = unwrap(
    await client
      .from('accounts')
      .insert({
        household_id: input.householdId,
        name: input.name,
        type: 'real_estate',
        subtype: input.propertyType ?? null,
        currency: input.currency ?? 'USD',
        current_balance_cents: value,
        // A property is the asset; its mortgage is a separate loan account.
        is_asset: true,
        is_manual: true,
      })
      .select()
      .single(),
  );

  const property = unwrap(
    await client
      .from('property_details')
      .insert({
        account_id: account.id,
        household_id: input.householdId,
        address_line: input.addressLine,
        city: input.city ?? null,
        state: input.state ?? null,
        postal_code: input.postalCode ?? null,
        property_type: input.propertyType ?? null,
        bedrooms: input.bedrooms ?? null,
        bathrooms: input.bathrooms ?? null,
        square_footage: input.squareFootage ?? null,
        purchase_price_cents: input.purchasePriceCents ?? null,
        purchase_date: input.purchaseDate ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        formatted_address: input.formattedAddress ?? null,
        valuation_source: input.valuationSource ?? 'manual',
        last_valuation_cents: value,
        last_valuation_low_cents: input.valuationLowCents ?? null,
        last_valuation_high_cents: input.valuationHighCents ?? null,
        last_valued_at: new Date().toISOString(),
      })
      .select()
      .single(),
  );

  await writeValuationHistory(client, {
    householdId: input.householdId,
    accountId: account.id,
    currentValueCents: value,
    purchasePriceCents: input.purchasePriceCents ?? null,
    purchaseDate: input.purchaseDate ?? null,
  });

  return { account, property };
}

/**
 * Writes the backfilled curve into `account_balances`. Falls back to a single
 * point for today when there's no purchase information to interpolate from.
 */
export async function writeValuationHistory(
  client: MinteaClient,
  input: {
    householdId: string;
    accountId: string;
    currentValueCents: Cents;
    purchasePriceCents: Cents | null;
    purchaseDate: IsoDate | null;
  },
): Promise<number> {
  const points =
    input.purchasePriceCents && input.purchaseDate
      ? interpolateValuationHistory({
          purchasePriceCents: input.purchasePriceCents,
          purchaseDate: input.purchaseDate,
          currentValueCents: input.currentValueCents,
        })
      : [{ date: todayIso(), balanceCents: input.currentValueCents }];

  if (points.length === 0) return 0;

  const { error } = await client.from('account_balances').upsert(
    points.map((point) => ({
      household_id: input.householdId,
      account_id: input.accountId,
      date: point.date,
      balance_cents: point.balanceCents,
    })),
    { onConflict: 'account_id,date' },
  );

  if (error) throw new Error(error.message);

  return points.length;
}

export async function updateProperty(
  client: MinteaClient,
  accountId: string,
  patch: Partial<
    Pick<
      PropertyDetailsRow,
      | 'address_line'
      | 'city'
      | 'state'
      | 'postal_code'
      | 'property_type'
      | 'bedrooms'
      | 'bathrooms'
      | 'square_footage'
      | 'purchase_price_cents'
      | 'purchase_date'
    >
  >,
): Promise<PropertyDetailsRow> {
  return unwrap(
    await client
      .from('property_details')
      .update(patch)
      .eq('account_id', accountId)
      .select()
      .single(),
  );
}

/**
 * Overrides the value by hand. Flips the source back to `manual`, which stops
 * the scheduled refresh from overwriting a number the user chose deliberately.
 */
export async function setPropertyValue(
  client: MinteaClient,
  input: {
    householdId: string;
    accountId: string;
    valueCents: Cents;
  },
): Promise<void> {
  const value = Math.abs(input.valueCents);

  const { error: propertyError } = await client
    .from('property_details')
    .update({
      valuation_source: 'manual',
      last_valuation_cents: value,
      last_valuation_low_cents: null,
      last_valuation_high_cents: null,
      last_valued_at: new Date().toISOString(),
      valuation_error: null,
    })
    .eq('account_id', input.accountId);

  if (propertyError) throw new Error(propertyError.message);

  const { error: accountError } = await client
    .from('accounts')
    .update({ current_balance_cents: value })
    .eq('id', input.accountId);

  if (accountError) throw new Error(accountError.message);

  const { error: balanceError } = await client.from('account_balances').upsert(
    {
      household_id: input.householdId,
      account_id: input.accountId,
      date: todayIso(),
      balance_cents: value,
    },
    { onConflict: 'account_id,date' },
  );

  if (balanceError) throw new Error(balanceError.message);
}
