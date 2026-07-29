import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildImportRows,
  detectColumns,
  detectDateOrder,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
  planImport,
  rowDateRange,
} from '../packages/core/src/domain/csvImport.ts';

test('parses a plain file', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('a quoted field may contain the delimiter', () => {
  assert.deepEqual(parseCsv('date,description\n2026-01-02,"AMAZON, MKTPLACE"\n'), [
    ['date', 'description'],
    ['2026-01-02', 'AMAZON, MKTPLACE'],
  ]);
});

test('doubled quotes decode to one quote', () => {
  assert.deepEqual(parseCsv('a\n"He said ""hi"""\n'), [['a'], ['He said "hi"']]);
});

test('a quoted field may contain a line break', () => {
  const [, row] = parseCsv('a,b\n"line one\nline two",x\n');
  assert.deepEqual(row, ['line one\nline two', 'x']);
});

test('accepts CRLF and strips a byte-order mark', () => {
  // Excel writes both; the BOM would otherwise corrupt the first header.
  assert.deepEqual(parseCsv('﻿date,amount\r\n2026-01-02,5\r\n'), [
    ['date', 'amount'],
    ['2026-01-02', '5'],
  ]);
});

test('a trailing newline does not create a phantom row', () => {
  assert.equal(parseCsv('a,b\n1,2\n\n').length, 2);
});

test('preserves empty fields between delimiters', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3\n')[1], ['1', '', '3']);
});

test('detects the usual header names', () => {
  const mapping = detectColumns(['Transaction Date', 'Description', 'Amount']);
  assert.deepEqual(mapping, { date: 0, description: 1, amount: 2 });
});

test('detects separate debit and credit columns', () => {
  const mapping = detectColumns(['Date', 'Payee', 'Debit', 'Credit']);
  assert.equal(mapping.debit, 2);
  assert.equal(mapping.credit, 3);
  assert.equal(mapping.amount, undefined);
});

test('a real amount column wins over a debit/credit pair', () => {
  const mapping = detectColumns(['Date', 'Memo', 'Debit', 'Credit', 'Amount']);
  assert.equal(mapping.amount, 4);
  assert.equal(mapping.debit, undefined);
});

test('reads the shapes banks actually write amounts in', () => {
  assert.equal(parseCsvAmount('1234.56'), 123456);
  assert.equal(parseCsvAmount('$1,234.56'), 123456);
  assert.equal(parseCsvAmount('-45.00'), -4500);
  assert.equal(parseCsvAmount('(45.00)'), -4500);
  assert.equal(parseCsvAmount('45.00-'), -4500);
  assert.equal(parseCsvAmount('+45'), 4500);
  assert.equal(parseCsvAmount('  12.30  '), 1230);
});

test('unparseable money is null, never zero', () => {
  // A silent zero would import a transaction with the wrong amount, which is
  // worse than skipping the row.
  assert.equal(parseCsvAmount(''), null);
  assert.equal(parseCsvAmount('n/a'), null);
  assert.equal(parseCsvAmount('12.3.4'), null);
});

test('a leading four-digit field can only be a year', () => {
  assert.equal(detectDateOrder(['2026-01-02', '2026-03-04']), 'iso');
});

test('a day over twelve proves the order', () => {
  assert.equal(detectDateOrder(['01/13/2026', '02/03/2026']), 'mdy');
  assert.equal(detectDateOrder(['13/01/2026', '03/02/2026']), 'dmy');
});

test('refuses to guess when every row reads both ways', () => {
  // 03/04 is March 4th or April 3rd; choosing silently moves it by a month.
  assert.equal(detectDateOrder(['03/04/2026', '05/06/2026']), null);
});

test('refuses to guess when the file contradicts itself', () => {
  assert.equal(detectDateOrder(['13/01/2026', '01/13/2026']), null);
});

test('parses dates in the order it is told', () => {
  assert.equal(parseCsvDate('03/04/2026', 'mdy'), '2026-03-04');
  assert.equal(parseCsvDate('03/04/2026', 'dmy'), '2026-04-03');
  assert.equal(parseCsvDate('2026-03-04', 'iso'), '2026-03-04');
});

test('expands a two-digit year into this century', () => {
  assert.equal(parseCsvDate('03/04/26', 'mdy'), '2026-03-04');
});

test('rejects a day that does not exist in that month', () => {
  // Date would otherwise roll February 30th forward into March.
  assert.equal(parseCsvDate('02/30/2026', 'mdy'), null);
  assert.equal(parseCsvDate('13/01/2026', 'mdy'), null);
});

test('builds rows from a typical export', () => {
  const grid = parseCsv(
    'Date,Description,Amount\n01/15/2026,"TRADER JOES #123",-45.20\n01/16/2026,PAYROLL,2500.00\n',
  );
  const result = buildImportRows(grid, detectColumns(grid[0]));

  assert.equal(result.problems.length, 0);
  assert.deepEqual(result.rows, [
    { line: 2, date: '2026-01-15', description: 'TRADER JOES #123', amountCents: -4520 },
    { line: 3, date: '2026-01-16', description: 'PAYROLL', amountCents: 250000 },
  ]);
});

test('a debit column means money out even though it is written unsigned', () => {
  const grid = parseCsv('Date,Payee,Debit,Credit\n01/15/2026,RENT,1500.00,\n01/16/2026,REFUND,,25.00\n');
  const result = buildImportRows(grid, detectColumns(grid[0]));

  assert.deepEqual(
    result.rows.map((r) => r.amountCents),
    [-150000, 2500],
  );
});

