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

  const profile = unwrap(
    await client.from('profiles').select('*').eq('id', auth.user.id).single(),
  );

  // Household time is canonical. Keeping the profile column mirrored makes it
  // convenient to inspect, but this read prevents an out-of-band profile edit
  // from making the UI disagree with server-side Plaid syncs.
  const household = unwrap(
    await client
      .from('households')
      .select('timezone')
      .eq('id', profile.household_id)
      .single(),
  );

  return { ...profile, timezone: household.timezone };
}

/** Updates the household's reporting calendar and all member profiles. */
export async function setReportingTimezone(
  client: MinteaClient,
  timeZone: string,
): Promise<void> {
  const { error } = await client.rpc('set_reporting_timezone', {
    p_timezone: timeZone,
  });

  if (error) throw new Error(error.message);
}

/**
 * Gives a brand-new household the device's time zone.
 *
 * Email signup passes the zone as signup metadata, but an OAuth signup cannot
 * carry metadata, so the signup trigger falls back to UTC. Left alone, every
 * date in the app — balances, charts, report periods — would be keyed to a zone
 * the user never chose.
 *
 * Only applies to a household with no accounts. A household that has been used
 * may sit on UTC deliberately, and overwriting that would be its own bug.
 * Returns whether it changed anything.
 */
export async function adoptDeviceTimezoneForNewHousehold(
  client: MinteaClient,
  deviceTimeZone: string,
): Promise<boolean> {
  if (!deviceTimeZone || deviceTimeZone === 'UTC') return false;

  const profile = await fetchProfile(client);
  if (profile.timezone !== 'UTC') return false;

  const { count, error } = await client
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return false;

  await setReportingTimezone(client, deviceTimeZone);
  return true;
}
