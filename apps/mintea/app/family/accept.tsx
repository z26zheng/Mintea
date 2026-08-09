import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptFamilyInvitation } from '@mintea/core';

import { useAuth, useClient } from '../../lib/auth';
import {
  Button,
  Card,
  ErrorNotice,
  Field,
  IconBadge,
  Loading,
  ModalHeader,
  Screen,
} from '../../components/ui';

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function tokenFromInput(value: string): string {
  try {
    return new URL(value).searchParams.get('token') ?? value;
  } catch {
    return value;
  }
}

function AcceptFamilyInvitation() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, isLoading } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const [token, setToken] = useState(firstParam(params.token));
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () => acceptFamilyInvitation(client, tokenFromInput(token.trim())),
    onSuccess: async () => {
      // The profile's household changed. Do not let cached rows from the
      // bootstrap household flash after the redirect.
      queryClient.clear();
      router.replace('/(tabs)/dashboard');
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not accept the invitation'),
  });

  if (isLoading) return <Loading />;

  if (!session) {
    return (
      <Redirect
        href={{
          pathname: '/(auth)/sign-in',
          params: { invite: token },
        }}
      />
    );
  }

  return (
    <Screen>
      <ModalHeader
        title="Leave and join a family"
        onClose={() => router.replace('/(tabs)/dashboard')}
      />
      <ScrollView contentContainerClassName="flex-grow justify-center p-6">
        <View className="w-full max-w-lg self-center">
          <Card className="p-5">
            <IconBadge name="people-outline" size={48} />
            <Text className="mt-5 text-2xl font-bold text-ink-900 dark:text-ink-50">
              Review your invitation
            </Text>
            <Text className="mt-2 text-sm leading-5 text-ink-500 dark:text-ink-400">
              You are signed in as {session.user.email}. Joining will leave your
              current family and move this account into the inviting family. This
              is one confirmation, not a separate removal step.
            </Text>

            <View className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <Text className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Your current family must be empty
              </Text>
              <Text className="mt-1 text-sm leading-5 text-amber-800 dark:text-amber-200">
                No financial data will move in this beta flow. If your current
                family has accounts, use the migration preview instead.
              </Text>
            </View>

            <Field
              label="Invitation token"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste the invitation token or full link"
              className="mt-5"
            />

            {error ? <ErrorNotice message={error} /> : null}

            <Button
              label={accept.isPending ? 'Joining…' : 'Leave current family and join'}
              onPress={() => {
                setError(null);
                accept.mutate();
              }}
              loading={accept.isPending}
              disabled={!token.trim() || accept.isPending}
              className="mt-5"
            />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function AcceptFamilyInvitationRoute() {
  return <AcceptFamilyInvitation />;
}
