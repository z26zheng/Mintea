import {
  addMonths,
  differenceInCalendarDays,
  format,
  isAfter,
  parseISO,
  startOfMonth,
} from 'date-fns';

import type { PropertyDetailsRow } from '../types/database';
import type { Cents } from './money';
import type { IsoDate } from './dates';

// `parseISO`/`format` are used directly rather than via `domain/dates` because
// this module is unit tested, and the test runner can only resolve type-only
// relative imports. The behaviour is identical: `parseISO` reads a date-only
// string as local midnight, where `new Date(str)` would read it as UTC and
// shift every date a day backwards west of Greenwich.
const fromIsoDate = (value: IsoDate): Date => parseISO(value);
const toIsoDate = (date: Date): IsoDate => format(date, 'yyyy-MM-dd');

/** Property types RentCast recognises, in the order worth offering. */
export const PROPERTY_TYPES = [
  'Single Family',
  'Condo',
  'Townhouse',
  'Multi-Family',
  'Manufactured',
  'Apartment',
  'Land',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Single-line address, preferring the provider's normalised form. */
export function propertyAddress(details: PropertyDetailsRow): string {
  if (details.formatted_address) return details.formatted_address;

  return [details.address_line, details.city, details.state, details.postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

/** The AVM's confidence band, when the provider supplied one. */
export function valuationRange(
  details: PropertyDetailsRow,
): { lowCents: Cents; highCents: Cents } | null {
  if (
    details.last_valuation_low_cents == null ||
    details.last_valuation_high_cents == null
  ) {
    return null;
  }

  return {
    lowCents: details.last_valuation_low_cents,
    highCents: details.last_valuation_high_cents,
  };
}

/**
 * True once an automatic valuation is old enough to be worth refreshing.
 * Manually-valued properties are never "stale" — the user owns that number.
 */
export function isValuationStale(
  details: PropertyDetailsRow,
  { days = 45, now = new Date() }: { days?: number; now?: Date } = {},
): boolean {
  if (details.valuation_source !== 'rentcast') return false;
  if (!details.last_valued_at) return true;

  const ageDays = (now.getTime() - Date.parse(details.last_valued_at)) / 86_400_000;
  return ageDays > days;
}

export type ValuationPoint = { date: IsoDate; balanceCents: Cents };

/**
 * Reconstructs a monthly value curve between what the user paid and what the
 * property is worth now.
 *
 * Without this a property bought years ago contributes a flat line to the net
 * worth chart right up to the day it was added, then jumps — which reads as a
 * sudden windfall rather than years of slow appreciation.
 *
 * The shape is a constant growth rate fitted to the two known endpoints. It is
 * deliberately smooth: it does not claim to know that 2022 was flat and 2021
 * was hot. Swapping in a real ZIP-level index (Zillow ZHVI, FHFA HPI) would
 * replace only this function.
 */
export function interpolateValuationHistory(input: {
  purchasePriceCents: Cents;
  purchaseDate: IsoDate;
  currentValueCents: Cents;
  today?: Date;
}): ValuationPoint[] {
  const today = input.today ?? new Date();
  const start = fromIsoDate(input.purchaseDate);

  // A future purchase date has no history to draw.
  if (isAfter(start, today)) return [];

  const totalDays = differenceInCalendarDays(today, start);

  if (totalDays <= 0) {
    return [{ date: toIsoDate(today), balanceCents: input.currentValueCents }];
  }

  // Compounding needs a positive base; fall back to a straight line when the
  // purchase price is missing or zero.
  const canCompound =
    input.purchasePriceCents > 0 && input.currentValueCents > 0;
  const ratio = canCompound
    ? input.currentValueCents / input.purchasePriceCents
    : 1;

  const valueAt = (date: Date): Cents => {
    const fraction = differenceInCalendarDays(date, start) / totalDays;

    if (!canCompound) {
      return Math.round(
        input.purchasePriceCents +
          (input.currentValueCents - input.purchasePriceCents) * fraction,
      );
    }

    return Math.round(input.purchasePriceCents * ratio ** fraction);
  };

  const points: ValuationPoint[] = [
    { date: input.purchaseDate, balanceCents: input.purchasePriceCents },
  ];

  // One point on the first of each month in between, which is enough shape for
  // the chart without writing a row per day.
  let cursor = startOfMonth(addMonths(start, 1));

  while (cursor < today) {
    points.push({ date: toIsoDate(cursor), balanceCents: valueAt(cursor) });
    cursor = addMonths(cursor, 1);
  }

  points.push({ date: toIsoDate(today), balanceCents: input.currentValueCents });

  // The purchase date can land on the 1st, colliding with a generated point.
  // `account_balances` is unique per (account, date), so the later value wins.
  const byDate = new Map<IsoDate, Cents>();
  for (const point of points) byDate.set(point.date, point.balanceCents);

  return [...byDate.entries()]
    .map(([date, balanceCents]) => ({ date, balanceCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Gain since purchase, or null when there's nothing to compare against. */
export function equityGain(
  details: PropertyDetailsRow,
  currentValueCents: Cents,
): { changeCents: Cents; changeRatio: number } | null {
  if (!details.purchase_price_cents || details.purchase_price_cents <= 0) {
    return null;
  }

  const changeCents = currentValueCents - details.purchase_price_cents;

  return {
    changeCents,
    changeRatio: changeCents / details.purchase_price_cents,
  };
}
