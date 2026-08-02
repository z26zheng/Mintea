import type { MinteaClient } from '@mintea/core';

export type SignInStatus = 'signed-out' | 'switch-account';

export type SignInStatusCopy = {
  googleLabel: string;
  notice: string;
  subtitle: string;
};

export function normalizeSignInStatus(
  value: string | string[] | undefined,
): SignInStatus | null {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === 'signed-out' || status === 'switch-account') return status;
  return null;
}

export function signInStatusCopy(
  status: SignInStatus | null,
): SignInStatusCopy | null {
  if (status === 'switch-account') {
    return {
      googleLabel: 'Choose a Google account',
      notice: 'You’re signed out. Choose another account to continue.',
      subtitle: 'Use a different Google account or enter another email.',
    };
  }

  if (status === 'signed-out') {
    return {
      googleLabel: 'Continue with Google',
      notice: 'You’re signed out of Mintea on this device.',
      subtitle: 'Sign in whenever you’re ready.',
    };
  }

  return null;
}

/**
 * Ends only this device's session. Account switching should not revoke active
 * sessions on the user's phone, tablet, or another browser.
 */
export async function signOutCurrentDevice(client: MinteaClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw new Error(error.message);
}
