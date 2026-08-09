import type { MinteaClient } from './client';
import { unwrap } from './client';
import type {
  FamilyInvitationResult,
  FamilyInvitationRow,
  FamilyMemberRow,
  HouseholdRow,
} from '../types/database';
import { fetchProfile } from './session';

export type FamilyWorkspace = {
  household: HouseholdRow;
  members: FamilyMemberRow[];
  invitations: FamilyInvitationRow[];
};

export async function fetchFamilyWorkspace(
  client: MinteaClient,
): Promise<FamilyWorkspace> {
  const profile = await fetchProfile(client);

  const [household, members, invitations] = await Promise.all([
    (unwrap(
      await client
        .from('households')
        .select('*')
        .eq('id', profile.household_id)
        .single(),
    ) as HouseholdRow),
    unwrap(await client.rpc('get_family_members')),
    unwrap(
      await client
        .from('family_invitations')
        .select('*')
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false }),
    ),
  ]);

  return { household, members, invitations };
}

export async function createFamilyInvitation(
  client: MinteaClient,
  email: string,
): Promise<FamilyInvitationResult> {
  const rows = unwrap(
    await client.rpc('create_family_invitation', {
      p_email: email,
      p_role: 'member',
    }),
  );
  const invitation = rows[0];
  if (!invitation) throw new Error('Could not create the family invitation');
  return invitation;
}

export async function revokeFamilyInvitation(
  client: MinteaClient,
  invitationId: string,
): Promise<boolean> {
  return unwrap(
    await client.rpc('revoke_family_invitation', {
      p_invitation_id: invitationId,
    }),
  );
}

export async function renameFamily(
  client: MinteaClient,
  name: string,
): Promise<HouseholdRow> {
  return unwrap(await client.rpc('rename_family', { p_name: name }));
}

export async function updateFamilyMemberRole(
  client: MinteaClient,
  input: { userId: string; role: 'owner' | 'member' },
): Promise<{ user_id: string; role: 'owner' | 'member' }> {
  const rows = unwrap(
    await client.rpc('update_family_member_role', {
      p_user_id: input.userId,
      p_role: input.role,
    }),
  );
  const member = rows[0]
    ? {
        user_id: rows[0].user_id,
        role: rows[0].role as 'owner' | 'member',
      }
    : undefined;
  if (!member) throw new Error('Could not update the family member');
  return member;
}

export async function acceptFamilyInvitation(
  client: MinteaClient,
  token: string,
): Promise<{ household_id: string; role: 'owner' | 'member' }> {
  const rows = unwrap(
    await client.rpc('accept_family_invitation', { p_token: token }),
  );
  const result = rows[0]
    ? {
        household_id: rows[0].household_id,
        role: rows[0].role as 'owner' | 'member',
      }
    : undefined;
  if (!result) throw new Error('Could not accept the family invitation');
  return result;
}
