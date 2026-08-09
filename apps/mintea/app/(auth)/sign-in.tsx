import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../../lib/auth';
import { normalizeSignInStatus, signInStatusCopy } from '../../lib/authFlow';
import { MinteaLockup } from '../../components/BrandMark';
import { Button, Field, Screen, Title } from '../../components/ui';

type Mode = 'sign-in' | 'sign-up';

const MIN_PASSWORD_LENGTH = 8;

export default function SignIn() {
  const { session, signIn, signUp, signInWithGoogle, linkError, clearLinkError } =
    useAuth();
  const router = useRouter();
  const { mode: requestedMode, status: requestedStatus, invite: requestedInvite } =
    useLocalSearchParams<{
      mode?: string | string[];
      status?: string | string[];
      invite?: string | string[];
    }>();
  const inviteToken = Array.isArray(requestedInvite)
    ? requestedInvite[0] ?? ""
    : requestedInvite ?? "";
  const startsInSignUpMode = Array.isArray(requestedMode)
    ? requestedMode[0] === 'sign-up'
    : requestedMode === 'sign-up';
  const status = normalizeSignInStatus(requestedStatus);
  const statusCopy = signInStatusCopy(status);

  const [mode, setMode] = useState<Mode>(
    startsInSignUpMode ? 'sign-up' : 'sign-in',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(statusCopy?.notice ?? null);
  const [busy, setBusy] = useState(false);

  if (session) {
    return inviteToken ? (
      <Redirect
        href={{ pathname: "/family/accept", params: { token: inviteToken } }}
      />
    ) : (
      <Redirect href="/(tabs)/dashboard" />
    );
  }

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setError(null);
    setNotice(null);
    clearLinkError();

    if (!looksLikeEmail) {
      setError('Enter a valid email address.');
      return;
    }

    if (password.length === 0) {
      setError('Enter your password.');
      return;
    }

    if (mode === 'sign-up' && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);

    try {
      if (mode === 'sign-in') {
        await signIn(email, password);
        // The auth listener flips `session`, and the redirect above takes over.
      } else {
        const result = await signUp(email, password);

        if (result.status === 'confirmation-required') {
          setNotice(
            `We sent a confirmation link to ${email.trim()}. Click it, then sign in.`,
          );
          setMode('sign-in');
          setPassword('');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
    setError(null);
    setNotice(null);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Capped so the form doesn't stretch across a desktop window. */}
          <View className="w-full max-w-sm self-center">
            <View className="mb-10">
              <MinteaLockup subtitle="A calmer view of your money" />
            </View>

            <View className="mb-7">
              <Title>
                {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
              </Title>
              <Text className="text-base text-ink-500 dark:text-ink-400 mt-1.5">
                {mode === 'sign-in'
                  ? (statusCopy?.subtitle ??
                    'Sign in to see where your money went.')
                  : 'Track every account in one place.'}
              </Text>
            </View>

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
              className="mb-4"
            />

            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={
                mode === 'sign-in' ? 'current-password' : 'new-password'
              }
              textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
              placeholder="••••••••"
              onSubmitEditing={submit}
              returnKeyType="go"
              error={error ?? undefined}
            />

            {mode === 'sign-up' ? (
              <Text className="text-xs text-ink-400 dark:text-ink-500 mt-1.5">
                At least {MIN_PASSWORD_LENGTH} characters.
              </Text>
            ) : null}

            {/* A dead confirmation or reset link fails outside any form, so
                say so here rather than leaving the user staring at a sign-in
                screen wondering whether the tap registered. */}
            {linkError ? (
              <View className="mt-4 p-3 rounded-xl border border-negative/40 bg-negative/10">
                <Text className="text-sm text-negative">{linkError}</Text>
              </View>
            ) : null}

            {notice ? (
              <View className="mt-4 p-3 rounded-xl bg-mint-50 dark:bg-mint-950 border border-mint-200 dark:border-mint-800">
                <Text className="text-sm text-mint-800 dark:text-mint-200">
                  {notice}
                </Text>
              </View>
            ) : null}

            <Button
              label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={busy}
              className="mt-6"
            />

            {/* Native needs an in-app browser session and a deep link back,
                which is a dependency and a rebuild away; hidden rather than
                offered and broken. */}
            {Platform.OS === 'web' ? (
              <>
                <View className="my-5 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
                  <Text className="text-xs text-ink-400 dark:text-ink-500">or</Text>
                  <View className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
                </View>

                <Button
                  label={statusCopy?.googleLabel ?? 'Continue with Google'}
                  variant="secondary"
                  loading={busy}
                  onPress={async () => {
                    setError(null);
                    setNotice(null);
                    setBusy(true);
                    try {
                      // Resolves by navigating away, so `busy` is only ever
                      // cleared on failure.
                      await signInWithGoogle();
                    } catch (caught) {
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : 'Could not reach Google',
                      );
                      setBusy(false);
                    }
                  }}
                />
              </>
            ) : null}

            {mode === 'sign-in' ? (
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                accessibilityRole="link"
                className="mt-4 self-center py-1"
              >
                <Text className="text-sm text-ink-500 dark:text-ink-400">
                  Forgot your password?
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={switchMode}
              className="mt-5 self-center py-1"
              accessibilityRole="button"
            >
              <Text className="text-sm text-ink-500 dark:text-ink-400">
                {mode === 'sign-in'
                  ? "Don't have an account? "
                  : 'Already have an account? '}
                <Text className="font-semibold text-mint-600 dark:text-mint-400">
                  {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
