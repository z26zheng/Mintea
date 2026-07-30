import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeGroupNameProblem,
  destinationsFor,
  moveInOrder,
  normalizeGroupName,
  validateGroupName,
  MAX_GROUP_NAME_LENGTH,
} from '../packages/core/src/domain/categoryGroups.ts';

const groups = [
  { id: 'a', name: 'Food & Dining' },
  { id: 'b', name: 'Travel' },
];

test('collapses whitespace the way the database trigger does', () => {
  assert.equal(normalizeGroupName('  Home   and  Utilities '), 'Home and Utilities');
  assert.equal(normalizeGroupName('Travel'), 'Travel');
});

test('a name of only whitespace is no name at all', () => {
  assert.equal(normalizeGroupName('   '), null);
  assert.equal(normalizeGroupName(''), null);
});

test('accepts a new, distinct name', () => {
  assert.equal(validateGroupName('Utilities', groups), null);
});

test('rejects a duplicate regardless of case or spacing', () => {
  // The database index is case-insensitive; the screen has to agree or the
  // user only finds out when the request fails.
  assert.equal(validateGroupName('travel', groups), 'duplicate');
  assert.equal(validateGroupName('  TRAVEL  ', groups), 'duplicate');
});

test('a group may keep its own name while being renamed', () => {
  assert.equal(validateGroupName('Travel', groups, 'b'), null);
  assert.equal(validateGroupName('TRAVEL', groups, 'b'), null);
});

test('still catches a clash with a different group while renaming', () => {
  assert.equal(validateGroupName('Food & Dining', groups, 'b'), 'duplicate');
});

test('rejects an empty or over-long name', () => {
  assert.equal(validateGroupName('   ', groups), 'empty');
  assert.equal(
    validateGroupName('x'.repeat(MAX_GROUP_NAME_LENGTH + 1), groups),
    'too-long',
  );
  assert.equal(
    validateGroupName('x'.repeat(MAX_GROUP_NAME_LENGTH), groups),
    null,
  );
});

test('explains a problem in the words the user typed', () => {
  assert.match(describeGroupNameProblem('duplicate', '  travel '), /"travel" already exists/);
  assert.match(describeGroupNameProblem('too-long', 'x'), /under 40/);
  assert.match(describeGroupNameProblem('empty', ''), /Enter a group name/);
});

test('moves an item down and up', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
});

test('a move that falls off either end returns the original array', () => {
  // Identity, so a caller can skip a write rather than sending an unchanged order.
  const items = ['a', 'b', 'c'];
  assert.equal(moveInOrder(items, 0, -1), items);
  assert.equal(moveInOrder(items, 2, 3), items);
  assert.equal(moveInOrder(items, 1, 1), items);
});

test('does not mutate the array it was given', () => {
  const items = ['a', 'b', 'c'];
  moveInOrder(items, 0, 2);
  assert.deepEqual(items, ['a', 'b', 'c']);
});

test('a group cannot be its own delete destination', () => {
  const all = [
    { id: 'a', name: 'Food', type: 'expense' },
    { id: 'b', name: 'Travel', type: 'expense' },
  ];
  assert.deepEqual(destinationsFor(all, 'a').map((g) => g.id), ['b']);
});

test('destinations are not filtered by type', () => {
  // Moving a category from a spending group into an income one is a valid
  // correction; blocking it would leave a mis-typed group impossible to clear.
  const all = [
    { id: 'a', name: 'Food', type: 'expense' },
    { id: 'b', name: 'Paychecks', type: 'income' },
  ];
  assert.deepEqual(destinationsFor(all, 'a').map((g) => g.id), ['b']);
});
