import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '../../lib/auth';
import { Button, Field, Screen, Title } from '../../components/ui';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Where the emailed reset link lands.
 *
 * Supabase establishes a real session from the recovery token, so the guard
 * here is `isRecoveringPassword` rather than the absence of a session —
 * otherwise the user would be bounced straight to the dashboard with their old
 * password still in place.
 */
export default function ResetPassword() {
  const { session, isRecoveringPassword, updatePassword } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reached without a recovery link (or the link expired).
  if (!session && !isRecoveringPassword) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const submit = async () => {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      await updatePassword(password);
      router.replace('/(tabs)/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-sm self-center">
          <Text className="text-5xl mb-3">🔒</Text>
          <Title>Choose a new password</Title>
          <Text className="text-base text-ink-500 dark:text-ink-400 mt-1.5 mb-6">
            You'll be signed in once it's saved.
          </Text>

          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            className="mb-4"
          />

          <Field
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            onSubmitEditing={submit}
            returnKeyType="go"
            error={error ?? undefined}
          />

          <Text className="text-xs text-ink-400 dark:text-ink-500 mt-1.5">
            At least {MIN_PASSWORD_LENGTH} characters.
          </Text>

          <Button
            label="Save password"
            onPress={submit}
            loading={busy}
            className="mt-6"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