test('one bad line does not cost the whole import', () => {
  const grid = parseCsv(
    'Date,Description,Amount\n01/15/2026,GOOD,-10.00\nnot-a-date,BAD,-10.00\n01/17/2026,ALSO GOOD,-20.00\n',
  );
  const result = buildImportRows(grid, detectColumns(grid[0]));

  assert.equal(result.rows.length, 2);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].line, 3);
  assert.match(result.problems[0].reason, /Could not read the date/);
});

test('reports the line number a problem is on, counting the header', () => {
  const grid = parseCsv('Date,Description,Amount\n01/15/2026,,-10.00\n');
  const result = buildImportRows(grid, detectColumns(grid[0]));
  assert.deepEqual(result.problems, [{ line: 2, reason: 'No description' }]);
});

test('a zero amount is a problem, not a transaction', () => {
  const grid = parseCsv('Date,Description,Amount\n01/15/2026,NOTHING,0.00\n');
  const result = buildImportRows(grid, detectColumns(grid[0]));
  assert.equal(result.rows.length, 0);
  assert.match(result.problems[0].reason, /zero/);
});

test('says so when the date order had to be assumed', () => {
  const grid = parseCsv('Date,Description,Amount\n03/04/2026,X,-1.00\n');
  const result = buildImportRows(grid, detectColumns(grid[0]));

  assert.equal(result.dateOrderAssumed, true);
  assert.equal(result.dateOrder, 'mdy');
});

test('does not claim an assumption when the file proved the order', () => {
  const grid = parseCsv('Date,Description,Amount\n03/14/2026,X,-1.00\n');
  const result = buildImportRows(grid, detectColumns(grid[0]));

  assert.equal(result.dateOrderAssumed, false);
  assert.equal(result.dateOrder, 'mdy');
});

test('an explicit order overrides detection', () => {
  const grid = parseCsv('Date,Description,Amount\n03/04/2026,X,-1.00\n');
  const result = buildImportRows(grid, detectColumns(grid[0]), { dateOrder: 'dmy' });

  assert.equal(result.rows[0].date, '2026-04-03');
  assert.equal(result.dateOrderAssumed, false);
});

test('a file with no usable columns fails clearly instead of importing nothing quietly', () => {
  const grid = parseCsv('Foo,Bar\n1,2\n');
  const result = buildImportRows(grid, detectColumns(grid[0]));

  assert.equal(result.rows.length, 0);
  assert.match(result.problems[0].reason, /date and description/);
});

test('a second import of the same file adds nothing', () => {
  const rows = [
    { line: 2, date: '2026-01-15', description: 'TRADER JOES', amountCents: -4520 },
    { line: 3, date: '2026-01-16', description: 'PAYROLL', amountCents: 250000 },
  ];
  const plan = planImport(rows, [
    { date: '2026-01-15', amountCents: -4520 },
    { date: '2026-01-16', amountCents: 250000 },
  ]);

  assert.equal(plan.toImport.length, 0);
  assert.equal(plan.duplicates.length, 2);
});

test('matches across a rewritten description', () => {
  // Plaid renames the charge; the same money should not land twice.
  const plan = planImport(
    [{ line: 2, date: '2026-01-15', description: 'SQ *BLUE BOT 0012', amountCents: -675 }],
    [{ date: '2026-01-15', amountCents: -675 }],
  );

  assert.equal(plan.toImport.length, 0);
});

test('two genuine repeats import when the account holds only one', () => {
  const plan = planImport(
    [
      { line: 2, date: '2026-01-15', description: 'COFFEE', amountCents: -500 },
      { line: 3, date: '2026-01-15', description: 'COFFEE', amountCents: -500 },
    ],
    [{ date: '2026-01-15', amountCents: -500 }],
  );

  assert.equal(plan.duplicates.length, 1);
  assert.equal(plan.toImport.length, 1);
});

test('same amount on a different day is not a duplicate', () => {
  const plan = planImport(
    [{ line: 2, date: '2026-01-16', description: 'COFFEE', amountCents: -500 }],
    [{ date: '2026-01-15', amountCents: -500 }],
  );

  assert.equal(plan.toImport.length, 1);
});

test('an opposite sign is not a duplicate', () => {
  // A $50 refund is not the $50 charge it reverses.
  const plan = planImport(
    [{ line: 2, date: '2026-01-15', description: 'REFUND', amountCents: 5000 }],
    [{ date: '2026-01-15', amountCents: -5000 }],
  );

  assert.equal(plan.toImport.length, 1);
});

test('everything imports into an empty account', () => {
  const plan = planImport(
    [{ line: 2, date: '2026-01-15', description: 'X', amountCents: -100 }],
    [],
  );

  assert.equal(plan.toImport.length, 1);
  assert.equal(plan.rows[0].duplicate, false);
});

test('the duplicate window spans exactly what the file covers', () => {
  assert.deepEqual(
    rowDateRange([
      { line: 2, date: '2026-03-04', description: 'B', amountCents: -1 },
      { line: 3, date: '2026-01-15', description: 'A', amountCents: -1 },
    ]),
    { start: '2026-01-15', end: '2026-03-04' },
  );
  assert.equal(rowDateRange([]), null);
});
