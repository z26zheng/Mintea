import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_SECURE_CHUNK_BYTES,
  chunkKey,
  joinChunks,
  parseChunkCount,
  splitIntoChunks,
  utf8ByteLength,
} from '../packages/core/src/domain/secureChunks.ts';

test('short values stay in a single chunk', () => {
  assert.deepEqual(splitIntoChunks('hello'), ['hello']);
});

test('an empty value is one empty chunk, not zero chunks', () => {
  // Zero chunks would read back the same as "nothing was ever stored".
  assert.deepEqual(splitIntoChunks(''), ['']);
});

test('a long value round-trips through split and join', () => {
  const session = 'x'.repeat(9000);
  const chunks = splitIntoChunks(session);

  assert.ok(chunks.length > 5);
  assert.equal(joinChunks(chunks), session);
});

test('no chunk exceeds the byte budget', () => {
  const value = 'a'.repeat(5000);
  for (const chunk of splitIntoChunks(value)) {
    assert.ok(utf8ByteLength(chunk) <= MAX_SECURE_CHUNK_BYTES);
  }
});

test('multi-byte characters are measured in bytes, not characters', () => {
  // Each emoji is four UTF-8 bytes, so a limit of 8 bytes holds two of them.
  const chunks = splitIntoChunks('🍵🍵🍵🍵🍵', 8);

  assert.deepEqual(chunks, ['🍵🍵', '🍵🍵', '🍵']);
  for (const chunk of chunks) assert.ok(utf8ByteLength(chunk) <= 8);
});

test('a code point is never split across two chunks', () => {
  const value = '🍵'.repeat(400) + 'tail';
  const chunks = splitIntoChunks(value);

  for (const chunk of chunks) {
    // A halved surrogate pair shows up as U+FFFD after a round trip.
    assert.equal(
      new TextDecoder().decode(new TextEncoder().encode(chunk)),
      chunk,
    );
  }
  assert.equal(joinChunks(chunks), value);
});

test('a missing chunk reads as nothing rather than as truncated data', () => {
  // Half a session token is worse than no session token.
  assert.equal(joinChunks(['abc', null, 'ghi']), null);
  assert.equal(joinChunks([]), null);
});

test('chunk keys are stable and distinct', () => {
  assert.equal(chunkKey('sb-auth-token', 0), 'sb-auth-token.chunk.0');
  assert.notEqual(chunkKey('k', 1), chunkKey('k', 2));
});

test('only a positive integer counts as a chunk count', () => {
  assert.equal(parseChunkCount('3'), 3);
  assert.equal(parseChunkCount(null), null);
  assert.equal(parseChunkCount('0'), null);
  assert.equal(parseChunkCount('-1'), null);
  assert.equal(parseChunkCount('1.5'), null);
  // A leftover session from before chunking would parse as garbage here.
  assert.equal(parseChunkCount('{"access_token":"x"}'), null);
});
