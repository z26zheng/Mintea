import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  createFamilyInvitation,
  familyWorkspaceQuery,
  renameFamily,
  revokeFamilyInvitation,
  updateFamilyMemberRole,
} from '@mintea/core';

import { useAuth, useClient } from '../../lib/auth';
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorNotice,
  Field,
  IconBadge,
  Loading,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';
import { useDismiss } from '../../lib/useDismiss';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function inviteUrl(token: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new URL(
      `/family/accept?token=${encodeURIComponent(token)}`,
      window.location.origin,
    ).toString();
  }

  return Linking.createURL('/family/accept', {
    queryParams: { token },
  });
}

function inviteMailto(email: string, link: string): string {
  const subject = encodeURIComponent('Join my Mintea family');
  const body = encodeURIComponent(
    `I invited you to share selected financial accounts in Mintea. Open this secure link to review and join:\n\n${link}\n\nThis invitation expires in 7 days and can only be used by ${email}.`,
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

function FamilySettings() {
  const client = useClient();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const dismiss = useDismiss('/(tabs)/settings');
  const family = useQuery(familyWorkspaceQuery(client));

  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<{
    email: string;
    link: string;
    expiresAt: string;
  } | null>(null);

  useEffect(() => {
    if (family.data && familyName === '') setFamilyName(family.data.household.name);
  }, [family.data, familyName]);

  const currentMember = family.data?.members.find(
    (member) => member.user_id === session?.user.id,
  );
  const isOwner = currentMember?.role === 'owner';
  const activeInviteEmail = email.trim().toLowerCase();

  const invalidateFamily = async () => {
    await queryClient.invalidateQueries({ queryKey: ['family'] });
  };

  const rename = useMutation({
    mutationFn: () => renameFamily(client, familyName.trim()),
    onSuccess: async () => {
      setNotice('Family name saved.');
      await invalidateFamily();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not rename the family'),
  });

  const invite = useMutation({
    mutationFn: () => createFamilyInvitation(client, activeInviteEmail),
    onSuccess: async (result) => {
      const link = inviteUrl(result.token);
      setGeneratedInvite({
        email: result.email,
        link,
        expiresAt: result.expires_at,
      });
      setEmail('');
      setNotice('Invitation created. Send the secure link to the invited email address.');
      await invalidateFamily();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not create the invitation'),
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      revokeFamilyInvitation(client, invitationId),
    onSuccess: async () => {
      setNotice('Invitation revoked.');
      await invalidateFamily();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not revoke the invitation'),
  });

  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: 'owner' | 'member' }) =>
      updateFamilyMemberRole(client, input),
    onSuccess: async () => {
      setNotice('Family role updated.');
      await invalidateFamily();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not update the family role'),
  });

  const submitInvite = () => {
    setError(null);
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(activeInviteEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    invite.mutate();
  };

  const expiresLabel = useMemo(() => {
    if (!generatedInvite) return null;
    return new Date(generatedInvite.expiresAt).toLocaleDateString();
  }, [generatedInvite]);

  if (family.isPending) return <Loading label="Loading family settings…" />;

  if (family.isError || !family.data) {
    return (
      <Screen>
        <ModalHeader title="Family sharing" onClose={dismiss} />
        <ErrorNotice
          message={family.error instanceof Error ? family.error.message : 'Could not load family settings'}
          onRetry={() => family.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Family sharing"
        subtitle="Share the accounts you choose, keep the rest private."
        onClose={dismiss}
      />

      <ScrollView
        contentContainerClassName="gap-6 p-4 pb-16"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorNotice message={error} /> : null}
        {notice ? (
          <View className="rounded-xl border border-mint-200 bg-mint-50 p-3 dark:border-mint-900 dark:bg-mint-950/50">
            <Text className="text-sm text-mint-800 dark:text-mint-200">{notice}</Text>
          </View>
        ) : null}

        <Card className="p-4">
          <View className="flex-row items-start gap-3">
            <IconBadge name="people-outline" size={42} />
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                {family.data.household.name}
              </Text>
              <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                Family accounts are visible to everyone in this family. Private
                accounts remain visible only to their owner and are excluded from
                shared totals and reports.
              </Text>
            </View>
          </View>

          {isOwner ? (
            <View className="mt-5 gap-3">
              <Field
                label="Family name"
                value={familyName}
                onChangeText={setFamilyName}
                maxLength={80}
                placeholder="The Smith family"
              />
              <Button
                label={rename.isPending ? 'Saving…' : 'Save family name'}
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  rename.mutate();
                }}
                loading={rename.isPending}
                disabled={!familyName.trim() || rename.isPending}
              />
            </View>
          ) : null}
        </Card>

        <View>
          <View className="mb-3 flex-row items-center gap-3">
            <IconBadge name="people-circle-outline" size={38} />
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                Members
              </Text>
              <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                Owners manage membership. Members can edit Family-visible data.
              </Text>
            </View>
          </View>

          <Card className="overflow-hidden">
            {family.data.members.map((member, index) => {
              const memberIsCurrentUser = member.user_id === session?.user.id;
              const nextRole: 'owner' | 'member' =
                member.role === 'owner' ? 'member' : 'owner';

              return (
                <View key={member.user_id}>
                  {index > 0 ? <Divider /> : null}
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <IconBadge
                      name={member.role === 'owner' ? 'key-outline' : 'person-outline'}
                      size={36}
                      tone={memberIsCurrentUser ? 'accent' : 'neutral'}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                        {member.display_name || member.email}
                        {memberIsCurrentUser ? ' · You' : ''}
                      </Text>
                      <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                        {member.email}
                      </Text>
                    </View>
                    {isOwner && !memberIsCurrentUser ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${nextRole === 'owner' ? 'Make' : 'Make'} ${member.email} ${nextRole}`}
                        disabled={changeRole.isPending}
                        onPress={() => {
                          setError(null);
                          changeRole.mutate({ userId: member.user_id, role: nextRole });
                        }}
                        className="rounded-lg px-2 py-2"
                      >
                        <Text className="text-xs font-semibold text-mint-600 dark:text-mint-400">
                          {nextRole === 'owner' ? 'Make owner' : 'Make member'}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Badge
                      label={member.role === 'owner' ? 'Owner' : 'Member'}
                      tone={member.role === 'owner' ? 'accent' : 'neutral'}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        <Card className="p-4">
          <View className="flex-row items-start gap-3">
            <IconBadge name="mail-outline" size={40} />
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                Invite someone to your family
              </Text>
              <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                The invitation expires after 7 days and can be revoked. This beta
                accepts a new or empty Mintea account; populated accounts will use
                the later migration flow.
              </Text>
            </View>
          </View>

          {isOwner ? (
            <View className="mt-5 gap-3">
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="partner@example.com"
                onSubmitEditing={submitInvite}
              />
              <Button
                label={invite.isPending ? 'Creating invite…' : 'Create invitation'}
                onPress={submitInvite}
                loading={invite.isPending}
                disabled={!activeInviteEmail || invite.isPending}
              />
            </View>
          ) : (
            <Text className="mt-4 text-sm font-medium text-ink-500 dark:text-ink-400">
              Ask a family owner to send an invitation.
            </Text>
          )}
        </Card>

        {generatedInvite ? (
          <Card className="border-mint-200 bg-mint-50 p-4 dark:border-mint-900 dark:bg-mint-950/40">
            <Text className="text-base font-semibold text-mint-900 dark:text-mint-100">
              Secure invitation ready
            </Text>
            <Text className="mt-1 text-sm leading-5 text-mint-800 dark:text-mint-200">
              Send this link to {generatedInvite.email}. It expires on {expiresLabel}.
              The recipient must sign in with that email address.
            </Text>
            <Text
              selectable
              className="mt-3 rounded-xl border border-mint-200 bg-white p-3 text-xs leading-4 text-ink-700 dark:border-mint-800 dark:bg-ink-900 dark:text-ink-200"
            >
              {generatedInvite.link}
            </Text>
            <Button
              label="Open email app"
              variant="secondary"
              onPress={() => {
                void Linking.openURL(
                  inviteMailto(generatedInvite.email, generatedInvite.link),
                ).catch(() => {
                  setError('Could not open an email app. Copy the link above instead.');
                });
              }}
              className="mt-3"
            />
          </Card>
        ) : null}

        {isOwner && family.data.invitations.length > 0 ? (
          <View>
            <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Pending invitations
            </Text>
            <Card className="overflow-hidden">
              {family.data.invitations.map((invitation, index) => (
                <View key={invitation.id}>
                  {index > 0 ? <Divider /> : null}
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <IconBadge name="time-outline" size={34} tone="warning" />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        {invitation.email}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                        Expires {new Date(invitation.expires_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Revoke invitation for ${invitation.email}`}
                      disabled={revoke.isPending}
                      onPress={() => {
                        setError(null);
                        revoke.mutate(invitation.id);
                      }}
                      className="rounded-lg px-2 py-2"
                    >
                      <Text className="text-xs font-semibold text-negative">Revoke</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <Card className="p-4">
          <View className="flex-row items-start gap-3">
            <IconBadge name="lock-closed-outline" size={38} tone="neutral" />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                Choose privacy per account
              </Text>
              <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                Existing accounts keep their current access. New manual and bank
                accounts start Private until the owner chooses Family from the
                account settings.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

export default function FamilySettingsRoute() {
  return (
    <RequireAuth>
      <FamilySettings />
    </RequireAuth>
  );
}
