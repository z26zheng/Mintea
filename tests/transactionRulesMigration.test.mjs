import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  household: '10000000-0000-4000-8000-000000000002',
  otherHousehold: '10000000-0000-4000-8000-000000000003',
  account: '10000000-0000-4000-8000-000000000004',
  categoryGroup: '10000000-0000-4000-8000-000000000005',
  category: '10000000-0000-4000-8000-000000000006',
  merchant: '10000000-0000-4000-8000-000000000007',
  otherMerchant: '10000000-0000-4000-8000-000000000008',
  source: '10000000-0000-4000-8000-000000000009',
  whitespaceVariant: '10000000-0000-4000-8000-000000000010',
  similar: '10000000-0000-4000-8000-000000000011',
  deleted: '10000000-0000-4000-8000-000000000012',
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

async function seedScenario(db) {
  await db.exec(`
    alter table auth.users disable trigger on_auth_user_created;
    insert into auth.users (id, email)
    values ('${ids.user}', 'rules@example.com');

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$ select '${ids.user}'::uuid $$;

    insert into households (id, name)
    values
      ('${ids.household}', 'Rules Household'),
      ('${ids.otherHousehold}', 'Other Household');

    insert into household_members (household_id, user_id, role)
    values ('${ids.household}', '${ids.user}', 'owner');

    insert into accounts (
      id,
      household_id,
      name,
      type,
      current_balance_cents,
      is_asset,
      is_manual
    )
    values (
      '${ids.account}',
      '${ids.household}',
      'Checking',
      'depository',
      100000,
      true,
      true
    );

    insert into category_groups (
      id,
      household_id,
      name,
      type
    )
    values (
      '${ids.categoryGroup}',
      '${ids.household}',
      'Food',
      'expense'
    );

    insert into categories (
      id,
      household_id,
      group_id,
      name,
      icon
    )
    values (
      '${ids.category}',
      '${ids.household}',
      '${ids.categoryGroup}',
      'Coffee Shops',
      '☕'
    );

    insert into merchants (id, household_id, name)
    values
      ('${ids.merchant}', '${ids.household}', 'Blue Bottle Coffee'),
      ('${ids.otherMerchant}', '${ids.otherHousehold}', 'Other Merchant');

    insert into transactions (
      id,
      household_id,
      account_id,
      date,
      amount_cents,
      description,
      original_description,
      needs_review,
      deleted_at
    )
    values
      (
        '${ids.source}',
        '${ids.household}',
        '${ids.account}',
        '2026-07-01',
        -675,
        'Blue Bottle',
        'BLUE BOTTLE COFFEE #1842',
        true,
        null
      ),
      (
        '${ids.whitespaceVariant}',
        '${ids.household}',
        '${ids.account}',
        '2026-07-08',
        -725,
        'Blue Bottle',
        '  blue bottle   coffee #1842  ',
        true,
        null
      ),
      (
        '${ids.similar}',
        '${ids.household}',
        '${ids.account}',
        '2026-07-15',
        -825,
        'Blue Bottle',
        'BLUE BOTTLE COFFEE #1843',
        true,
        null
      ),
      (
        '${ids.deleted}',
        '${ids.household}',
        '${ids.account}',
        '2026-07-22',
        -925,
        'Blue Bottle',
        'BLUE BOTTLE COFFEE #1842',
        true,
        now()
      );
  `);
}

test('cleanup rules preview exact matches and apply reviewed merchant/category actions', async () => {
  const db = new PGlite();

  try {
    await applyMigrations(db);
    await seedScenario(db);

    const preview = await db.query(
      `select * from transaction_rule_preview('${ids.source}')`,
    );
    assert.deepEqual(preview.rows, [
      {
        match_description: 'BLUE BOTTLE COFFEE #1842',
        matched_transaction_count: 2,
        existing_rule_id: null,
        existing_rule_enabled: null,
      },
    ]);

    const applied = await db.query(`
      select *
      from save_transaction_rule(
        '${ids.source}',
        '${ids.merchant}',
        '${ids.category}',
        true
      )
    `);
    assert.equal(applied.rows[0].matched_transaction_count, 2);
    assert.equal(applied.rows[0].updated_transaction_count, 2);

    const exactMatches = await db.query(`
      select
        id,
        merchant_id,
        category_id,
        merchant_overridden,
        needs_review
      from transactions
      where id in ('${ids.source}', '${ids.whitespaceVariant}')
      order by id
    `);
    assert.equal(exactMatches.rows.length, 2);
    for (const row of exactMatches.rows) {
      assert.equal(row.merchant_id, ids.merchant);
      assert.equal(row.category_id, ids.category);
      assert.equal(row.merchant_overridden, true);
      assert.equal(row.needs_review, false);
    }

    const similar = await db.query(`
      select merchant_id, category_id, merchant_overridden, needs_review
      from transactions
      where id = '${ids.similar}'
    `);
    assert.deepEqual(similar.rows[0], {
      merchant_id: null,
      category_id: null,
      merchant_overridden: false,
      needs_review: true,
    });

    const rule = await db.query(`
      select
        id,
        match_description_normalized,
        enabled,
        historical_application_count,
        last_applied_at is not null as was_applied
      from transaction_rules
    `);
    assert.deepEqual(rule.rows, [
      {
        id: applied.rows[0].rule_id,
        match_description_normalized: 'blue bottle coffee #1842',
        enabled: true,
        historical_application_count: 2,
        was_applied: true,
      },
    ]);

    await db.exec(`
      update transaction_rules
      set enabled = false
      where id = '${applied.rows[0].rule_id}'
    `);
    const pausedPreview = await db.query(
      `select * from transaction_rule_preview('${ids.source}')`,
    );
    assert.equal(pausedPreview.rows[0].existing_rule_id, applied.rows[0].rule_id);
    assert.equal(pausedPreview.rows[0].existing_rule_enabled, false);
  } finally {
    await db.close();
  }
});

test('cleanup rules reject empty actions and cross-household references', async () => {
  const db = new PGlite();

  try {
    await applyMigrations(db);
    await seedScenario(db);

    await assert.rejects(
      db.query(`
        select *
        from save_transaction_rule('${ids.source}', null, null, true)
      `),
      /Choose a merchant or category/,
    );

    await assert.rejects(
      db.query(`
        select *
        from save_transaction_rule(
          '${ids.source}',
          '${ids.otherMerchant}',
          '${ids.category}',
          true
        )
      `),
      /Merchant does not belong to this household/,
    );

    await assert.rejects(
      db.query(`
        insert into transaction_rules (
          household_id,
          name,
          match_description,
          match_description_normalized,
          merchant_id
        )
        values (
          '${ids.household}',
          'Invalid direct write',
          'SOME BANK TEXT',
          'some bank text',
          '${ids.otherMerchant}'
        )
      `),
      /Merchant does not belong to this household/,
    );

    const privileges = await db.query(`
      select
        has_function_privilege(
          'authenticated',
          'public.save_transaction_rule(uuid,uuid,uuid,boolean)',
          'EXECUTE'
        ) as authenticated_can_execute,
        has_function_privilege(
          'public',
          'public.save_transaction_rule(uuid,uuid,uuid,boolean)',
          'EXECUTE'
        ) as public_can_execute
    `);
    assert.deepEqual(privileges.rows[0], {
      authenticated_can_execute: true,
      public_can_execute: false,
    });
  } finally {
    await db.close();
  }
});
