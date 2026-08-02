import 'react-native-url-polyfill/auto';

import { Platform } from 'react-native';
import { createMinteaClient, type MinteaClient } from '@mintea/core';

import { sessionStorage } from './sessionStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Built lazily rather than at import time so a missing `.env.local` shows the
 * setup screen instead of a white screen and a stack trace.
 *
 * Native sessions live in the device keystore (see `sessionStorage`); web keeps
 * localStorage, which is what AsyncStorage compiles down to there.
 */
export const supabase: MinteaClient | null = isSupabaseConfigured
  ? createMinteaClient({
      url,
      anonKey,
      storage: sessionStorage,
      // Only the web build receives the session in a URL fragment. Native gets
      // it through the `mintea://` deep link, which `AuthProvider` consumes.
      detectSessionInUrl: Platform.OS === 'web',
    })
  : null;

export function requireSupabase(): MinteaClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy apps/mintea/.env.example to .env.local.',
    );
  }

  return supabase;
}
