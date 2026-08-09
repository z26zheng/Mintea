// P6.1 family-account authorization and the empty-household invite beta.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const ids = {
  alice: '40000000-0000-4000-8000-000000000001',
  bob: '40000000-0000-4000-8000-000000000002',
  carol: '40000000-0000-4000-8000-000000000003',
};

async function applyMigrations(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;

    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    alter default privileges in schema public
      grant all on tables to anon, authenticated;
    alter default privileges in schema public
      grant all on sequences to anon, authenticated;
  `);

  const names = (await readdir(MIGRATIONS))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of names) {
    let sql = await readFile(join(MIGRATIONS, name), 'utf8');

    if (name === '20260727000100_initial_schema.sql') {
      sql = sql
        .replace(/create extension if not exists pgcrypto;\s*/g, '')
        .replace(/create extension if not exists pg_trgm;\s*/g, '')
        .replace(
          /create index transactions_description_trgm_idx[\s\S]*?;\s*/g,
          '',
        );
    }

    await db.exec(sql);
  }
}

async function asUser(db, userId, fn) {
  await db.exec(
    `set request.jwt.claim.sub = '${userId}'; set role authenticated;`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

async function withDb(run) {
  const db = new PGlite();
  try {
    await applyMigrations(db);
    await db.exec(`
      insert into auth.users (id, email) values
        ('${ids.alice}', 'alice@example.com'),
        ('${ids.bob}', 'bob@example.com'),
        ('${ids.carol}', 'carol@example.com');
    `);

    const { rows } = await db.query(
      `select user_id, household_id
         from household_members
        where user_id in ($1, $2, $3)
        order by user_id`,
      [ids.alice, ids.bob, ids.carol],
    );
    const households = Object.fromEntries(
      rows.map((row) => [row.user_id, row.household_id]),
    );

    await run(db, households);
  } finally {
    await db.close();
  }
}

async function insertAccount(db, householdId, name, visibility = 'family') {
  const { rows } = await db.query(
    `insert into accounts
       (household_id, name, type, current_balance_cents, is_asset, is_manual, visibility)
     values ($1, $2, 'depository', 100000, true, true, $3)
     returning id, owner_user_id, visibility`,
    [householdId, name, visibility],
  );
  return rows[0];
}

test('an owner can invite an empty user and acceptance moves the bootstrap family atomically', async () => {
  await withDb(async (db, households) => {
    const targetHousehold = households[ids.alice];
    const sourceHousehold = households[ids.bob];

    const { rows: created } = await asUser(db, ids.alice, () =>
      db.query(`select * from create_family_invitation('bob@example.com')`),
    );

    assert.equal(created.length, 1);
    assert.equal(created[0].email, 'bob@example.com');
    assert.equal(created[0].role, 'member');
    assert.ok(created[0].token.length >= 60);

    const { rows: sourceState } = await asUser(db, ids.bob, () =>
      db.query(
        `select
           (select household_id from profiles where id = $1) as household_id,
           (select count(*)::int from household_members where household_id = (select household_id from profiles where id = $1)) as members,
           (select count(*)::int from accounts where household_id = (select household_id from profiles where id = $1)) as accounts`,
        [ids.bob],
      ),
    );
    assert.deepEqual(sourceState, [
      { household_id: sourceHousehold, members: 1, accounts: 0 },
    ]);

    const { rows: accepted } = await asUser(db, ids.bob, () =>
      db.query(`select * from accept_family_invitation($1)`, [created[0].token]),
    );

    assert.deepEqual(accepted, [
      { household_id: targetHousehold, role: 'member' },
    ]);

    const { rows: bobProfile } = await db.query(
      `select household_id from profiles where id = $1`,
      [ids.bob],
    );
    assert.equal(bobProfile[0].household_id, targetHousehold);

    const { rows: bobMemberships } = await db.query(
      `select count(*)::int as count from household_members where user_id = $1`,
      [ids.bob],
    );
    assert.deepEqual(bobMemberships, [{ count: 1 }]);

    const { rows: sourceRows } = await db.query(
      `select id from households where id = $1`,
      [sourceHousehold],
    );
    assert.equal(sourceRows.length, 0);

    // Repeating the same tap is idempotent for the same accepted user.
    const { rows: repeated } = await asUser(db, ids.bob, () =>
      db.query(`select * from accept_family_invitation($1)`, [created[0].token]),
    );
    assert.deepEqual(repeated, accepted);

    const { rows: members } = await asUser(db, ids.bob, () =>
      db.query(`select * from get_family_members()`),
    );
    assert.deepEqual(
      members.map((member) => ({
        user_id: member.user_id,
        email: member.email,
        role: member.role,
      })),
      [
        { user_id: ids.alice, email: 'alice@example.com', role: 'owner' },
        { user_id: ids.bob, email: 'bob@example.com', role: 'member' },
      ],
    );

    await assert.rejects(
      asUser(db, ids.bob, () =>
        db.query(`select * from create_family_invitation('carol@example.com')`),
      ),
      /only family owners/i,
    );
  });
});

test('join rejects a Plaid-environment mismatch without changing membership', async () => {
  await withDb(async (db, households) => {
    const targetHousehold = households[ids.alice];
    const sourceHousehold = households[ids.bob];

    await db.query(
      `update households set plaid_environment = 'sandbox' where id = $1`,
      [targetHousehold],
    );

    const { rows: created } = await asUser(db, ids.alice, () =>
      db.query(`select * from create_family_invitation('bob@example.com')`),
    );

    await assert.rejects(
      asUser(db, ids.bob, () =>
        db.query(`select * from accept_family_invitation($1)`, [created[0].token]),
      ),
      /different plaid environments/i,
    );

    const { rows: state } = await db.query(
      `select
         (select household_id from profiles where id = $1) as household_id,
         (select count(*)::int from household_members where user_id = $1) as memberships,
         (select count(*)::int from household_members where household_id = $2 and user_id = $1) as target_memberships`,
      [ids.bob, targetHousehold],
    );
    assert.deepEqual(state, [
      { household_id: sourceHousehold, memberships: 1, target_memberships: 0 },
    ]);
  });
});

test('join rejects a caller with multiple active family memberships', async () => {
  await withDb(async (db, households) => {
    const targetHousehold = households[ids.alice];
    const sourceHousehold = households[ids.bob];
    const extraHousehold = '50000000-0000-4000-8000-000000000001';

    await db.query(
      `insert into households (id, name) values ($1, 'Extra family')`,
      [extraHousehold],
    );
    await db.query(
      `insert into household_members (household_id, user_id, role)
       values ($1, $2, 'owner')`,
      [extraHousehold, ids.bob],
    );

    const { rows: created } = await asUser(db, ids.alice, () =>
      db.query(`select * from create_family_invitation('bob@example.com')`),
    );

    await assert.rejects(
      asUser(db, ids.bob, () =>
        db.query(`select * from accept_family_invitation($1)`, [created[0].token]),
      ),
      /exactly one family/i,
    );

    const { rows: state } = await db.query(
      `select
         (select household_id from profiles where id = $1) as household_id,
         (select count(*)::int from household_members where user_id = $1) as memberships,
         (select count(*)::int from household_members where household_id = $2 and user_id = $1) as target_memberships`,
      [ids.bob, targetHousehold],
    );
    assert.deepEqual(state, [
      { household_id: sourceHousehold, memberships: 2, target_memberships: 0 },
    ]);
  });
});

test('account privacy is enforced for direct rows, dependent rows, and aggregates', async () => {
  await withDb(async (db, households) => {
    const targetHousehold = households[ids.alice];

    const familyAccount = await insertAccount(
      db,
      targetHousehold,
      'Family checking',
      'family',
    );
    const privateAccount = await insertAccount(
      db,
      targetHousehold,
      'Alice private savings',
      'private',
    );

    await db.query(
      `insert into transactions
         (household_id, account_id, date, amount_cents, description)
       values
         ($1, $2, '2026-08-01', -1200, 'Family purchase'),
         ($1, $3, '2026-08-01', -9900, 'Private purchase')`,
      [targetHousehold, familyAccount.id, privateAccount.id],
    );
    await db.query(
      `insert into account_balances
         (household_id, account_id, date, balance_cents)
       values
         ($1, $2, '2026-08-01', 100000),
         ($1, $3, '2026-08-01', 900000)`,
      [targetHousehold, familyAccount.id, privateAccount.id],
    );

    const invite = await asUser(db, ids.alice, () =>
      db.query(`select * from create_family_invitation('bob@example.com')`),
    );
    await asUser(db, ids.bob, () =>
      db.query(`select * from accept_family_invitation($1)`, [invite.rows[0].token]),
    );

    await asUser(db, ids.bob, async () => {
      const { rows: accounts } = await db.query(
        `select name, visibility from accounts order by name`,
      );
      assert.deepEqual(accounts, [{ name: 'Family checking', visibility: 'family' }]);

      const { rows: transactions } = await db.query(
        `select description from transactions order by description`,
      );
      assert.deepEqual(transactions, [{ description: 'Family purchase' }]);

      const { rows: netWorth } = await db.query(
        `select net_cents from net_worth_series('2026-08-01', '2026-08-01')`,
      );
      assert.deepEqual(netWorth, [{ net_cents: 100000 }]);

      const { rows: sharedUpdate } = await db.query(
        `update accounts set name = 'Shared checking' where id = $1 returning name`,
        [familyAccount.id],
      );
      assert.deepEqual(sharedUpdate, [{ name: 'Shared checking' }]);

      await assert.rejects(
        db.query(
          `update accounts set visibility = 'private' where id = $1`,
          [familyAccount.id],
        ),
        /only the account owner/i,
      );
    });

    await asUser(db, ids.alice, async () => {
      const { rows: privateRows } = await db.query(
        `select name from accounts where id = $1`,
        [privateAccount.id],
      );
      assert.deepEqual(privateRows, [{ name: 'Alice private savings' }]);

      await db.query(
        `update accounts set visibility = 'family' where id = $1`,
        [privateAccount.id],
      );
    });

    await asUser(db, ids.bob, async () => {
      const { rows: nowShared } = await db.query(
        `select name, visibility from accounts order by name`,
      );
      assert.deepEqual(nowShared, [
        { name: 'Alice private savings', visibility: 'family' },
        { name: 'Shared checking', visibility: 'family' },
      ]);
    });
  });
});

test('revoked invitations cannot be accepted', async () => {
  await withDb(async (db, households) => {
    const { rows: created } = await asUser(db, ids.alice, () =>
      db.query(`select * from create_family_invitation('bob@example.com')`),
    );

    const { rows: revoked } = await asUser(db, ids.alice, () =>
      db.query(`select revoke_family_invitation($1) as revoked`, [created[0].id]),
    );
    assert.deepEqual(revoked, [{ revoked: true }]);

    await assert.rejects(
      asUser(db, ids.bob, () =>
        db.query(`select * from accept_family_invitation($1)`, [created[0].token]),
      ),
      /invalid or expired/i,
    );

    // The target household is still intact; revocation never mutates family data.
    const { rows: target } = await db.query(
      `select id from households where id = $1`,
      [households[ids.alice]],
    );
    assert.equal(target.length, 1);
  });
});
