/**
 * Money handling. Every amount in Mintea is an integer number of minor units
 * ("cents"), so arithmetic is exact and no float ever touches a balance.
 */

/** An integer number of minor currency units. Never fractional. */
export type Cents = number;

export type FormatMoneyOptions = {
  currency?: string;
  locale?: string;
  /** Drop the decimal part — useful for chart axes and large summaries. */
  hideCents?: boolean;
  /** Explicit decimal places. Overrides `hideCents` when both are given. */
  fractionDigits?: number;
  /** Force a leading `+` on positive values. */
  signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(
  locale: string,
  currency: string,
  fractionDigits: number,
  signDisplay: NonNullable<FormatMoneyOptions['signDisplay']>,
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${fractionDigits}|${signDisplay}`;
  let formatter = formatterCache.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      signDisplay,
    });
    formatterCache.set(key, formatter);
  }

  return formatter;
}

/** `-123456` → `-$1,234.56` */
export function formatMoney(
  cents: Cents,
  options: FormatMoneyOptions = {},
): string {
  const {
    currency = 'USD',
    locale = 'en-US',
    hideCents = false,
    fractionDigits = hideCents ? 0 : 2,
    signDisplay = 'auto',
  } = options;

  return getFormatter(locale, currency, fractionDigits, signDisplay).format(
    cents / 100,
  );
}

/**
 * Short form for axis labels and dense summaries: `$1.2K`, `-$3.4M`.
 * Falls back to the full format below $1,000.
 *
 * Built from the plain currency formatter rather than `notation: 'compact'`,
 * because compact notation is not reliably implemented in Hermes on device.
 */
export function formatMoneyCompact(
  cents: Cents,
  options: FormatMoneyOptions = {},
): string {
  const magnitude = Math.abs(cents);

  if (magnitude < 100_000) {
    return formatMoney(cents, { ...options, hideCents: true });
  }

  const units: Array<readonly [number, string]> = [
    [100_000_000_000, 'B'],
    [100_000_000, 'M'],
    [100_000, 'K'],
  ];

  for (const [threshold, suffix] of units) {
    if (magnitude < threshold) continue;

    // `value` is expressed in whole units — 1.5 meaning 1.5M.
    const value = cents / threshold;
    // One decimal below ten units ($1.2M), none above ($12M).
    const digits = Math.abs(value) < 10 ? 1 : 0;
    const rounded = Math.round(value * 10 ** digits) / 10 ** digits;

    return `${formatMoney(Math.round(rounded * 100), {
      ...options,
      fractionDigits: digits,
    })}${suffix}`;
  }

  return formatMoney(cents, options);
}

/**
 * Parses user input into cents without going through a float.
 *
 * Accepts `1234.5`, `$1,234.56`, `-12.34`, `(12.34)` (accounting negative),
 * and bare `.5`. Returns `null` if the input isn't a number.
 */
export function parseMoney(input: string): Cents | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const isParenNegative = /^\(.*\)$/.test(trimmed);

  // Strip everything that isn't a digit, separator, or leading sign.
  const cleaned = trimmed.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;

  const isNegative = isParenNegative || cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');

  const parts = unsigned.split('.');
  if (parts.length > 2) return null;

  const whole = parts[0] ?? '';
  const fraction = parts[1] ?? '';

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;
  if (whole === '' && fraction === '') return null;

  // Round rather than truncate when the user types more than 2 decimals.
  const centsFromFraction = Math.round(
    Number.parseInt((fraction + '000').slice(0, 3), 10) / 10,
  );

  const magnitude =
    Number.parseInt(whole === '' ? '0' : whole, 10) * 100 + centsFromFraction;

  if (!Number.isFinite(magnitude)) return null;

  return isNegative ? -magnitude : magnitude;
}

/** Sum that stays in integer space. */
export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Splits an amount into `count` parts that add back up to exactly the original,
 * distributing the remainder one cent at a time. Used when splitting a
 * transaction evenly.
 */
export function divideCents(total: Cents, count: number): Cents[] {
  if (count <= 0) return [];

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const base = Math.floor(magnitude / count);
  const remainder = magnitude - base * count;

  return Array.from({ length: count }, (_, index) =>
    sign * (base + (index < remainder ? 1 : 0)),
  );
}

/** Transactions are negative when money leaves the account. */
export const isExpense = (cents: Cents): boolean => cents < 0;
export const isIncome = (cents: Cents): boolean => cents > 0;

/** Display magnitude — the UI shows "$42.00" with the sign conveyed by colour. */
export const absCents = (cents: Cents): Cents => Math.abs(cents);
