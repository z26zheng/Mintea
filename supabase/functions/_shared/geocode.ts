/**
 * Address autocomplete for the add-property flow.
 *
 * Two providers, in order:
 *
 *  1. Photon (Komoot's OSM geocoder) — handles *partial* input, which is the
 *     whole point of a search box. Free, no key.
 *  2. US Census geocoder — authoritative for US addresses but a matcher, not a
 *     type-ahead: it needs a near-complete address. Used as a fallback because
 *     OSM's US house-number coverage has real gaps.
 *
 * Neither is the valuation provider, so typing costs nothing — only a
 * confirmed match spends one of RentCast's 50 monthly calls.
 *
 * Both are proxied through this function because neither sends CORS headers.
 *
 * Note for later: photon.komoot.io is a free public instance under a fair-use
 * policy. Fine for personal use; a real user base wants a self-hosted Photon
 * or a paid provider (Geoapify, LocationIQ, Google Places).
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';
const CENSUS_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

export type AddressMatch = {
  /** Full standardised address, e.g. "17614 88th Pl NE, Bothell, WA 98011". */
  formatted: string;
  /** Street line only, e.g. "17614 88th Pl NE". */
  line: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

// Photon returns state names inconsistently — "WA" for one result and
// "Washington" for the next. RentCast wants a two-letter code.
const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI',
  idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function normalizeState(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_CODES[trimmed.toLowerCase()] ?? trimmed;
}

const KEEP_UPPER = new Set([
  'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
]);

/** Census returns SHOUTING CASE; Photon is already mixed case. */
function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => {
      if (KEEP_UPPER.has(word.toUpperCase()) && word.length <= 2) {
        return word.toUpperCase();
      }
      if (/^\d+(ST|ND|RD|TH)$/i.test(word)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function compose(
  line: string,
  city: string | null,
  state: string | null,
  postalCode: string | null,
): string {
  return [line, city, [state, postalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

// ------------------------------------------------------------------- Photon

type PhotonResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: Record<string, string | undefined>;
  }>;
};

async function searchPhoton(query: string): Promise<AddressMatch[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '8');
  // Restricts to house-level hits. Without it the results include cities and
  // unrelated streets from across the country.
  url.searchParams.set('layer', 'house');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];

  const body = (await response.json()) as PhotonResponse;

  return (body.features ?? []).flatMap((feature) => {
    const p = feature.properties ?? {};

    // RentCast is US-only, and a result without a house number can't be
    // valued — no point offering either.
    if (p.countrycode !== 'US') return [];
    if (!p.housenumber || !p.street) return [];

    const line = `${p.housenumber} ${p.street}`;
    const city = p.city ?? p.district ?? null;
    const state = normalizeState(p.state);
    const postalCode = p.postcode ?? null;
    const coordinates = feature.geometry?.coordinates;

    return [
      {
        formatted: compose(line, city, state, postalCode),
        line,
        city,
        state,
        postalCode,
        latitude: coordinates?.[1] ?? null,
        longitude: coordinates?.[0] ?? null,
      },
    ];
  });
}

// ------------------------------------------------------------------- Census

type CensusResponse = {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: string;
      coordinates?: { x?: number; y?: number };
      addressComponents?: Record<string, string>;
    }>;
  };
};

async function searchCensus(query: string): Promise<AddressMatch[]> {
  const url = new URL(CENSUS_URL);
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];

  const body = (await response.json()) as CensusResponse;

  return (body.result?.addressMatches ?? []).flatMap((match) => {
    if (!match.matchedAddress) return [];

    const components = match.addressComponents ?? {};
    const line = titleCase((match.matchedAddress.split(',')[0] ?? '').trim());
    const city = components.city ? titleCase(components.city) : null;
    const state = normalizeState(components.state);
    const postalCode = components.zip ?? null;

    return [
      {
        formatted: compose(line, city, state, postalCode),
        line,
        city,
        state,
        postalCode,
        latitude: match.coordinates?.y ?? null,
        longitude: match.coordinates?.x ?? null,
      },
    ];
  });
}

// -------------------------------------------------------------------- entry

export async function searchAddresses(query: string): Promise<AddressMatch[]> {
  const photon = await searchPhoton(query).catch(() => []);

  // Census only fires when OSM has nothing, so the common path stays a single
  // upstream request.
  const results =
    photon.length > 0 ? photon : await searchCensus(query).catch(() => []);

  // Two providers, and Photon itself can repeat an address across nearby
  // nodes; dedupe on the composed string.
  const seen = new Set<string>();

  return results.filter((match) => {
    const key = match.formatted.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
