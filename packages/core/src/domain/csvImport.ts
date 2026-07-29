/**
 * Reading a bank's CSV export.
 *
 * Every bank formats differently and none of them tell you how, so almost all
 * of the work here is refusing to guess wrong:
 *
 *  - `03/04/2026` is March 4th or April 3rd depending on the bank's country,
 *    and picking the wrong one silently moves a transaction by a month. The
 *    order is inferred from the file when the data proves it and reported as
 *    ambiguous when it does not.
 *  - amounts arrive as `$1,234.56`, `(45.00)`, `45.00-`, or split across
 *    separate debit and credit columns, each with its own sign convention.
 *  - a description can contain the delimiter, quotes, or a line break.
 *
 * Free of relative runtime imports so it stays unit-testable under Node's type
 * stripping.
 */

/** Strips a byte-order mark, which otherwise corrupts the first header. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC 4180 parse.
 *
 * Handles quoted fields containing the delimiter, doubled quotes, and embedded
 * line breaks. Accepts CRLF or LF, since exports vary.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const source = stripBom(text);

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      started = true;
      continue;
    }

    if (char === delimiter) {
      endField();
      started = true;
      continue;
    }

    if (char === '\r') continue;

    if (char === '\n') {
      // A trailing newline should not produce a phantom empty row.
      if (started || field !== '' || row.length > 0) endRow();
      continue;
    }

    field += char;
    started = true;
  }

  if (started || field !== '' || row.length > 0) endRow();

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export type ColumnRole = 'date' | 'description' | 'amount' | 'debit' | 'credit';

/** Header names seen across common bank exports, lowercased. */
const HEADER_HINTS: Record<ColumnRole, string[]> = {
  date: ['date', 'transaction date', 'posted date', 'posting date', 'trans date'],
  description: ['description', 'name', 'payee', 'merchant', 'memo', 'details', 'transaction'],
  amount: ['amount', 'transaction amount', 'value'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out'],
  credit: ['credit', 'deposit', 'deposits', 'money in', 'paid in'],
};

export type ColumnMapping = Partial<Record<ColumnRole, number>>;

/** Best-guess mapping from a header row. Callers may override any of it. */
export function detectColumns(header: string[]): ColumnMapping {
  const normalized = header.map((cell) => cell.trim().toLowerCase());
  const mapping: ColumnMapping = {};

  for (const [role, hints] of Object.entries(HEADER_HINTS) as Array<
    [ColumnRole, string[]]
  >) {
    // Exact match first; a column literally called "Amount" should win over
    // one called "Amount in account currency" matched by prefix.
    let index = normalized.findIndex((cell) => hints.includes(cell));
    if (index === -1) {
      index = normalized.findIndex((cell) =>
        hints.some((hint) => cell.includes(hint)),
      );
    }
    if (index !== -1) mapping[role] = index;
  }

  // "Debit"/"Credit" also match the word "amount" in some files; if a real
  // amount column exists, prefer it and ignore the pair.
  if (mapping.amount !== undefined) {
    delete mapping.debit;
    delete mapping.credit;
  }

  return mapping;
}

/**
 * Money from a bank's text, in cents.
 *
 * Returns null rather than 0 for anything unparseable — a silent zero would
 * import a transaction with the wrong amount, which is worse than skipping it.
 */
export function parseCsvAmount(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;

  let negative = false;

  // Accountants wrap negatives in parentheses.
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  // Some exports put the sign after the number.
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1).trim();
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1).trim();
  }
  if (text.startsWith('+')) text = text.slice(1).trim();

  // Currency symbols and thousands separators.
  text = text.replace(/[$£€¥]/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const cents = Math.round(Number(text) * 100);
  if (!Number.isFinite(cents)) return null;

  return negative ? -cents : cents;
}

export type DateOrder = 'iso' | 'mdy' | 'dmy';

/**
 * Which order a column's dates are in.
 *
 * Returns null when the sample is genuinely ambiguous — every row could be
 * read either way — so the caller can ask instead of silently choosing.
 */
