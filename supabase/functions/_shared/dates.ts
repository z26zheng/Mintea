/** A calendar date in the household's IANA reporting time zone. */
export function calendarDateInTimeZone(
  date: Date,
  timeZone: string,
): string {
  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new RangeError(`Invalid IANA time zone: ${timeZone}`);
  }

  const parts = formatter.formatToParts(date);
  const part = (type: 'year' | 'month' | 'day'): string => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    if (!value) throw new RangeError(`Could not format ${type} in ${timeZone}`);
    return value;
  };

  return `${part('year')}-${part('month')}-${part('day')}`;
}
