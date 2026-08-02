import { Redirect } from 'expo-router';

/**
 * Anything unroutable goes back to the entry point, which re-runs the auth gate
 * and lands the user on the dashboard or the sign-in screen.
 *
 * This exists because of deep links, not typos. Any app can send
 * `mintea://whatever` and the OS will hand it to us; `AuthProvider` correctly
 * refuses to read auth material from a URL it did not ask Supabase to send to,
 * but the router still navigates there, and a dead "Page could not be found"
 * screen with no way back is a poor place to leave someone. Failing safe should
 * not mean failing stuck.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
