// Two-user household isolation.
//
// Every other migration test runs as the table owner, which bypasses row level
// security. This one does the opposite: it signs in as `authenticated` with a
// real `auth.uid()` and proves that one household can neither read nor mutate
// another's rows, and that `plaid_item_secrets` is invisible to every client
// role.
//
// The harness mirrors hosted Supabase's default privileges (ALL on public
// tables to anon and authenticated) on purpose. Without them a passing test
// would only prove that a GRANT is missing; with them, RLS is the only thing
// standing between the two households — which is exactly the claim the
// security model makes.

// Note: running this file on its own leaves the process alive after the last
// test — PGlite keeps a handle open that `close()` does not release. The tests
// all pass; only the exit hangs. `npm test` is unaffected, because the runner
// gives each file its own child process. To run just this file, add
// `--test-force-exit`.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const ids = {
  alice: '30000000-0000-4000-8000-000000000001',
  bob: '30000000-0000-4000-8000-000000000002',
};

/** Tables an authenticated client is allowed to reach, all household-scoped. */
const HOUSEHOLD_TABLES = [
  'accounts',
  'account_balances',
  'category_groups',
  'categories',
  'merchants',
  'tags',
  'transactions',
  'transaction_tags',
  'transaction_rules',
  'property_details',
  'plaid_items',
];

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

    -- PostgREST puts the verified JWT claims in a GUC and Supabase's auth.uid()
    -- reads the subject back out of it. Same shape here, so switching users is
    -- a SET rather than a redefinition.
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

/** Ids of the rows seeded for one household, keyed by table. */
async function seedHousehold(db, userId, label) {
  const { rows } = await db.query(
    `select household_id from household_members where user_id = $1`,
    [userId],
  );
  const household = rows[0].household_id;

  const one = async (sql, params) => (await db.query(sql, params)).rows[0].id;

  const item = await one(
    `insert into plaid_items (household_id, plaid_item_id, institution_name)
     values ($1, $2, $3) returning id`,
    [household, `item-${label}`, `${label} Bank`],
  );

  await db.query(
    `insert into plaid_item_secrets (item_id, access_token) values ($1, $2)`,
    [item, `access-sandbox-${label}`],
  );

  const account = await one(
    `insert into accounts
       (household_id, plaid_item_id, name, type, current_balance_cents, is_asset)
     values ($1, $2, $3, 'depository', 100000, true) returning id`,
    [household, item, `${label} Checking`],
  );

  const property = await one(
    `insert into accounts
       (household_id, name, type, current_balance_cents, is_asset, is_manual)
     values ($1, $2, 'real_estate', 50000000, true, true) returning id`,
    [household, `${label} House`],
  );

  await db.query(
    `insert into property_details (account_id, household_id, address_line)
     values ($1, $2, $3)`,
    [property, household, `1 ${label} Street`],
  );

  const balance = await one(
    `insert into account_balances (household_id, account_id, date, balance_cents)
     values ($1, $2, '2026-07-01', 100000) returning id`,
    [household, account],
  );

  const group = await one(
    `select id from category_groups where household_id = $1 order by display_order limit 1`,
    [household],
  );
  const category = await one(
    `select id from categories where household_id = $1 order by display_order limit 1`,
    [household],
  );

  const merchant = await one(
    `insert into merchants (household_id, name) values ($1, $2) returning id`,
    [household, `${label} Coffee`],
  );

  const tag = await one(
    `insert into tags (household_id, name) values ($1, $2) returning id`,
    [household, `${label} Tag`],
  );

  const transaction = await one(
    `insert into transactions
       (household_id, account_id, date, amount_cents, description, category_id)
     values ($1, $2, '2026-07-02', -1234, $3, $4) returning id`,
    [household, account, `${label} latte`, category],
  );

  await db.query(
    `insert into transaction_tags (household_id, transaction_id, tag_id)
     values ($1, $2, $3)`,
    [household, transaction, tag],
  );

  const rule = await one(
    `insert into transaction_rules
       (household_id, name, match_description, match_description_normalized, category_id)
     values ($1, $2, $3, '', $4) returning id`,
    [household, `${label} rule`, `${label} LATTE`, category],
  );

  return {
    household,
    item,
    account,
    property,
    balance,
    group,
    category,
    merchant,
    tag,
    transaction,
    rule,
  };
}

