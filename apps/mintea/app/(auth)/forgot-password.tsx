import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useDismiss } from '../../lib/useDismiss';

import { useAuth } from '../../lib/auth';
import { Button, Field, Screen, Title } from '../../components/ui';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const router = useRouter();
  const dismiss = useDismiss('/(auth)/sign-in');

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);

    try {
      await requestPasswordReset(email);
      setSent(true);
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
          {sent ? (
            <>
              <Text className="text-5xl mb-3">📬</Text>
              <Title>Check your email</Title>
              <Text className="text-base text-ink-500 dark:text-ink-400 mt-2">
                If an account exists for {email.trim()}, a reset link is on its
                way. The link opens Mintea and lets you set a new password.
              </Text>

              <Button
                label="Back to sign in"
                variant="secondary"
                onPress={() => router.replace('/(auth)/sign-in')}
                className="mt-8"
              />
            </>
          ) : (
            <>
              <Text className="text-5xl mb-3">🔑</Text>
              <Title>Reset your password</Title>
              <Text className="text-base text-ink-500 dark:text-ink-400 mt-1.5 mb-6">
                We'll email you a link to set a new one.
              </Text>

              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                onSubmitEditing={submit}
                returnKeyType="go"
                error={error ?? undefined}
              />

              <Button
                label="Send reset link"
                onPress={submit}
                loading={busy}
                className="mt-6"
              />

              <Pressable
                onPress={() => dismiss()}
                accessibilityRole="button"
                className="mt-5 self-center py-1"
              >
                <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                  Back to sign in
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
