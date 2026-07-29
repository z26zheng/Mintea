import assert from 'node:assert/strict';
import test from 'node:test';

import {
  centsToCsvAmount,
  escapeCsvValue,
  safeFileName,
  toCsv,
  UTF8_BOM,
} from '../packages/core/src/domain/csv.ts';

test('leaves ordinary values unquoted', () => {
  assert.equal(escapeCsvValue('Blue Bottle Coffee'), 'Blue Bottle Coffee');
  assert.equal(escapeCsvValue(42), '42');
  assert.equal(escapeCsvValue(''), '');
});

test('treats null and undefined as an empty field', () => {
  assert.equal(escapeCsvValue(null), '');
  assert.equal(escapeCsvValue(undefined), '');
});

test('quotes the characters that would otherwise break a row', () => {
  assert.equal(escapeCsvValue('Trader Joe’s, Ballard'), '"Trader Joe’s, Ballard"');
  assert.equal(escapeCsvValue('line one\nline two'), '"line one\nline two"');
  assert.equal(escapeCsvValue('carriage\rreturn'), '"carriage\rreturn"');
});

test('doubles embedded quotes rather than escaping them with a backslash', () => {
  // A backslash escape is a common mistake; RFC 4180 doubles the quote.
  assert.equal(escapeCsvValue('He said "hi"'), '"He said ""hi"""');
});

test('quotes values whose surrounding spaces a reader would trim', () => {
  assert.equal(escapeCsvValue('  padded  '), '"  padded  "');
  assert.equal(escapeCsvValue('trailing '), '"trailing "');
});

test('writes a header, CRLF line endings and a trailing newline', () => {
  const csv = toCsv(
    [{ name: 'Groceries', cents: -1234 }],
    [
      { header: 'Category', value: (row) => row.name },
      { header: 'Amount', value: (row) => centsToCsvAmount(row.cents) },
    ],
    { bom: false },
  );

  assert.equal(csv, 'Category,Amount\r\nGroceries,-12.34\r\n');
});

test('prefixes a byte-order mark by default so Excel reads UTF-8', () => {
  const csv = toCsv([], [{ header: 'Name', value: () => '' }]);

  // Assert the codepoint rather than `startsWith(UTF8_BOM)`: that comparison
  // passes for every string if the constant is ever emptied by a bad edit,
  // which would silently ship files Excel renders as mojibake.
  assert.equal(UTF8_BOM.length, 1);
  assert.equal(UTF8_BOM.codePointAt(0), 0xfeff);
  assert.equal(csv.codePointAt(0), 0xfeff);

  // A header-only file is still valid; the BOM must not corrupt it.
  assert.equal(csv.slice(1), 'Name\r\n');
});

test('omits the mark when asked, byte for byte', () => {
  const csv = toCsv([], [{ header: 'Name', value: () => '' }], { bom: false });
  assert.notEqual(csv.codePointAt(0), 0xfeff);
  assert.equal(csv, 'Name\r\n');
});

test('escapes headers too', () => {
  const csv = toCsv([], [{ header: 'Amount, in USD', value: () => '' }], {
    bom: false,
  });
  assert.equal(csv, '"Amount, in USD"\r\n');
});

test('a comma inside a field cannot shift later columns', () => {
  const csv = toCsv(
    [{ description: 'AMAZON, MKTPLACE', account: 'Checking' }],
    [
      { header: 'Description', value: (row) => row.description },
      { header: 'Account', value: (row) => row.account },
    ],
    { bom: false },
  );

  const [, row] = csv.trim().split('\r\n');
  assert.equal(row, '"AMAZON, MKTPLACE",Checking');
});

test('formats cents as a plain decimal on both sides of zero', () => {
  assert.equal(centsToCsvAmount(0), '0.00');
  assert.equal(centsToCsvAmount(5), '0.05');
  assert.equal(centsToCsvAmount(-5), '-0.05');
  assert.equal(centsToCsvAmount(100), '1.00');
  assert.equal(centsToCsvAmount(-12847), '-128.47');
});

test('keeps large amounts free of grouping separators', () => {
  // A thousands separator would make the column non-numeric in a spreadsheet.
  assert.equal(centsToCsvAmount(123456789), '1234567.89');
  assert.doesNotMatch(centsToCsvAmount(123456789), /,/);
});

test('builds filenames that are safe on every platform', () => {
  assert.equal(safeFileName('Mintea transactions 2026-07', 'csv'),
    'Mintea-transactions-2026-07.csv');
  assert.equal(safeFileName('a/b\\c:d*e?f', 'csv'), 'a-b-c-d-e-f.csv');
});

test('never produces an empty or hidden filename', () => {
  assert.equal(safeFileName('', 'csv'), 'export.csv');
  assert.equal(safeFileName('...', 'csv'), 'export.csv');
  assert.doesNotMatch(safeFileName('.hidden', 'csv'), /^\./);
});
