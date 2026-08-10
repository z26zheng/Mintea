import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import {
  getDeviceTimeZone,
  parseAuthLink,
  type MinteaClient,
} from '@mintea/core';

import { supabase } from './supabase';
import { signOutCurrentDevice } from './authFlow';

// Lets iOS return from a provider-owned browser session into the running app.
WebBrowser.maybeCompleteAuthSession();

export type SignUpResult =
  /** Supabase returned a session — email confirmation is off, user is in. */
  | { status: 'signed-in' }
  /** No session yet; the user must click the link in their inbox. */
  | { status: 'confirmation-required' };

type AuthState = {
  client: MinteaClient;
  session: Session | null;
  /** True until the persisted session has been read from storage. */
  isLoading: boolean;
  /**
   * Set when the user arrived through a password-reset link. Supabase creates a
   * real session for recovery, so without this flag they'd land on the
   * dashboard and never be asked for a new password.
   */
  isRecoveringPassword: boolean;
  /**
   * Why the last email or OAuth link failed, if it did. Set from outside any
   * screen — the link can arrive while the app shows anything at all — so the
   * sign-in screen reads it rather than being handed it.
   */
  linkError: string | null;
  clearLinkError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Returns an absolute callback URL for the deployment that initiated auth.
 *
 * Expo's web implementation can omit the trailing slash for `/`. Supabase's
 * redirect allow-list treats a bare origin and `/**` as different patterns,
 * so preview OAuth would otherwise fall back to the production Site URL.
 */
function authRedirectUrl(path: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new URL(path, `${window.location.origin}/`).toString();
  }

  return Linking.createURL(path);
}

/**
 * The scheme this build answers to. Links using anything else are not ours and
 * are ignored — see `parseAuthLink`.
 */
const APP_SCHEME = Constants.expoConfig?.scheme;

export function AuthProvider({
  client,
  children,
}: {
  client: MinteaClient;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  /**
   * URLs already handled. A cold start delivers the launch URL through
   * `getInitialURL` *and*, on some Android versions, through the listener; a
   * PKCE code is single-use, so the second attempt would fail and clear a
   * session that had just been established.
   */
  const handledLinks = useRef(new Set<string>());

  const handleAuthLink = useCallback(
    async (url: string | null) => {
      if (!url || handledLinks.current.has(url)) return;

      const scheme = Array.isArray(APP_SCHEME) ? APP_SCHEME[0] : APP_SCHEME;
      if (!scheme) return;

      const link = parseAuthLink(url, { scheme });
      if (link.kind === 'none') return;

      handledLinks.current.add(url);

      if (link.kind === 'error') {
        setLinkError(link.message);
        setIsLoading(false);
        return;
      }

      // Mark recovery before the session lands. `onAuthStateChange` fires
      // synchronously enough that the router could otherwise send the user to
      // the dashboard between the exchange and this flag being set.
      if (link.isRecovery) setIsRecoveringPassword(true);

      const { error } =
        link.kind === 'code'
          ? await client.auth.exchangeCodeForSession(link.code)
          : await client.auth.setSession({
              access_token: link.accessToken,
              refresh_token: link.refreshToken,
            });

      if (error) {
        if (link.isRecovery) setIsRecoveringPassword(false);
        setLinkError(friendlyAuthError(error.message));
        setIsLoading(false);
        return;
      }

      setLinkError(null);
    },
    [client],
  );

  // Native only: on web Supabase reads the URL itself via detectSessionInUrl.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;

    // Cold start: the link that launched the app.
    Linking.getInitialURL().then((url) => {
      if (active) void handleAuthLink(url);
    });

    // Running app, foreground or background.
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthLink(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleAuthLink]);

  useEffect(() => {
    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange(
      (event, next) => {
        setSession(next);
        setIsLoading(false);

        if (event === 'PASSWORD_RECOVERY') setIsRecoveringPassword(true);
        if (event === 'SIGNED_OUT') setIsRecoveringPassword(false);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthState>(
    () => ({
      client,
      session,
      isLoading,
      isRecoveringPassword,
      linkError,
      clearLinkError: () => setLinkError(null),

      signIn: async (email, password) => {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw new Error(friendlyAuthError(error.message));
      },

      signUp: async (email, password) => {
        const { data, error } = await client.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl('/'),
            data: { timezone: getDeviceTimeZone() },
          },
        });

        if (error) throw new Error(friendlyAuthError(error.message));

        return data.session
          ? { status: 'signed-in' }
          : { status: 'confirmation-required' };
      },

      /** Hands off to Google and consumes the callback on every platform. */
      signInWithGoogle: async () => {
        const redirectTo = authRedirectUrl('/');
        const { data, error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            // Supabase redirects the browser on web. Native needs the URL so
            // its in-app auth session can return through `mintea://`.
            skipBrowserRedirect: Platform.OS !== 'web',
            // Ask Google to pick an account rather than silently reusing the
            // one already signed in, which strands anyone with two accounts.
            queryParams: { prompt: 'select_account' },
          },
        });

        if (error) throw new Error(friendlyAuthError(error.message));
        if (Platform.OS === 'web') return;
        if (!data.url) throw new Error('Could not start Google sign-in.');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          await handleAuthLink(result.url);
          return;
        }
        if (result.type === 'cancel' || result.type === 'dismiss') return;

        throw new Error('Google sign-in did not complete. Please try again.');
      },

      signOut: async () => {
        await signOutCurrentDevice(client);
      },

      requestPasswordReset: async (email) => {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          { redirectTo: authRedirectUrl('/reset-password') },
        );
        if (error) throw new Error(friendlyAuthError(error.message));
      },

      updatePassword: async (password) => {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw new Error(friendlyAuthError(error.message));
        setIsRecoveringPassword(false);
      },
    }),
    [client, session, isLoading, isRecoveringPassword, linkError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Supabase's messages are accurate but terse. These are the ones users actually
 * hit; anything else passes through unchanged rather than being swallowed.
 */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'That email and password combination is not right.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Check your inbox and confirm your email address first.';
  }
  if (lower.includes('user already registered')) {
    return 'That email already has an account. Try signing in instead.';
  }
  if (lower.includes('password should be at least')) {
    return 'Password is too short — use at least 8 characters.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return message;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }

  return context;
}

/**
 * The Supabase client, for screens that already know a session exists.
 * Everything below the auth gate can call this freely.
 */
export function useClient(): MinteaClient {
  return useAuth().client;
}

export const hasSupabaseClient = supabase !== null;
