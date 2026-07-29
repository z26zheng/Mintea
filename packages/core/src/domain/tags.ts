import type { TagRow } from '../types/database';

/**
 * Tag naming rules.
 *
 * These mirror `normalize_tag_name` and the `tags_normalize_name` trigger in
 * SQL. The database is the authority — this exists so the UI can disable a
 * button and explain why, instead of round-tripping to collect an error.
 *
 * No relative runtime imports: this module is unit tested, and the test runner
 * strips types but cannot resolve extensionless runtime paths.
 */

export const MAX_TAG_NAME_LENGTH = 40;

/** Trims and collapses internal whitespace. Returns null for a blank name. */
export function normalizeTagName(input: string): string | null {
  const collapsed = input.trim().replace(/\s+/g, ' ');
  return collapsed === '' ? null : collapsed;
}

/** Tags are compared case-insensitively, matching the unique index. */
export const tagNameKey = (input: string): string =>
  (normalizeTagName(input) ?? '').toLowerCase();

export type TagNameProblem =
  | { kind: 'blank' }
  | { kind: 'too-long'; max: number }
  | { kind: 'duplicate'; existing: TagRow };

/**
 * Validates a proposed name against the household's existing tags.
 *
 * `excludeId` skips the tag being renamed, so saving a tag without changing
 * its name isn't reported as a duplicate of itself.
 */
export function validateTagName(
  input: string,
  existing: TagRow[],
  excludeId?: string,
): TagNameProblem | null {
  const normalized = normalizeTagName(input);

  if (normalized === null) return { kind: 'blank' };

  if (normalized.length > MAX_TAG_NAME_LENGTH) {
    return { kind: 'too-long', max: MAX_TAG_NAME_LENGTH };
  }

  const key = normalized.toLowerCase();
  const clash = existing.find(
    (tag) => tag.id !== excludeId && tag.name.toLowerCase() === key,
  );

  return clash ? { kind: 'duplicate', existing: clash } : null;
}

/** Human-readable form of a validation problem, for inline field errors. */
export function describeTagNameProblem(problem: TagNameProblem): string {
  switch (problem.kind) {
    case 'blank':
      return 'Enter a tag name.';
    case 'too-long':
      return `Keep it to ${problem.max} characters or fewer.`;
    case 'duplicate':
      return `"${problem.existing.name}" already exists.`;
  }
}

/**
 * Preset colours. The `color` column has existed since the initial schema but
 * was never reachable; a fixed palette keeps tag lists scannable without
 * shipping a full colour picker.
 */
export const TAG_COLORS = [
  '#74808E', // slate (the column default)
  '#1FA678', // mint
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#DC2626', // red
  '#EA580C', // orange
  '#CA8A04', // amber
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export const DEFAULT_TAG_COLOR: TagColor = '#74808E';

/** Falls back to the default rather than rendering an arbitrary stored value. */
export const tagColor = (tag: Pick<TagRow, 'color'>): string =>
  (TAG_COLORS as readonly string[]).includes(tag.color)
    ? tag.color
    : DEFAULT_TAG_COLOR;

export type TagWithUsage = TagRow & { transactionCount: number };

/** Joins tags to their usage counts, defaulting to zero for unused tags. */
export function attachTagUsage(
  tags: TagRow[],
  counts: Array<{ tag_id: string; transaction_count: number }>,
): TagWithUsage[] {
  const byId = new Map(counts.map((row) => [row.tag_id, row.transaction_count]));

  return tags.map((tag) => ({
    ...tag,
    transactionCount: byId.get(tag.id) ?? 0,
  }));
}

/**
 * Sorts for display: most-used first, then alphabetically. A household's
 * working tags stay at the top without needing a manual order column.
 */
export function sortTagsForDisplay(tags: TagWithUsage[]): TagWithUsage[] {
  return [...tags].sort(
    (a, b) =>
      b.transactionCount - a.transactionCount ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}
