import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const ids = {
  user: '30000000-0000-4000-8000-000000000001',
  household: '30000000-0000-4000-8000-000000000002',
  otherHousehold: '30000000-0000-4000-8000-000000000003',
  account: '30000000-0000-4000-8000-000000000004',
  groupA: '30000000-0000-4000-8000-000000000005',
  groupB: '30000000-0000-4000-8000-000000000006',
  groupEmpty: '30000000-0000-4000-8000-000000000007',
  foreignGroup: '30000000-0000-4000-8000-000000000008',
  catGroceries: '30000000-0000-4000-8000-000000000009',
  catRestaurants: '30000000-0000-4000-8000-000000000010',
  catFlights: '30000000-0000-4000-8000-000000000011',
  tx: '30000000-0000-4000-8000-000000000012',
};

async function applyMigrations(db) {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid()
    returns uuid language sql stable as $$ select null::uuid $$;
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
        .replace(/create index transactions_description_trgm_idx[\s\S]*?;\s*/g, '');
    }

    await db.exec(sql);
  }
}

async function seed(db) {
  await db.exec(`
    alter table auth.users disable trigger on_auth_user_created;
    insert into auth.users (id, email) values ('${ids.user}', 'groups@example.com');

    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${ids.user}'::uuid $$;

    insert into households (id, name) values
      ('${ids.household}', 'Group Household'),
      ('${ids.otherHousehold}', 'Other Household');

    insert into household_members (household_id, user_id, role)
    values ('${ids.household}', '${ids.user}', 'owner');

    insert into accounts (id, household_id, name, type, current_balance_cents, is_asset, is_manual)
    values ('${ids.account}', '${ids.household}', 'Checking', 'depository', 100000, true, true);

    insert into category_groups (id, household_id, name, type, display_order) values
      ('${ids.groupA}', '${ids.household}', 'Food', 'expense', 0),
      ('${ids.groupB}', '${ids.household}', 'Travel', 'expense', 1),
      ('${ids.groupEmpty}', '${ids.household}', 'Unused', 'expense', 2),
      ('${ids.foreignGroup}', '${ids.otherHousehold}', 'Theirs', 'expense', 0);

    insert into categories (id, household_id, group_id, name) values
      ('${ids.catGroceries}', '${ids.household}', '${ids.groupA}', 'Groceries'),
      ('${ids.catRestaurants}', '${ids.household}', '${ids.groupA}', 'Restaurants'),
      ('${ids.catFlights}', '${ids.household}', '${ids.groupB}', 'Flights');

    insert into transactions (id, household_id, account_id, date, amount_cents, description, category_id)
    values ('${ids.tx}', '${ids.household}', '${ids.account}', '2026-07-01', -1000, 'Shop', '${ids.catGroceries}');
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

const rows = async (db, sql) => (await db.query(sql)).rows;

test('normalizes a group name and rejects a blank one', async () => {
  await withDb(async (db) => {
    await db.exec(`
      insert into category_groups (household_id, name, type)
      values ('${ids.household}', '   Home   and    Utilities  ', 'expense');
    `);

    const [group] = await rows(
      db,
      `select name from category_groups where name like 'Home%'`,
    );
    assert.equal(group.name, 'Home and Utilities');

    await assert.rejects(
      db.exec(`insert into category_groups (household_id, name, type)
               values ('${ids.household}', '   ', 'expense');`),
      /needs a name/,
    );
  });
});

test('rejects two groups whose names differ only by case', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.exec(`insert into category_groups (household_id, name, type)
               values ('${ids.household}', 'food', 'expense');`),
      /duplicate key|unique/i,
    );
  });
});

test('the same group name is fine in a different household', async () => {
  await withDb(async (db) => {
    await db.exec(`insert into category_groups (household_id, name, type)
                   values ('${ids.otherHousehold}', 'Food', 'expense');`);

    const [{ count }] = await rows(
      db,
      `select count(*)::int as count from category_groups where lower(name) = 'food'`,
    );
    assert.equal(count, 2);
  });
});

test('deletes an empty group without needing a destination', async () => {
  await withDb(async (db) => {
    const [{ delete_category_group: moved }] = await rows(
      db,
      `select delete_category_group('${ids.groupEmpty}', null)`,
    );
    assert.equal(moved, 0);

    const [{ count }] = await rows(
      db,
      `select count(*)::int as count from category_groups where id = '${ids.groupEmpty}'`,
    );
    assert.equal(count, 0);
  });
});

test('refuses to delete a group that still holds categories', async () => {
  // This is the whole point: a bare delete would cascade the categories away
  // and silently uncategorise every transaction that used them.
  await withDb(async (db) => {
    await assert.rejects(
      db.query(`select delete_category_group('${ids.groupA}', null)`),
      /still has 2 categories/,
    );

    const [{ count }] = await rows(
      db,
      `select count(*)::int as count from categories where group_id = '${ids.groupA}'`,
    );
    assert.equal(count, 2);
  });
});

test('moves categories to the destination and keeps transactions categorised', async () => {
  await withDb(async (db) => {
    const [{ delete_category_group: moved }] = await rows(
      db,
      `select delete_category_group('${ids.groupA}', '${ids.groupB}')`,
    );
    assert.equal(moved, 2);

    const moved_rows = await rows(
      db,
      `select name from categories where group_id = '${ids.groupB}' order by name`,
    );
    assert.deepEqual(moved_rows.map((r) => r.name), [
      'Flights',
      'Groceries',
      'Restaurants',
    ]);

    // The transaction still points at its category, which still exists.
    const [tx] = await rows(
      db,
      `select category_id from transactions where id = '${ids.tx}'`,
    );
    assert.equal(tx.category_id, ids.catGroceries);
  });
});

test('will not move categories into the group being deleted', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.query(`select delete_category_group('${ids.groupA}', '${ids.groupA}')`),
      /cannot be moved into itself/,
    );
  });
});

test('will not move categories into another household', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.query(
        `select delete_category_group('${ids.groupA}', '${ids.foreignGroup}')`,
      ),
      /Destination group not found/,
    );

    const [{ count }] = await rows(
      db,
      `select count(*)::int as count from categories where household_id = '${ids.otherHousehold}'`,
    );
    assert.equal(count, 0);
  });
});

test('will not delete another household group', async () => {
  await withDb(async (db) => {
    await assert.rejects(
      db.query(`select delete_category_group('${ids.foreignGroup}', null)`),
      /Group not found/,
    );
  });
});

test('reorders groups in one pass', async () => {
  await withDb(async (db) => {
    const [{ reorder_category_groups: updated }] = await rows(
      db,
      `select reorder_category_groups(array['${ids.groupEmpty}','${ids.groupB}','${ids.groupA}']::uuid[])`,
    );
    assert.equal(updated, 3);

    const order = await rows(
      db,
      `select name from category_groups
       where household_id = '${ids.household}'
       order by display_order`,
    );
    assert.deepEqual(order.map((r) => r.name), ['Unused', 'Travel', 'Food']);
  });
});

test('reordering ignores ids from another household', async () => {
  await withDb(async (db) => {
    const [{ reorder_category_groups: updated }] = await rows(
      db,
      `select reorder_category_groups(array['${ids.groupA}','${ids.foreignGroup}']::uuid[])`,
    );

    assert.equal(updated, 1);

    const [foreign] = await rows(
      db,
      `select display_order from category_groups where id = '${ids.foreignGroup}'`,
    );
    assert.equal(foreign.display_order, 0);
  });
});
