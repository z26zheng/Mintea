import type { MinteaClient } from './client';
import { unwrap } from './client';
import type { ProfileRow } from '../types/database';

/**
 * The signed-in user's profile, which carries the `household_id` every write
 * needs. Created automatically by the `on_auth_user_created` trigger, so it
 * always exists for an authenticated user.
 */
export async function fetchProfile(client: MinteaClient): Promise<ProfileRow> {
  const { data: auth } = await client.auth.getUser();

  if (!auth.user) {
    throw new Error('Not signed in');
  }

  return unwrap(
    await client.from('profiles').select('*').eq('id', auth.user.id).single(),
  );
}
