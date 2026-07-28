/**
 * Client-side wrapper around the property valuation Edge Function.
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

/**
 * Re-values a property from the AVM.
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
