/**
 * Client-side wrappers around the property Edge Functions.
 *
 * The app never calls RentCast directly — the API key lives in the function,
 * for the same reason the Plaid secret does. Routing through the function also
 * gives one place to enforce the free tier's monthly call budget.
 */
import { invokeFunction, type MinteaClient } from '../db/client';

export type PropertyValueResult = {
  refreshed: number;
  skipped: number;
  failed: number;
  errors: Array<{ accountId: string; message: string }>;
};

export type AddressMatch = {
  /** Full standardised address, e.g. "17614 88th Pl NE, Bothell, WA 98011". */
  formatted: string;
  /** Street line only. */
  line: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ValuePreview = {
  priceCents: number;
  lowCents: number | null;
  highCents: number | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Matches free-text input against the US Census address database.
 *
 * Free and unmetered, and deliberately a different service from the valuation:
 * searching costs nothing, so only a confirmed match spends a RentCast call.
 */
export const searchAddresses = (client: MinteaClient, query: string) =>
  invokeFunction<{ matches: AddressMatch[] }>(client, 'address-search', {
    query,
  }).then((result) => result.matches);

/**
 * Values an address without saving anything, so the add flow can show a real
 * number before the user commits. Costs one RentCast call.
 */
export const previewPropertyValue = (
  client: MinteaClient,
  input: {
    address: string;
    propertyType?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    squareFootage?: number | null;
  },
) =>
  invokeFunction<{ preview: ValuePreview }>(client, 'property-value', {
    ...input,
  }).then((result) => result.preview);

/**
 * Re-values a saved property from the AVM.
 *
 * With an `accountId` this is an explicit user action: it always calls the
 * provider, and switches a manually-valued property over to automatic updates.
 * Without one it sweeps the household, skipping manual properties and anything
 * valued recently.
 */
export const refreshPropertyValue = (
  client: MinteaClient,
  accountId?: string,
) =>
  invokeFunction<PropertyValueResult>(
    client,
    'property-value',
    accountId ? { accountId } : {},
  );
