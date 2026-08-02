import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAuthLink,
  readableAuthError,
} from '../packages/core/src/domain/authLink.ts';

const opts = { scheme: 'mintea' };
const parse = (url) => parseAuthLink(url, opts);

test('reads a PKCE code from the query string', () => {
  const link = parse('mintea:///?code=abc123');
  assert.deepEqual(link, { kind: 'code', code: 'abc123', isRecovery: false });
});

test('reads implicit-flow tokens from the fragment', () => {
  const link = parse(
    'mintea:///#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer',
  );
  assert.deepEqual(link, {
    kind: 'tokens',
    accessToken: 'at',
    refreshToken: 'rt',
    isRecovery: false,
  });
});

test('recognises a recovery link by its type parameter', () => {
  const link = parse('mintea:///?code=abc&type=recovery');
  assert.equal(link.kind, 'code');
  assert.equal(link.isRecovery, true);
});

test('recognises a recovery link by its path', () => {
  for (const url of [
    'mintea:///reset-password?code=abc',
    'mintea://reset-password?code=abc',
  ]) {
    const link = parse(url);
    assert.equal(link.kind, 'code', url);
    assert.equal(link.isRecovery, true, url);
  }
});

test('accepts the callback path the app registers', () => {
  const link = parse('mintea://auth/callback?code=abc');
  assert.equal(link.kind, 'code');
});

test('ignores a link belonging to another app', () => {
  // The whole point of checking: another app's link must not be able to hand
  // this one a session.
  assert.deepEqual(parse('evil:///?code=abc'), { kind: 'none' });
  assert.deepEqual(parse('https://mintea.app/?code=abc'), { kind: 'none' });
});

test('ignores an unexpected host on our own scheme', () => {
  assert.deepEqual(parse('mintea://attacker.example/?code=abc'), {
    kind: 'none',
  });
});

test('ignores links that carry no auth material', () => {
  assert.deepEqual(parse('mintea:///'), { kind: 'none' });
  assert.deepEqual(parse('mintea:///?utm_source=email'), { kind: 'none' });
  assert.deepEqual(parse(null), { kind: 'none' });
  assert.deepEqual(parse(''), { kind: 'none' });
  assert.deepEqual(parse('not a url'), { kind: 'none' });
});

test('an access token without a refresh token is not a session', () => {
  assert.deepEqual(parse('mintea:///#access_token=at'), { kind: 'none' });
});

test('surfaces an expired link as an error, not a session', () => {
  const link = parse(
    'mintea:///?error=access_denied&error_code=otp_expired' +
      '&error_description=Email+link+is+invalid+or+has+expired',
  );
  assert.equal(link.kind, 'error');
  assert.match(link.message, /expired or was already used/i);
});

test('surfaces a fragment-delivered error too', () => {
  const link = parse('mintea:///#error=server_error&error_description=Boom');
  assert.deepEqual(link, { kind: 'error', message: 'Boom' });
});

test('an error wins over any tokens in the same link', () => {
  const link = parse('mintea:///?error=access_denied&code=abc');
  assert.equal(link.kind, 'error');
});

test('unknown error codes still say something useful', () => {
  assert.equal(
    readableAuthError('weird_failure'),
    'Sign-in link failed (weird_failure).',
  );
  assert.match(readableAuthError('otp_expired'), /expired/i);
});