async function withDb(run) {
  const db = new PGlite();
  try {
    await applyMigrations(db);

    await db.exec(`
      insert into auth.users (id, email) values
        ('${ids.alice}', 'alice@example.com'),
        ('${ids.bob}', 'bob@example.com');
    `);

    const alice = await seedHousehold(db, ids.alice, 'Alice');
    const bob = await seedHousehold(db, ids.bob, 'Bob');

    await run(db, alice, bob);
  } finally {
    await db.close();
  }
}

/** Runs `fn` with the session acting as a signed-in user, or as anon. */
async function asRole(db, role, userId, fn) {
  await db.exec(
    userId
      ? `set request.jwt.claim.sub = '${userId}'; set role ${role};`
      : `reset request.jwt.claim.sub; set role ${role};`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

const asUser = (db, userId, fn) => asRole(db, 'authenticated', userId, fn);
const asAnon = (db, fn) => asRole(db, 'anon', null, fn);

/**
 * A client role must not be able to see a row. Either outcome is safe — the
 * row is filtered away, or the statement is refused outright — so accept both
 * and fail only when data actually comes back.
 */
async function assertNoRows(db, sql, params = []) {
  try {
    const { rows } = await db.query(sql, params);
    assert.equal(rows.length, 0, `expected no rows from: ${sql}`);
  } catch (error) {
    assert.match(String(error.message), /permission denied|does not exist/i);
  }
}

test('a signed-in user sees only their own household on every table', async () => {
  await withDb(async (db, alice, bob) => {
    await asUser(db, ids.alice, async () => {
      for (const table of HOUSEHOLD_TABLES) {
        const { rows } = await db.query(
          `select count(*)::int as n from ${table} where household_id <> $1`,
          [alice.household],
        );
        assert.equal(rows[0].n, 0, `${table} leaked another household`);

        const { rows: mine } = await db.query(
          `select count(*)::int as n from ${table}`,
        );
        assert.ok(mine[0].n > 0, `${table} returned nothing for its owner`);
      }

      const { rows: households } = await db.query(`select id from households`);
      assert.deepEqual(
        households.map((row) => row.id),
        [alice.household],
      );
    });

    // Symmetric: Bob is not privileged either.
    await asUser(db, ids.bob, async () => {
      const { rows } = await db.query(
        `select count(*)::int as n from transactions where household_id = $1`,
        [alice.household],
      );
      assert.equal(rows[0].n, 0);
    });
  });
});

test('a signed-in user cannot mutate another household', async () => {
  await withDb(async (db, alice, bob) => {
    await asUser(db, ids.alice, async () => {
      const updated = await db.query(
        `update transactions set description = 'stolen' where id = $1 returning id`,
        [bob.transaction],
      );
      assert.equal(updated.rows.length, 0);

      const deleted = await db.query(
        `delete from transactions where id = $1 returning id`,
        [bob.transaction],
      );
      assert.equal(deleted.rows.length, 0);

      const renamed = await db.query(
        `update accounts set name = 'stolen' where id = $1 returning id`,
        [bob.account],
      );
      assert.equal(renamed.rows.length, 0);

      // Writing *into* the other household is refused by the WITH CHECK clause.
      await assert.rejects(
        db.query(
          `insert into transactions
             (household_id, account_id, date, amount_cents, description)
           values ($1, $2, '2026-07-03', -1, 'planted')`,
          [bob.household, bob.account],
        ),
        /row-level security/i,
      );

      // Nor can a row be pushed across the boundary from the inside.
      await assert.rejects(
        db.query(`update transactions set household_id = $1 where id = $2`, [
          bob.household,
          alice.transaction,
        ]),
        /row-level security/i,
      );
    });

    // Bob's data survived all of it.
    const { rows } = await db.query(
      `select description from transactions where id = $1`,
      [bob.transaction],
    );
    assert.equal(rows[0].description, 'Bob latte');
  });
});

test('household-scoped RPCs never return another household', async () => {
  await withDb(async (db, alice, bob) => {
    await asUser(db, ids.alice, async () => {
      const { rows: net } = await db.query(
        `select assets_cents from net_worth_series('2026-07-01', '2026-07-02')`,
      );
      // Alice's own two accounts only: 100000 checking + 50000000 house.
      assert.ok(net.every((row) => Number(row.assets_cents) <= 50100000));

      await assertNoRows(
        db,
        `select tag_id from tag_usage_counts() where tag_id = $1`,
        [bob.tag],
      );

      await assert.rejects(
        db.query(`select transaction_rule_preview($1)`, [bob.rule]),
        /not found|no rule|permission denied/i,
      );

      await assert.rejects(
        db.query(`select soft_delete_transaction($1)`, [bob.transaction]),
        /not found/i,
      );
    });

    const { rows } = await db.query(
      `select deleted_at from transactions where id = $1`,
      [bob.transaction],
    );
    assert.equal(rows[0].deleted_at, null);
  });
});

test('set_reporting_timezone only touches the caller household', async () => {
  await withDb(async (db, alice, bob) => {
    await asUser(db, ids.alice, async () => {
      await db.query(`select set_reporting_timezone('America/New_York')`);
    });

    const { rows } = await db.query(
      `select id, timezone from households order by id`,
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.timezone]));
    assert.equal(byId[alice.household], 'America/New_York');
    assert.equal(byId[bob.household], 'UTC');
  });
});

