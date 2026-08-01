import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSignInStatus,
  signInStatusCopy,
  signOutCurrentDevice,
} from '../apps/mintea/lib/authFlow.ts';

test('normalizes only supported sign-in status values', () => {
  assert.equal(normalizeSignInStatus('signed-out'), 'signed-out');
  assert.equal(normalizeSignInStatus(['switch-account']), 'switch-account');
  assert.equal(normalizeSignInStatus('unknown'), null);
  assert.equal(normalizeSignInStatus(undefined), null);
});

test('account switching gives the user a clear next step', () => {
  assert.deepEqual(signInStatusCopy('switch-account'), {
    googleLabel: 'Choose a Google account',
    notice: 'You’re signed out. Choose another account to continue.',
    subtitle: 'Use a different Google account or enter another email.',
  });
  assert.equal(signInStatusCopy(null), null);
});

test('sign out ends only the current device session', async () => {
  let receivedOptions;
  const client = {
    auth: {
      signOut: async (options) => {
        receivedOptions = options;
        return { error: null };
      },
    },
  };

  await signOutCurrentDevice(client);
  assert.deepEqual(receivedOptions, { scope: 'local' });
});

test('sign out surfaces provider errors', async () => {
  const client = {
    auth: {
      signOut: async () => ({ error: { message: 'Session could not end' } }),
    },
  };

  await assert.rejects(
    () => signOutCurrentDevice(client),
    /Session could not end/,
  );
});
