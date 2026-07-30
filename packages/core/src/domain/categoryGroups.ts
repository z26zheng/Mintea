/**
 * Category-group rules shared by the UI and enforced again in Postgres.
 *
 * The database is the authority — a trigger normalizes names and a unique
 * index rejects case-insensitive duplicates — but the screen needs the same
 * answers before it sends anything, so a user is told "that name is taken"
 * while typing rather than by a failed request.
 *
 * Free of relative runtime imports so it stays unit-testable under Node's type
 * stripping.
 */
import type { CategoryGroupRow } from '../types/database';

export const MAX_GROUP_NAME_LENGTH = 40;

export function normalizeGroupName(input: string): string | null {
  const collapsed = input.trim().replace(/\s+/g, ' ');
  return collapsed === '' ? null : collapsed;
}

export type GroupNameProblem = 'empty' | 'too-long' | 'duplicate';

export function validateGroupName(
  input: string,
  existing: Array<Pick<CategoryGroupRow, 'id' | 'name'>>,
  excludeId?: string,
): GroupNameProblem | null {
  const name = normalizeGroupName(input);
  if (!name) return 'empty';
  if (name.length > MAX_GROUP_NAME_LENGTH) return 'too-long';

  const clash = existing.some(
    (group) =>
      group.id !== excludeId &&
      group.name.toLowerCase() === name.toLowerCase(),
  );

  return clash ? 'duplicate' : null;
}

export function describeGroupNameProblem(
  problem: GroupNameProblem,
  input: string,
): string {
  if (problem === 'empty') return 'Enter a group name';
  if (problem === 'too-long') {
    return `Keep it under ${MAX_GROUP_NAME_LENGTH} characters`;
  }
  return `"${normalizeGroupName(input) ?? input}" already exists.`;
}

/**
 * Moves one item within an ordering.
 *
 * Returns the same array when the move would fall off either end, so a caller
 * can compare by identity and skip a pointless write.
 */
export function moveInOrder<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Where a group's categories can go when it is deleted.
 *
 * Excludes the group itself. Type is not filtered on: moving a category from a
 * spending group into an income one is a legitimate correction, and blocking it
 * would leave a mis-typed group impossible to clean up.
 */
export function destinationsFor(
  groups: CategoryGroupRow[],
  deletingId: string,
): CategoryGroupRow[] {
  return groups.filter((group) => group.id !== deletingId);
}
