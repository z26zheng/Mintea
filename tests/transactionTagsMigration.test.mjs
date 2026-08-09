import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const ids = {
  user: '20000000-0000-4000-8000-000000000001',
  household: '20000000-0000-4000-8000-000000000002',
  otherHousehold: '20000000-0000-4000-8000-000000000003',
  account: '20000000-0000-4000-8000-000000000004',
  tag: '20000000-0000-4000-8000-000000000005',
  otherTag: '20000000-0000-4000-8000-000000000006',
  foreignTag: '20000000-0000-4000-8000-000000000007',
  txA: '20000000-0000-4000-8000-000000000008',
  txB: '20000000-0000-4000-8000-000000000009',
  txRemoved: '20000000-0000-4000-8000-000000000010',
  txChild: '20000000-0000-4000-8000-000000000011',
  foreignAccount: '20000000-0000-4000-8000-000000000012',
  foreignTx: '20000000-0000-4000-8000-000000000013',
};

async function applyMigrations(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$ select null::uuid $$;
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

async function seed(db) {
  await db.exec(`
    alter table auth.users disable trigger on_auth_user_created;
    insert into auth.users (id, email) values ('${ids.user}', 'tags@example.com');

    create or replace function auth.uid()
    returns uuid language sql stable
    as $$ select '${ids.user}'::uuid $$;

    insert into households (id, name) values
      ('${ids.household}', 'Tag Household'),
      ('${ids.otherHousehold}', 'Other Household');

    insert into household_members (household_id, user_id, role)
    values ('${ids.household}', '${ids.user}', 'owner');

    insert into accounts (id, household_id, name, type, current_balance_cents, is_asset, is_manual)
    values
      ('${ids.account}', '${ids.household}', 'Checking', 'depository', 100000, true, true),
      ('${ids.foreignAccount}', '${ids.otherHousehold}', 'Theirs', 'depository', 100, true, true);

    insert into tags (id, household_id, name) values
      ('${ids.tag}', '${ids.household}', 'Tax Deductible'),
      ('${ids.otherTag}', '${ids.household}', 'Reimbursable'),
      ('${ids.foreignTag}', '${ids.otherHousehold}', 'Theirs');

    insert into transactions (id, household_id, account_id, date, amount_cents, description)
    values
      ('${ids.txA}', '${ids.household}', '${ids.account}', '2026-07-01', -1000, 'A'),
      ('${ids.txB}', '${ids.household}', '${ids.account}', '2026-07-02', -2000, 'B'),
      ('${ids.txRemoved}', '${ids.household}', '${ids.account}', '2026-07-03', -3000, 'Removed'),
      ('${ids.foreignTx}', '${ids.otherHousehold}', '${ids.foreignAccount}', '2026-07-04', -400, 'Foreign');

    update transactions set deleted_at = now() where id = '${ids.txRemoved}';

    insert into transactions (id, household_id, account_id, date, amount_cents, description, parent_id)
    values ('${ids.txChild}', '${ids.household}', '${ids.account}', '2026-07-01', -400, 'Child', '${ids.txA}');
  `);
}

async function withDb(run) {
  const db = new PGlite();
  try {
    await applyMigrations(db);
    await seed(db);
    await run(db);
  } finally {
    await db.close();
  }
}

test('normalizes tag names and rejects blank or overlong ones', async () => {
  await withDb(async (db) => {
    const { rows } = await db.query(
      `insert into tags (household_id, name) values ($1, $2) returning name`,
      [ids.household, '  Travel   Meals  '],
    );
    assert.equal(rows[0].name, 'Travel Meals');

    await assert.rejects(
      db.query(`insert into tags (household_id, name) values ($1, '   ')`, [
        ids.household,
      ]),
      /blank/i,
    );

    await assert.rejects(
      db.query(`insert into tags (household_id, name) values ($1, $2)`, [
        ids.household,
        'x'.repeat(41),
      ]),
      /40 characters/i,
    );
  });
});

test('tag names are unique per household, case-insensitively', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.query(`insert into tags (household_id, name) values ($1, 'tax deductible')`, [
        ids.household,
      ]),
      /duplicate key|unique/i,
    );

    // The same name in a different household is fine.
    const { rows } = await db.query(
      `insert into tags (household_id, name) values ($1, 'Tax Deductible') returning id`,
      [ids.otherHousehold],
    );
    assert.equal(rows.length, 1);
  });
});

test('usage counts exclude removed transactions and split children', async () => {
  await withDb(async (db) => {
    await db.exec(`
      insert into transaction_tags (household_id, transaction_id, tag_id) values
        ('${ids.household}', '${ids.txA}', '${ids.tag}'),
        ('${ids.household}', '${ids.txB}', '${ids.tag}'),
        ('${ids.household}', '${ids.txRemoved}', '${ids.tag}'),
        ('${ids.household}', '${ids.txChild}', '${ids.tag}');
    `);

    const { rows } = await db.query(
      `select transaction_count::int as count from tag_usage_counts() where tag_id = $1`,
      [ids.tag],
    );

    // Only txA and txB are live, top-level transactions.
    assert.equal(rows[0].count, 2);
  });
});

