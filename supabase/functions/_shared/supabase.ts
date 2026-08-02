import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { requireEnv } from './plaid.ts';

/**
 * Service-role client. Bypasses RLS, so every function that uses it must check
 * ownership itself — see `requireCaller` below, and note that each query is
 * additionally constrained by `household_id`.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type Caller = {
  userId: string;
  householdId: string;
  admin: SupabaseClient;
};

/**
 * Verifies the JWT and returns who is calling, without requiring a household.
 *
 * Almost everything needs `requireCaller` instead. This exists for the one
 * operation that must still work when the household is already gone — account
 * deletion, which would otherwise strand a user whose household was removed but
 * whose Auth record survived, unable to either use the app or finish deleting.
 */
export async function requireUser(
  req: Request,
): Promise<{ userId: string; admin: SupabaseClient }> {
  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing authorization header');
  }

  const admin = serviceClient();
  const token = authorization.slice('Bearer '.length);

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(401, 'Invalid or expired session');
  }

  return { userId: data.user.id, admin };
}

/** The caller's household, or null when they have no profile row. */
export async function findHousehold(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('household_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) return null;

  return profile.household_id as string;
}

/**
 * Resolves the caller from their JWT and returns the household they belong to.
 *
 * Everything downstream is scoped to this `householdId`, which is what stops
 * one user from acting on another's Plaid Item even though the service-role
 * client could technically read every row.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const { userId, admin } = await requireUser(req);
  const householdId = await findHousehold(admin, userId);

  if (!householdId) {
    throw new HttpError(403, 'No household for this user');
  }

  return { userId, householdId, admin };
}

/** Loads an Item plus its access token, refusing anything outside the household. */
export async function loadItemForCaller(
  caller: Caller,
  itemId: string,
): Promise<{ id: string; plaidItemId: string; accessToken: string }> {
  const { data: item, error } = await caller.admin
    .from('plaid_items')
    .select('id, plaid_item_id, household_id')
    .eq('id', itemId)
    .single();

  if (error || !item) {
    throw new HttpError(404, 'Connection not found');
  }

  if (item.household_id !== caller.householdId) {
    // Deliberately the same message as "not found" — an attacker shouldn't be
    // able to probe which Item ids exist.
    throw new HttpError(404, 'Connection not found');
  }

  const { data: secret, error: secretError } = await caller.admin
    .from('plaid_item_secrets')
    .select('access_token')
    .eq('item_id', itemId)
    .single();

  if (secretError || !secret) {
    throw new HttpError(500, 'Connection is missing its access token');
  }

  return {
    id: item.id as string,
    plaidItemId: item.plaid_item_id as string,
    accessToken: secret.access_token as string,
  };
}
