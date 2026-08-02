import assert from 'node:assert/strict';
import test from 'node:test';

import { planAccountDeletion } from '../supabase/functions/_shared/accountDeletion.ts';

const ALICE = 'a0000000-0000-4000-8000-000000000001';
const BOB = 'b0000000-0000-4000-8000-000000000002';
const CARL = 'c0000000-0000-4000-8000-000000000003';

test('a sole member takes the whole household with them', () => {
  const plan = planAccountDeletion([{ user_id: ALICE, role: 'owner' }], ALICE);
  assert.deepEqual(plan, { action: 'delete-household' });
});

test('a household with no membership rows still deletes', () => {
  // Should not happen, but refusing here would leave an account that can never
  // be deleted, which is worse than deleting an empty household.
  assert.deepEqual(planAccountDeletion([], ALICE), {
    action: 'delete-household',
  });
});

test('a member leaves without touching anyone else data', () => {
  const plan = planAccountDeletion(
    [
      { user_id: ALICE, role: 'owner' },
      { user_id: BOB, role: 'member' },
    ],
    BOB,
  );
  assert.deepEqual(plan, { action: 'leave-household' });
});

test('an owner leaves when another owner remains', () => {
  const plan = planAccountDeletion(
    [
      { user_id: ALICE, role: 'owner' },
      { user_id: BOB, role: 'owner' },
    ],
    ALICE,
  );
  assert.deepEqual(plan, { action: 'leave-household' });
});

test('the last owner of a shared household is refused', () => {
  // Deleting would take Bob and Carl's data; promoting one of them would grant
  // write access they never agreed to. Neither is ours to decide.
  const plan = planAccountDeletion(
    [
      { user_id: ALICE, role: 'owner' },
      { user_id: BOB, role: 'member' },
      { user_id: CARL, role: 'viewer' },
    ],
    ALICE,
  );

  assert.equal(plan.action, 'refuse');
  assert.match(plan.reason, /last owner/i);
});

test('a viewer-only household still refuses rather than promoting a viewer', () => {
  const plan = planAccountDeletion(
    [
      { user_id: ALICE, role: 'owner' },
      { user_id: BOB, role: 'viewer' },
    ],
    ALICE,
  );
  assert.equal(plan.action, 'refuse');
});

test('the caller own role never counts toward the remaining owners', () => {
  // Alice is an owner, but she is the one leaving — her row must not satisfy
  // the "another owner remains" check.
  const plan = planAccountDeletion(
    [
      { user_id: ALICE, role: 'owner' },
      { user_id: BOB, role: 'member' },
    ],
    ALICE,
  );
  assert.equal(plan.action, 'refuse');
});
