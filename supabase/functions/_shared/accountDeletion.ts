/**
 * What deleting an account should do, given who else is in the household.
 *
 * Kept separate from the function that carries it out because this is the part
 * with consequences: choosing wrongly either destroys data belonging to other
 * people or leaves a shared household with nobody able to administer it.
 * Neither is something to discover in production.
 */

export type HouseholdMember = {
  user_id: string;
  role: string;
};

/**
 * Whether a failed `/item/remove` means the Item was already gone from Plaid,
 * and local cleanup may safely continue.
 *
 * Only `ITEM_NOT_FOUND` qualifies. `INVALID_ACCESS_TOKEN` used to be accepted
 * here too, because a deployment-wide `PLAID_ENV` could point every call at the
 * wrong host and make perfectly good tokens look invalid. Now that each Item
 * stores the environment it was created in, that can no longer happen — so the
 * error means what it says, and continuing would delete the user's local data
 * while leaving a live bank connection at Plaid that nobody can see or revoke.
 *
 * A failed delete is recoverable; an orphaned bank connection is not.
 */
export function isAlreadyDisconnected(errorCode: string | null): boolean {
  return errorCode === 'ITEM_NOT_FOUND';
}

export type DeletionPlan =
  /** The caller is alone. Revoke Plaid, drop the household, delete the user. */
  | { action: 'delete-household' }
  /** Others remain. Remove only the caller's membership, profile and user. */
  | { action: 'leave-household' }
  /** Refuse, with a message the user can act on. */
  | { action: 'refuse'; reason: string };

export function planAccountDeletion(
  members: HouseholdMember[],
  callerUserId: string,
): DeletionPlan {
  const others = members.filter((member) => member.user_id !== callerUserId);

  if (others.length === 0) return { action: 'delete-household' };

  // Promoting someone in the caller's absence would hand out write access they
  // never agreed to; deleting the household would take data that is not the
  // caller's alone. Refusing is the only option that does neither.
  const hasAnotherOwner = others.some((member) => member.role === 'owner');

  if (!hasAnotherOwner) {
    return {
      action: 'refuse',
      reason:
        'You are the last owner of a shared household. Make someone else an ' +
        'owner before deleting your account.',
    };
  }

  return { action: 'leave-household' };
}
