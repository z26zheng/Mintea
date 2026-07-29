import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachTagUsage,
  describeTagNameProblem,
  DEFAULT_TAG_COLOR,
  MAX_TAG_NAME_LENGTH,
  normalizeTagName,
  sortTagsForDisplay,
  tagColor,
  tagNameKey,
  validateTagName,
} from '../packages/core/src/domain/tags.ts';

const tag = (id, name, color = DEFAULT_TAG_COLOR) => ({
  id,
  household_id: 'hh',
  name,
  color,
  created_at: '',
});

test('normalizes surrounding and repeated whitespace', () => {
  assert.equal(normalizeTagName('  Tax   Deductible  '), 'Tax Deductible');
  assert.equal(normalizeTagName('Travel'), 'Travel');
  assert.equal(normalizeTagName('a\t\tb'), 'a b');
});

test('treats a blank name as absent', () => {
  assert.equal(normalizeTagName(''), null);
  assert.equal(normalizeTagName('    '), null);
  assert.equal(normalizeTagName('\n\t'), null);
});

test('compares names case-insensitively, matching the unique index', () => {
  assert.equal(tagNameKey('Tax Deductible'), tagNameKey('  tax   DEDUCTIBLE '));
});

test('rejects a blank name', () => {
  assert.deepEqual(validateTagName('   ', []), { kind: 'blank' });
});

test('rejects a name past the length limit but accepts one at it', () => {
  assert.equal(validateTagName('x'.repeat(MAX_TAG_NAME_LENGTH), []), null);

  assert.deepEqual(validateTagName('x'.repeat(MAX_TAG_NAME_LENGTH + 1), []), {
    kind: 'too-long',
    max: MAX_TAG_NAME_LENGTH,
  });
});

test('rejects a case-insensitive duplicate and names the clash', () => {
  const existing = [tag('1', 'Travel')];
  const problem = validateTagName('  travel ', existing);

  assert.equal(problem.kind, 'duplicate');
  assert.equal(problem.existing.name, 'Travel');
  assert.match(describeTagNameProblem(problem), /"Travel" already exists/);
});

test('renaming a tag to its own name is not a duplicate', () => {
  const existing = [tag('1', 'Travel'), tag('2', 'Meals')];

  assert.equal(validateTagName('Travel', existing, '1'), null);
  // But it may not take another tag's name.
  assert.equal(validateTagName('Meals', existing, '1').kind, 'duplicate');
});

test('every validation problem has a message', () => {
  assert.match(describeTagNameProblem({ kind: 'blank' }), /Enter a tag name/);
  assert.match(
    describeTagNameProblem({ kind: 'too-long', max: 40 }),
    /40 characters/,
  );
});

test('falls back to the default colour for unknown stored values', () => {
  assert.equal(tagColor(tag('1', 'a', '#1FA678')), '#1FA678');
  assert.equal(tagColor(tag('1', 'a', 'chartreuse')), DEFAULT_TAG_COLOR);
  assert.equal(tagColor(tag('1', 'a', '')), DEFAULT_TAG_COLOR);
});

test('attaches usage counts and defaults unused tags to zero', () => {
  const tags = [tag('1', 'Travel'), tag('2', 'Meals')];
  const counts = [{ tag_id: '1', transaction_count: 7 }];

  assert.deepEqual(
    attachTagUsage(tags, counts).map((t) => [t.id, t.transactionCount]),
    [
      ['1', 7],
      ['2', 0],
    ],
  );
});

test('sorts by usage, then alphabetically regardless of case', () => {
  const sorted = sortTagsForDisplay([
    { ...tag('1', 'zebra'), transactionCount: 2 },
    { ...tag('2', 'Apple'), transactionCount: 2 },
    { ...tag('3', 'Busy'), transactionCount: 9 },
    { ...tag('4', 'unused'), transactionCount: 0 },
  ]);

  assert.deepEqual(sorted.map((t) => t.name), [
    'Busy',
    'Apple',
    'zebra',
    'unused',
  ]);
});
