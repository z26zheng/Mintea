/**
 * Address autocomplete for the add-property flow.
 *
 * Exists as a function purely because the Census geocoder sends no CORS
 * headers, so the browser can't call it directly. It holds no secrets and
 * costs nothing per call — which is the point: searching is free, and only a
 * confirmed match spends a RentCast valuation.
 */
import { handler, json, readJson, HttpError } from '../_shared/http.ts';
import { searchAddresses } from '../_shared/geocode.ts';
import { requireCaller } from '../_shared/supabase.ts';

type Body = { query?: string };

Deno.serve(
  handler(async (req) => {
    // Still gated on a session: this is an authenticated app, and an open
    // proxy is an invitation to use us as free geocoding infrastructure.
    await requireCaller(req);

    const { query } = await readJson<Body>(req);
    const trimmed = query?.trim() ?? '';

    // Low, because the primary provider does prefix matching — "17614 88th"
    // is enough to find a house. Below four characters it's all noise.
    if (trimmed.length < 4) return json({ matches: [] });

    if (trimmed.length > 200) {
      throw new HttpError(400, 'That address is too long');
    }

    return json({ matches: await searchAddresses(trimmed) });
  }),
);
