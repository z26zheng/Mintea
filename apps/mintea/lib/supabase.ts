import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createMinteaClient, type MinteaClient } from '@mintea/core';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Built lazily rather than at import time so a missing `.env.local` shows the
 * setup screen instead of a white screen and a stack trace.
 *
 * AsyncStorage backs the session on every platform — its web implementation is
 * localStorage. Moving native tokens into SecureStore is part of the Phase 6
 * hardening pass, alongside the biometric lock.
 */
export const supabase: MinteaClient | null = isSupabaseConfigured
  ? createMinteaClient({
      url,
      anonKey,
      storage: AsyncStorage,
      // Only the web build receives the session in a URL fragment; native gets
      // it through the `mintea://` deep link.
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