test('plaid_item_secrets is unreachable from every client role', async () => {
  await withDb(async (db, alice) => {
    await asUser(db, ids.alice, async () => {
      // Its own household's token included — this table has RLS on and no
      // policies at all, so there is no such thing as a readable row.
      await assertNoRows(db, `select access_token from plaid_item_secrets`);
      await assertNoRows(
        db,
        `select access_token from plaid_item_secrets where item_id = $1`,
        [alice.item],
      );

      await assert.rejects(
        db.query(
          `insert into plaid_item_secrets (item_id, access_token)
           values ($1, 'planted')`,
          [alice.item],
        ),
        /row-level security|permission denied/i,
      );

      await assertNoRows(
        db,
        `update plaid_item_secrets set access_token = 'x' returning item_id`,
      );
    });

    await asAnon(db, async () => {
      await assertNoRows(db, `select access_token from plaid_item_secrets`);
    });
  });
});

// Account deletion is built on the assumption that dropping the household row
// takes everything with it. If any household-scoped table were missing its
// cascade, "delete my account" would silently leave that user's financial
// records in the database — so the assumption is checked rather than trusted.
test('deleting a household leaves nothing of it behind', async () => {
  await withDb(async (db, alice, bob) => {
    await db.query(`delete from households where id = $1`, [alice.household]);

    for (const table of [...HOUSEHOLD_TABLES, 'profiles', 'household_members']) {
      const { rows } = await db.query(
        `select count(*)::int as n from ${table} where household_id = $1`,
        [alice.household],
      );
      assert.equal(rows[0].n, 0, `${table} kept rows after the household went`);
    }

    // plaid_item_secrets has no household_id of its own; it hangs off the Item.
    const { rows: secrets } = await db.query(
      `select count(*)::int as n from plaid_item_secrets where item_id = $1`,
      [alice.item],
    );
    assert.equal(secrets[0].n, 0, 'a Plaid access token outlived its household');

    // The other household is untouched.
    const { rows: theirs } = await db.query(
      `select count(*)::int as n from transactions where household_id = $1`,
      [bob.household],
    );
    assert.equal(theirs[0].n, 1);
  });
});

