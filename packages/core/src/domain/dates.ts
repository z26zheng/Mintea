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

/** Whether `value` names an IANA time zone supported by this runtime. */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** The device zone used to initialize or explicitly update a household. */
export function getDeviceTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone && isValidTimeZone(timeZone) ? timeZone : 'UTC';
}

/**
 * Formats an instant as a calendar date in the household's reporting zone.
 *
 * `toISOString().slice(0, 10)` is always UTC and can therefore be tomorrow for
 * a user in the Americas. `formatToParts` keeps this free of locale-specific
 * ordering while using the platform's IANA time-zone database.
 */
export function toIsoDateInTimeZone(
  date: Date,
  timeZone: string,
): IsoDate {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA time zone: ${timeZone}`);
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    if (!value) throw new RangeError(`Could not format ${type} in ${timeZone}`);
    return value;
  };

  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Resolves a preset into concrete bounds.
 *
 * `ALL` needs a floor, since an unbounded range would make the net worth query
 * generate a row per day since the epoch. `earliest` should be the oldest
 * balance snapshot the household has; it falls back to five years.
 */
export function resolveRange(
  preset: RangePreset,
  options: { today?: Date; todayIso?: IsoDate; earliest?: IsoDate } = {},
): DateRange {
  if (options.todayIso && !isValidIsoDate(options.todayIso)) {
    throw new RangeError(`Invalid ISO date: ${options.todayIso}`);
  }

  // Parse the zone-resolved date as local midnight so date-fns performs only
  // calendar arithmetic. The actual device time zone is irrelevant from here.
  const today = options.todayIso
    ? fromIsoDate(options.todayIso)
    : (options.today ?? new Date());
  const end = options.todayIso ?? toIsoDate(today);

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