export function detectDateOrder(samples: string[]): DateOrder | null {
  const parts = samples
    .map((sample) => sample.trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})$/))
    .filter((match): match is RegExpMatchArray => match !== null);

  if (parts.length === 0) return null;

  // A four-digit leading field can only be a year.
  if (parts.every((match) => match[1]!.length === 4)) return 'iso';

  const firstOverTwelve = parts.some((match) => Number(match[1]) > 12);
  const secondOverTwelve = parts.some((match) => Number(match[2]) > 12);

  if (firstOverTwelve && secondOverTwelve) return null; // contradictory
  if (firstOverTwelve) return 'dmy';
  if (secondOverTwelve) return 'mdy';

  return null; // every row reads both ways
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** An ISO date, or null if the text is not a date in the given order. */
export function parseCsvDate(raw: string, order: DateOrder): string | null {
  const match = raw.trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!match) return null;

  const [, a, b, c] = match as unknown as [string, string, string, string];

  let year: number;
  let month: number;
  let day: number;

  if (order === 'iso') {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else {
    year = Number(c);
    month = order === 'mdy' ? Number(a) : Number(b);
    day = order === 'mdy' ? Number(b) : Number(a);
    // Two-digit years: banks do not export 19xx statements.
    if (year < 100) year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Reject a day that does not exist in that month rather than letting Date
  // roll it forward into the next one.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (asDate.getUTCMonth() !== month - 1 || asDate.getUTCDate() !== day) return null;

  return `${year}-${pad(month)}-${pad(day)}`;
}

export type ParsedRow = {
  /** 1-based line number in the file, for error messages. */
  line: number;
  date: string;
  description: string;
  amountCents: number;
};

export type RowProblem = { line: number; reason: string };

export type ParseResult = {
  rows: ParsedRow[];
  problems: RowProblem[];
  dateOrder: DateOrder | null;
  /** True when the order had to be assumed because the data did not prove it. */
  dateOrderAssumed: boolean;
};

/**
 * Turns a parsed grid into transaction rows.
 *
 * Bad rows become problems rather than throwing, so one malformed line in a
 * thousand does not cost the user the whole import.
 */
export function buildImportRows(
  grid: string[][],
  mapping: ColumnMapping,
  options: { dateOrder?: DateOrder; hasHeader?: boolean } = {},
): ParseResult {
  const hasHeader = options.hasHeader ?? true;
  const body = hasHeader ? grid.slice(1) : grid;
  const offset = hasHeader ? 2 : 1;

  if (mapping.date === undefined || mapping.description === undefined) {
    return {
      rows: [],
      problems: [{ line: 1, reason: 'Could not find a date and description column' }],
      dateOrder: null,
      dateOrderAssumed: false,
    };
  }
  if (
    mapping.amount === undefined &&
    (mapping.debit === undefined && mapping.credit === undefined)
  ) {
    return {
      rows: [],
      problems: [{ line: 1, reason: 'Could not find an amount column' }],
      dateOrder: null,
      dateOrderAssumed: false,
    };
  }

  const dateColumn = mapping.date;
  const detected = detectDateOrder(body.map((cells) => cells[dateColumn] ?? ''));
  const dateOrder = options.dateOrder ?? detected ?? 'mdy';
  const dateOrderAssumed = options.dateOrder === undefined && detected === null;

  const rows: ParsedRow[] = [];
  const problems: RowProblem[] = [];

  body.forEach((cells, index) => {
    const line = index + offset;
    const date = parseCsvDate(cells[dateColumn] ?? '', dateOrder);
    if (!date) {
      problems.push({ line, reason: `Could not read the date "${cells[dateColumn] ?? ''}"` });
      return;
    }

    const description = (cells[mapping.description!] ?? '').trim();
    if (!description) {
      problems.push({ line, reason: 'No description' });
      return;
    }

    let amountCents: number | null = null;

    if (mapping.amount !== undefined) {
      amountCents = parseCsvAmount(cells[mapping.amount] ?? '');
    } else {
      const debit = mapping.debit !== undefined
        ? parseCsvAmount(cells[mapping.debit] ?? '')
        : null;
      const credit = mapping.credit !== undefined
        ? parseCsvAmount(cells[mapping.credit] ?? '')
        : null;

      // A debit column holds money out even though it is written unsigned.
      if (debit !== null && debit !== 0) amountCents = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amountCents = Math.abs(credit);
    }

    if (amountCents === null) {
      problems.push({ line, reason: 'Could not read the amount' });
      return;
    }
    if (amountCents === 0) {
      problems.push({ line, reason: 'Amount is zero' });
      return;
    }

    rows.push({ line, date, description, amountCents });
  });

  return { rows, problems, dateOrder, dateOrderAssumed };
}

export type MatchCandidate = { date: string; amountCents: number };

export type ClassifiedRow = ParsedRow & { duplicate: boolean };

export type ImportPlan = {
  toImport: ParsedRow[];
  duplicates: ParsedRow[];
  rows: ClassifiedRow[];
};

/**
 * Decides which rows are already in the account.
 *
 * Matches on date and amount rather than description, because the case that
 * actually corrupts data is importing a bank's CSV into an account Plaid also
 * feeds: Plaid rewrites descriptions, so `PURCHASE AUTHORIZED ON 01/15 SQ
 * *BLUE BOT` and `Blue Bottle Coffee` are the same charge under two names, and
 * a description-based match would let it in twice.
 *
 * Counted as a multiset, so two genuine $5 coffees on one day both import when
 * the account holds one of them — the second is new, not a repeat.
 *
 * The trade-off is that two unrelated charges of the same amount on the same
 * day look identical here. Skipped rows are therefore reported with their
 * descriptions so the user can see exactly what was held back.
 */
export function planImport(
  rows: ParsedRow[],
  existing: MatchCandidate[],
): ImportPlan {
  const remaining = new Map<string, number>();
  const key = (candidate: MatchCandidate) =>
    `${candidate.date}|${candidate.amountCents}`;

  for (const candidate of existing) {
    const k = key(candidate);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }

  const classified: ClassifiedRow[] = rows.map((row) => {
    const k = key(row);
    const left = remaining.get(k) ?? 0;

    if (left > 0) {
      remaining.set(k, left - 1);
      return { ...row, duplicate: true };
    }
    return { ...row, duplicate: false };
  });

  return {
    rows: classified,
    toImport: classified.filter((row) => !row.duplicate),
    duplicates: classified.filter((row) => row.duplicate),
  };
}

/** The window to check for duplicates: the span the file itself covers. */
export function rowDateRange(
  rows: ParsedRow[],
): { start: string; end: string } | null {
  if (rows.length === 0) return null;
  const dates = rows.map((row) => row.date).sort();
  return { start: dates[0]!, end: dates[dates.length - 1]! };
}