test('a member leaving keeps the household data intact', async () => {
  await withDb(async (db, alice) => {
    // The "leave" branch of account deletion: membership and profile go, the
    // household and everything in it stays for whoever is left.
    await db.query(`delete from household_members where user_id = $1`, [
      ids.alice,
    ]);
    await db.query(`delete from profiles where id = $1`, [ids.alice]);

    const { rows } = await db.query(
      `select count(*)::int as n from transactions where household_id = $1`,
      [alice.household],
    );
    assert.equal(rows[0].n, 1);

    const { rows: households } = await db.query(
      `select count(*)::int as n from households where id = $1`,
      [alice.household],
    );
    assert.equal(households[0].n, 1);
  });
});

test('an anonymous client sees nothing at all', async () => {
  await withDb(async (db) => {
    await asAnon(db, async () => {
      for (const table of [...HOUSEHOLD_TABLES, 'households', 'profiles']) {
        await assertNoRows(db, `select * from ${table} limit 1`);
      }
    });
  });
});

test('existing households and Items default to the production environment', async () => {
  await withDb(async (db, alice) => {
    // The whole reason the migration is safe to apply before the functions
    // change: rows that predate the column are labelled correctly by default,
    // so the 8 live production Items keep working untouched.
    const { rows: households } = await db.query(
      `select plaid_environment from households where id = $1`,
      [alice.household],
    );
    assert.equal(households[0].plaid_environment, 'production');

    const { rows: items } = await db.query(
      `select plaid_environment from plaid_items where id = $1`,
      [alice.item],
    );
    assert.equal(items[0].plaid_environment, 'production');
  });
});

test('only sandbox and production are storable environments', async () => {
  await withDb(async (db, alice) => {
    for (const table of ['households', 'plaid_items']) {
      const id = table === 'households' ? alice.household : alice.item;

      await assert.rejects(
        db.query(
          `update ${table} set plaid_environment = 'development' where id = $1`,
          [id],
        ),
        /check constraint/i,
        `${table} accepted a retired Plaid environment`,
      );
    }
  });
});

test('a signed-in user cannot choose their own Plaid environment', async () => {
  await withDb(async (db, alice) => {
    await asUser(db, ids.alice, async () => {
      // Renaming is still allowed — the column grant is narrowed, not removed.
      const renamed = await db.query(
        `update households set name = 'Alice at home' where id = $1 returning id`,
        [alice.household],
      );
      assert.equal(renamed.rows.length, 1);

      // Promoting yourself to production would start creating real, billable
      // Items at Plaid. RLS cannot stop this — the row is legitimately theirs —
      // so the column-level grant is the only thing that does.
      await assert.rejects(
        db.query(
          `update households set plaid_environment = 'production' where id = $1`,
          [alice.household],
        ),
        /permission denied/i,
      );

      // And the reverse: demoting a production household would silently break
      // its own syncing.
      await assert.rejects(
        db.query(
          `update households set plaid_environment = 'sandbox' where id = $1`,
          [alice.household],
        ),
        /permission denied/i,
      );

      // Nor smuggled through alongside a column they may write.
      await assert.rejects(
        db.query(
          `update households set name = 'x', plaid_environment = 'sandbox' where id = $1`,
          [alice.household],
        ),
        /permission denied/i,
      );
    });

    const { rows } = await db.query(
      `select plaid_environment from households where id = $1`,
      [alice.household],
    );
    assert.equal(rows[0].plaid_environment, 'production');
  });
});

test('set_reporting_timezone still works with the narrowed grant', async () => {
  await withDb(async (db, alice) => {
    // It is SECURITY DEFINER, so revoking table UPDATE from `authenticated`
    // must not affect it. This is the regression that would otherwise only
    // show up in production.
    await asUser(db, ids.alice, async () => {
      await db.query(`select set_reporting_timezone('Europe/Berlin')`);
    });

    const { rows } = await db.query(
      `select timezone from households where id = $1`,
      [alice.household],
    );
    assert.equal(rows[0].timezone, 'Europe/Berlin');
  });
});
