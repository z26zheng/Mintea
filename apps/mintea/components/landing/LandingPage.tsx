import { Redirect } from 'expo-router';

/**
 * The cinematic marketing experience is intentionally web-only. Native users
 * still enter through the focused authentication flow.
 */
export function LandingPage({
  isAuthenticated: _isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  return <Redirect href="/(auth)/sign-in" />;
}
