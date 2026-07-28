/**
 * Address matching via the US Census Bureau geocoder.
 *
 * Free, no API key, no rate limit, public domain — and crucially it is a
 * *separate* service from RentCast, so typing in the search box never spends
 * the 50-calls-a-month valuation budget. Only a confirmed match does.
 *
 * It has to be proxied through this function because the Census endpoint sends
 * no `Access-Control-Allow-Origin`, so a browser cannot call it directly.
 */

const ENDPOINT =
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

type CensusResponse = {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: string;
      coordinates?: { x?: number; y?: number };
      addressComponents?: Record<string, string>;
    }>;
  };
};

// Census returns SHOUTING CASE. Directionals and state codes stay uppercase;
// everything else is title-cased so the list is readable.
const KEEP_UPPER = new Set([
  'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
  'NORTHEAST', 'NORTHWEST', 'SOUTHEAST', 'SOUTHWEST',
]);

function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => {
      if (KEEP_UPPER.has(word)) return word;
      // Ordinals like 88TH should read 88th, not 88Th.
      if (/^\d+(ST|ND|RD|TH)$/.test(word)) return word.toLowerCase();
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export async function searchAddresses(query: string): Promise<AddressMatch[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!response.ok) return [];

  const body = (await response.json()) as CensusResponse;
  const matches = body.result?.addressMatches ?? [];

  return matches.flatMap((match) => {
    if (!match.matchedAddress) return [];

    const components = match.addressComponents ?? {};
    const state = components.state ?? null;
    const postalCode = components.zip ?? null;
    const city = components.city ? titleCase(components.city) : null;

    // "17614 88TH PL NE, BOTHELL, WA, 98011" → street line is everything
    // before the first comma.
    const line = titleCase((match.matchedAddress.split(',')[0] ?? '').trim());

    return [
      {
        formatted: [line, city, [state, postalCode].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', '),
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
