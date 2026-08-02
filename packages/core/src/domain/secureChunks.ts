/**
 * Splitting a stored value into chunks small enough for a device keystore.
 *
 * Android backs `expo-secure-store` with encrypted SharedPreferences, which
 * refuses values larger than 2048 bytes. A Supabase session — access token,
 * refresh token, user record and its metadata — routinely goes past that, so
 * the session has to be written as several keystore entries and reassembled on
 * read.
 *
 * The size limit is counted in *bytes*, not characters, and a display name
 * with an emoji in it is four bytes. Splitting on character count would work
 * until someone's profile pushed a chunk over the limit, so this measures
 * UTF-8 and never splits a code point in half.
 */

/**
 * Well under Android's 2048-byte ceiling. The margin covers the key name and
 * whatever framing the platform adds around the value.
 */
export const MAX_SECURE_CHUNK_BYTES = 1536;

/** Where the chunk count for `key` lives. */
export function chunkCountKey(key: string): string {
  return key;
}

/** Where chunk `index` of `key` lives. */
export function chunkKey(key: string, index: number): string {
  return `${key}.chunk.${index}`;
}

/**
 * UTF-8 length in bytes, computed from code points rather than via
 * `TextEncoder` — Hermes does not ship one, and this package must run
 * unchanged on every platform.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }

  return bytes;
}

/**
 * Splits `value` into pieces no larger than `maxBytes` when UTF-8 encoded.
 *
 * An empty string yields a single empty chunk: zero chunks would be
 * indistinguishable from "nothing stored" on read.
 */
export function splitIntoChunks(
  value: string,
  maxBytes: number = MAX_SECURE_CHUNK_BYTES,
): string[] {
  if (maxBytes < 4) {
    throw new Error('maxBytes must leave room for one UTF-8 code point');
  }
  if (value === '') return [''];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  // Iterating the string directly walks code points, so a surrogate pair is
  // one step and can never straddle a chunk boundary.
  for (const codePoint of value) {
    const size = utf8ByteLength(codePoint);

    if (currentBytes + size > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }

    current += codePoint;
    currentBytes += size;
  }

  chunks.push(current);
  return chunks;
}

/**
 * Reassembles chunks, or returns null when any of them is missing.
 *
 * A partial write — the app killed between two keystore calls — must read back
 * as "no session" rather than as a truncated one. Losing the session costs a
 * sign-in; handing Supabase a corrupt token costs a confusing failure on every
 * subsequent request.
 */
export function joinChunks(chunks: (string | null)[]): string | null {
  if (chunks.length === 0) return null;
  if (chunks.some((chunk) => chunk === null)) return null;
  return chunks.join('');
}

/** Parses the stored chunk count, rejecting anything that isn't a count. */
export function parseChunkCount(raw: string | null): number | null {
  if (raw === null) return null;

  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) return null;

  return count;
}
