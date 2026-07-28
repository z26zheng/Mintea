/**
 * Minimal RentCast client.
 *
 * RentCast is the only per-address AVM with instant self-serve access —
 * Zillow's Zestimate API was retired in 2021 and its replacement is MLS-only.
 * The free tier is 50 calls/month, which at one call per property per month is
 * effectively unlimited for this app, so the code is written to be frugal
 * rather than fast.
 *
 * `RENTCAST_API_KEY` is read from the function environment and never leaves it.
 */
import { HttpError } from './http.ts';

const BASE_URL = 'https://api.rentcast.io/v1';

export const hasRentCastKey = (): boolean =>
  Boolean(Deno.env.get('RENTCAST_API_KEY'));

export type ValueEstimate = {
  /** Point estimate, in cents. */
  priceCents: number;
  lowCents: number | null;
  highCents: number | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ValueEstimateRequest = {
  address: string;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
};

/** RentCast returns dollars as floats; this is where they become exact cents. */
const toCents = (dollars: number): number => Math.round(dollars * 100);

export async function fetchValueEstimate(
  request: ValueEstimateRequest,
): Promise<ValueEstimate> {
  const apiKey = Deno.env.get('RENTCAST_API_KEY');

  if (!apiKey) {
    throw new HttpError(
      501,
      'Automatic valuations are not configured. Set RENTCAST_API_KEY with: ' +
        'supabase secrets set RENTCAST_API_KEY=…',
    );
  }

  const params = new URLSearchParams({ address: request.address });

  // Only send attributes the user actually supplied. RentCast looks up the
  // rest itself, and guessing would make the estimate worse, not better.
  if (request.propertyType) params.set('propertyType', request.propertyType);
  if (request.bedrooms != null) params.set('bedrooms', String(request.bedrooms));
  if (request.bathrooms != null) {
    params.set('bathrooms', String(request.bathrooms));
  }
  if (request.squareFootage != null) {
    params.set('squareFootage', String(request.squareFootage));
  }

  const response = await fetch(`${BASE_URL}/avm/value?${params}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new HttpError(
      response.status === 401
        ? 502
        : response.status === 404
          ? 404
          : response.status === 429
            ? 429
            : 502,
      await describeFailure(response),
    );
  }

  const body = (await response.json()) as {
    price?: number;
    priceRangeLow?: number;
    priceRangeHigh?: number;
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
  };

  if (typeof body.price !== 'number' || !Number.isFinite(body.price)) {
    throw new HttpError(
      404,
      'No valuation available for that address. Check the address, or set the value manually.',
    );
  }

  return {
    priceCents: toCents(body.price),
    lowCents:
      typeof body.priceRangeLow === 'number' ? toCents(body.priceRangeLow) : null,
    highCents:
      typeof body.priceRangeHigh === 'number'
        ? toCents(body.priceRangeHigh)
        : null,
    formattedAddress: body.formattedAddress ?? null,
    latitude: typeof body.latitude === 'number' ? body.latitude : null,
    longitude: typeof body.longitude === 'number' ? body.longitude : null,
  };
}

/** Turns RentCast's status codes into something worth showing a user. */
async function describeFailure(response: Response): Promise<string> {
  switch (response.status) {
    case 401:
      return 'The RentCast API key was rejected. Check RENTCAST_API_KEY.';
    case 404:
      return 'No property found at that address. Check it, or set the value manually.';
    case 429:
      return 'Monthly RentCast quota reached. Valuations resume next cycle, or upgrade the plan.';
    default: {
      const detail = await response.text().catch(() => '');
      return `RentCast request failed (${response.status})${
        detail ? `: ${detail.slice(0, 200)}` : ''
      }`;
    }
  }
}
