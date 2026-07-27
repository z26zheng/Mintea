import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';

/** A calendar date with no time or zone, `YYYY-MM-DD`. Matches Postgres `date`. */
export type IsoDate = string;

export type DateRange = { start: IsoDate; end: IsoDate };

export type RangePreset = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export const RANGE_PRESETS: RangePreset[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

export const toIsoDate = (date: Date): IsoDate => format(date, 'yyyy-MM-dd');

/**
 * Parses `YYYY-MM-DD` as local midnight. Using `parseISO` rather than
 * `new Date(str)` matters: the latter treats a date-only string as UTC, which
 * shifts every transaction a day backwards for anyone west of Greenwich.
 */
export const fromIsoDate = (value: IsoDate): Date => parseISO(value);

export const isValidIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));

export const todayIso = (): IsoDate => toIsoDate(new Date());

/**
 * Resolves a preset into concrete bounds.
 *
 * `ALL` needs a floor, since an unbounded range would make the net worth query
 * generate a row per day since the epoch. `earliest` should be the oldest
 * balance snapshot the household has; it falls back to five years.
 */
export function resolveRange(
  preset: RangePreset,
  options: { today?: Date; earliest?: IsoDate } = {},
): DateRange {
  const today = options.today ?? new Date();
  const end = toIsoDate(today);

  switch (preset) {
    case '1M':
      return { start: toIsoDate(subMonths(today, 1)), end };
    case '3M':
      return { start: toIsoDate(subMonths(today, 3)), end };
    case '6M':
      return { start: toIsoDate(subMonths(today, 6)), end };
    case 'YTD':
      return { start: toIsoDate(startOfYear(today)), end };
    case '1Y':
      return { start: toIsoDate(subYears(today, 1)), end };
    case 'ALL': {
      const floor = toIsoDate(subYears(today, 5));
      const earliest = options.earliest;
      return {
        start: earliest && earliest > floor ? earliest : floor,
        end,
      };
    }
  }
}

export function monthRange(date: Date): DateRange {
  return {
    start: toIsoDate(startOfMonth(date)),
    end: toIsoDate(endOfMonth(date)),
  };
}

/** Inclusive day count, used to pick chart tick density. */
export const rangeLengthInDays = (range: DateRange): number =>
  differenceInCalendarDays(fromIsoDate(range.end), fromIsoDate(range.start)) + 1;

export function eachDayInRange(range: DateRange): IsoDate[] {
  const days: IsoDate[] = [];
  const end = fromIsoDate(range.end);
  let cursor = fromIsoDate(range.start);

  while (cursor <= end) {
    days.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

/**
 * Section headers in the transaction list: "Today", "Yesterday", then a
 * weekday-qualified date, dropping the year unless it differs from now.
 */
export function formatTransactionDate(
  value: IsoDate,
  today: Date = new Date(),
): string {
  const date = fromIsoDate(value);
  const dayDelta = differenceInCalendarDays(today, date);

  if (dayDelta === 0) return 'Today';
  if (dayDelta === 1) return 'Yesterday';

  return date.getFullYear() === today.getFullYear()
    ? format(date, 'EEE, MMM d')
    : format(date, 'MMM d, yyyy');
}

export const formatShortDate = (value: IsoDate): string =>
  format(fromIsoDate(value), 'MMM d');

export const formatMonthLabel = (value: IsoDate): string =>
  format(fromIsoDate(value), 'MMM yyyy');

export const formatFullDate = (value: IsoDate): string =>
  format(fromIsoDate(value), 'MMMM d, yyyy');
