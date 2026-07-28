import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export type MinteaClient = SupabaseClient<Database>;

/**
 * The one piece of the data layer that differs per platform: where the auth
 * session is persisted. Web passes `localStorage`, native passes AsyncStorage
 * (or SecureStore). Keeping it an injected interface is what lets this package
 * stay free of any react-native or DOM import.
 */
export type SessionStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
};

export type CreateMinteaClientOptions = {
  url: string;
  anonKey: string;
  storage: SessionStorage;
  /**
   * Only web should enable this — it reads the OAuth/magic-link fragment out of
   * `window.location`. On native the session arrives through a deep link
   * instead, which the app handles explicitly.
   */
  detectSessionInUrl?: boolean;
};

export function createMinteaClient({
  url,
  anonKey,
  storage,
  detectSessionInUrl = false,
}: CreateMinteaClientOptions): MinteaClient {
  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mintea/.env.local — see .env.example.',
    );
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl,
      flowType: 'pkce',
    },
  });
}

/**
 * Supabase returns `{ data, error }` everywhere. This collapses that into the
 * throw-based contract TanStack Query expects, so every hook doesn't repeat it.
 */
/**
 * Calls an Edge Function and surfaces its own error message.
 *
 * Without this, every failure reads "Edge Function returned a non-2xx status
 * code" — the actual reason is in the response body, which `FunctionsHttpError`
 * carries on `context`.
 */
export async function invokeFunction<T>(
  client: MinteaClient,
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(name, {
    body: body ?? {},
  });

  if (error) {
    // Typed structurally rather than as `Response` so this package needs no
    // DOM lib — it also runs under Hermes.
    const context = (error as { context?: { json?: () => Promise<unknown> } })
      .context;

    if (context && typeof context.json === 'function') {
      try {
        const payload = (await context.json()) as { error?: string };
        if (payload?.error) throw new Error(payload.error);
      } catch (parsed) {
        // Re-throw the function's own message; only fall through when the body
        // genuinely wasn't parseable JSON.
        if (parsed instanceof Error && parsed.message) throw parsed;
      }
    }

    throw new Error(error.message);
  }

  if (data === null) throw new Error(`${name} returned no data`);

  return data;
}

export function unwrap<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
}): NonNullable<T> {
  if (result.error) {
    const error = new Error(result.error.message) as Error & { code?: string };
    if (result.error.code) error.code = result.error.code;
    throw error;
  }

  if (result.data === null || result.data === undefined) {
    throw new Error('Query returned no data');
  }

  return result.data;
}
