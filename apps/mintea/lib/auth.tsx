import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import type { MinteaClient } from '@mintea/core';

import { supabase } from './supabase';

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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

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
          options: { emailRedirectTo: Linking.createURL('/') },
        });

        if (error) throw new Error(friendlyAuthError(error.message));

        return data.session
          ? { status: 'signed-in' }
          : { status: 'confirmation-required' };
      },

      signOut: async () => {
        const { error } = await client.auth.signOut();
        if (error) throw new Error(error.message);
      },

      requestPasswordReset: async (email) => {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          { redirectTo: Linking.createURL('/reset-password') },
        );
        if (error) throw new Error(friendlyAuthError(error.message));
      },

      updatePassword: async (password) => {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw new Error(friendlyAuthError(error.message));
        setIsRecoveringPassword(false);
      },
    }),
    [client, session, isLoading, isRecoveringPassword],
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
