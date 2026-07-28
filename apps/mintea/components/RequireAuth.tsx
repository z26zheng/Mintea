import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

import { useAuth } from '../lib/auth';
import { Loading } from './ui';

/**
 * Guard for routes outside the `(tabs)` group.
 *
 * Only `(tabs)/_layout` checked for a session, so the modal routes —
 * `account/*`, `transaction/*`, `categories` — rendered for signed-out users
 * when opened directly by URL. They then fired authenticated requests and
 * showed raw "Invalid or expired session" errors instead of a sign-in screen.
 *
 * This is a wrapper rather than a hook on purpose: the guarded screen must not
 * be rendered at all while signed out, so none of its hooks run. An early
 * `return` inside the screen would call hooks conditionally.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();

  if (isLoading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return <>{children}</>;
}
