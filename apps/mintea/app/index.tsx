import { Redirect } from 'expo-router';

import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Loading } from '../components/ui';
import { SetupScreen } from '../components/SetupScreen';

/**
 * Entry point. Split into two components so the auth hooks are never called
 * conditionally — when Supabase isn't configured there is no provider above us.
 */
export default function Index() {
  if (!isSupabaseConfigured) return <SetupScreen />;
  return <AuthGate />;
}

function AuthGate() {
  const { session, isLoading, isRecoveringPassword } = useAuth();

  if (isLoading) return <Loading />;

  // A recovery link produces a valid session, so this check has to come before
  // the session check or the user sails past the password form.
  if (isRecoveringPassword) return <Redirect href="/(auth)/reset-password" />;

  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />;
}