test('usage counts report zero for an unused tag', async () => {
  await withDb(async (db) => {
    const { rows } = await db.query(
      `select transaction_count::int as count from tag_usage_counts() where tag_id = $1`,
      [ids.otherTag],
    );
    assert.equal(rows[0].count, 0);
  });
});

test('usage counts never leak another household', async () => {
  await withDb(async (db) => {
    const { rows } = await db.query(
      `select tag_id from tag_usage_counts() where tag_id = $1`,
      [ids.foreignTag],
    );
    assert.equal(rows.length, 0);
  });
});

test('set_transaction_tags replaces the whole set atomically', async () => {
  await withDb(async (db) => {
    await db.query(`select set_transaction_tags($1, $2::uuid[])`, [
      ids.txA,
      [ids.tag, ids.otherTag],
    ]);

    let { rows } = await db.query(
      `select tag_id from transaction_tags where transaction_id = $1 order by tag_id`,
      [ids.txA],
    );
    assert.equal(rows.length, 2);

    // Replacing with a subset removes the rest.
    await db.query(`select set_transaction_tags($1, $2::uuid[])`, [
      ids.txA,
      [ids.otherTag],
    ]);

    ({ rows } = await db.query(
      `select tag_id from transaction_tags where transaction_id = $1`,
      [ids.txA],
    ));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tag_id, ids.otherTag);

    // An empty array clears them.
    await db.query(`select set_transaction_tags($1, '{}'::uuid[])`, [ids.txA]);
    ({ rows } = await db.query(
      `select tag_id from transaction_tags where transaction_id = $1`,
      [ids.txA],
    ));
    assert.equal(rows.length, 0);
  });
});

test('set_transaction_tags refuses another household tag or transaction', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.query(`select set_transaction_tags($1, $2::uuid[])`, [
        ids.txA,
        [ids.foreignTag],
      ]),
      /Unknown tag/i,
    );

    await assert.rejects(
      db.query(`select set_transaction_tags($1, $2::uuid[])`, [
        ids.foreignTx,
        [ids.tag],
      ]),
      /Transaction not found/i,
    );

    // The failed call must not have cleared the existing tags.
    await db.exec(`
      insert into transaction_tags (household_id, transaction_id, tag_id)
      values ('${ids.household}', '${ids.txA}', '${ids.tag}');
    `);
    await assert.rejects(
      db.query(`select set_transaction_tags($1, $2::uuid[])`, [
        ids.txA,
        [ids.foreignTag],
      ]),
      /Unknown tag/i,
    );
    const { rows } = await db.query(
      `select tag_id from transaction_tags where transaction_id = $1`,
      [ids.txA],
    );
    assert.equal(rows.length, 1);
  });
});

test('bulk tagging reports only the rows it actually changed', async () => {
  await withDb(async (db) => {
    let { rows } = await db.query(
      `select bulk_tag_transactions($1, $2::uuid[], true) as changed`,
      [ids.tag, [ids.txA, ids.txB]],
    );
    assert.equal(rows[0].changed, 2);

    // Re-tagging the same rows changes nothing and must not error.
    ({ rows } = await db.query(
      `select bulk_tag_transactions($1, $2::uuid[], true) as changed`,
      [ids.tag, [ids.txA, ids.txB]],
    ));
    assert.equal(rows[0].changed, 0);

    // Removed transactions and other households are skipped, not counted.
    ({ rows } = await db.query(
      `select bulk_tag_transactions($1, $2::uuid[], true) as changed`,
      [ids.tag, [ids.txRemoved, ids.foreignTx]],
    ));
    assert.equal(rows[0].changed, 0);

    ({ rows } = await db.query(
      `select bulk_tag_transactions($1, $2::uuid[], false) as changed`,
      [ids.tag, [ids.txA, ids.txB]],
    ));
    assert.equal(rows[0].changed, 2);
  });
});

test('bulk tagging refuses a tag from another household', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.query(`select bulk_tag_transactions($1, $2::uuid[], true)`, [
        ids.foreignTag,
        [ids.txA],
      ]),
      /Tag not found/i,
    );
  });
});

test('deleting a tag removes its assignments but keeps the transactions', async () => {
  await withDb(async (db) => {
    await db.query(`select set_transaction_tags($1, $2::uuid[])`, [
      ids.txA,
      [ids.tag],
    ]);

    await db.query(`delete from tags where id = $1`, [ids.tag]);

    const links = await db.query(
      `select 1 from transaction_tags where tag_id = $1`,
      [ids.tag],
    );
    assert.equal(links.rows.length, 0);

    const tx = await db.query(`select id from transactions where id = $1`, [
      ids.txA,
    ]);
    assert.equal(tx.rows.length, 1);
  });
});
