import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  household: '00000000-0000-4000-8000-000000000002',
  itemA: '00000000-0000-4000-8000-000000000003',
  itemB: '00000000-0000-4000-8000-000000000004',
  source: '00000000-0000-4000-8000-000000000005',
  destination: '00000000-0000-4000-8000-000000000006',
  savings: '00000000-0000-4000-8000-000000000007',
  sourceOverlapA: '00000000-0000-4000-8000-000000000008',
  sourceOverlapB: '00000000-0000-4000-8000-000000000009',
  sourceUnique: '00000000-0000-4000-8000-000000000010',
  destinationOverlap: '00000000-0000-4000-8000-000000000011',
  transferOut: '00000000-0000-4000-8000-000000000012',
  transferIn: '00000000-0000-4000-8000-000000000013',
  sourceSplit: '00000000-0000-4000-8000-000000000014',
  tag: '00000000-0000-4000-8000-000000000015',
  mergeTransfer: '00000000-0000-4000-8000-000000000016',
  sourceSameAccountTransfer: '00000000-0000-4000-8000-000000000017',
  destinationSameAccountTransfer:
    '00000000-0000-4000-8000-000000000018',
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

    // PGlite supplies gen_random_uuid but not Supabase's pg_trgm extension.
    // The omitted index is unrelated to these migration behavior checks.
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

async function seedMergeScenario(db) {
  await db.exec(`
    alter table auth.users disable trigger on_auth_user_created;
    insert into auth.users (id, email)
    values ('${ids.user}', 'qa@example.com');

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$ select '${ids.user}'::uuid $$;

    insert into households (id, name)
    values ('${ids.household}', 'QA Household');

    insert into household_members (household_id, user_id, role)
    values ('${ids.household}', '${ids.user}', 'owner');

    insert into plaid_items (
      id,
      household_id,
      plaid_item_id,
      plaid_institution_id,
      institution_name
    )
    values
      (
        '${ids.itemA}',
        '${ids.household}',
        'item-a',
        'ins_1',
        'Example Bank'
      ),
      (
        '${ids.itemB}',
        '${ids.household}',
        'item-b',
        'ins_1',
        'Example Bank'
      );

    insert into accounts (
      id,
      household_id,
      plaid_item_id,
      plaid_account_id,
      name,
      official_name,
      mask,
      type,
      subtype,
      currency,
      current_balance_cents,
      is_asset
    )
    values
      (
        '${ids.source}',
        '${ids.household}',
        '${ids.itemA}',
        'account-a',
        'Checking A',
        'TOTAL CHECKING',
        '1234',
        'depository',
        'checking',
        'USD',
        100000,
        true
      ),
      (
        '${ids.destination}',
        '${ids.household}',
        '${ids.itemB}',
        'account-b',
        'Checking B',
        'TOTAL CHECKING',
        '1234',
        'depository',
        'checking',
        'USD',
        100000,
        true
      ),
      (
        '${ids.savings}',
        '${ids.household}',
        '${ids.itemB}',
        'account-c',
        'Savings',
        'SAVINGS',
        '9000',
        'depository',
        'savings',
        'USD',
        50000,
        true
      );

    insert into transactions (
      id,
      household_id,
      account_id,
      date,
      amount_cents,
      currency,
      description,
      original_description,
      notes,
      needs_review
    )
    values
      (
        '${ids.sourceOverlapA}',
        '${ids.household}',
        '${ids.source}',
        '2026-07-01',
        -1000,
        'USD',
        'Favorite coffee',
        'COFFEE SHOP',
        'Keep this note',
        false
      ),
      (
        '${ids.sourceOverlapB}',
        '${ids.household}',
        '${ids.source}',
        '2026-07-01',
        -1000,
        'USD',
        'Coffee',
        'COFFEE SHOP',
        null,
        false
      ),
      (
        '${ids.sourceUnique}',
        '${ids.household}',
        '${ids.source}',
        '2026-07-02',
        -2500,
        'USD',
        'Groceries',
        'GROCERY MART',
        null,
        false
      ),
      (
        '${ids.destinationOverlap}',
        '${ids.household}',
        '${ids.destination}',
        '2026-07-01',
        -1000,
        'USD',
        'Coffee',
        'COFFEE SHOP',
        null,
        true
      ),
      (
        '${ids.mergeTransfer}',
        '${ids.household}',
        '${ids.savings}',
        '2026-07-01',
        1000,
        'USD',
        'Transfer from checking',
        'TRANSFER FROM CHECKING',
        null,
        false
      ),
      (
        '${ids.sourceSameAccountTransfer}',
        '${ids.household}',
        '${ids.source}',
        '2026-07-03',
        -3000,
        'USD',
        'Transfer out',
        'TRANSFER OUT',
        null,
        false
      ),
      (
        '${ids.destinationSameAccountTransfer}',
        '${ids.household}',
        '${ids.destination}',
        '2026-07-03',
        3000,
        'USD',
        'Transfer in',
        'TRANSFER IN',
        null,
        false
      );

    insert into transactions (
      id,
      household_id,
      account_id,
      parent_id,
      date,
      amount_cents,
      currency,
      description,
      needs_review
    )
    values (
      '${ids.sourceSplit}',
      '${ids.household}',
      '${ids.source}',
      '${ids.sourceUnique}',
      '2026-07-02',
      -2500,
      'USD',
      'Groceries',
      false
    );

    insert into tags (id, household_id, name)
    values ('${ids.tag}', '${ids.household}', 'Reviewed');

    insert into transaction_tags (household_id, transaction_id, tag_id)
    values (
      '${ids.household}',
      '${ids.sourceOverlapA}',
      '${ids.tag}'
    );

    insert into account_balances (
      household_id,
      account_id,
      date,
      balance_cents
    )
    values
      ('${ids.household}', '${ids.source}', '2026-07-01', 90000),
      ('${ids.household}', '${ids.source}', '2026-07-02', 100000),
      ('${ids.household}', '${ids.destination}', '2026-07-02', 100000);

    select link_transfer_pair(
      '${ids.sourceOverlapB}',
      '${ids.mergeTransfer}'
    );

    select link_transfer_pair(
      '${ids.sourceSameAccountTransfer}',
      '${ids.destinationSameAccountTransfer}'
    );
  `);
}

test('data-trust migration executes and preserves merge invariants', async () => {
  const db = new PGlite();
  await db.waitReady;

  try {
    await applyMigrations(db);
    await seedMergeScenario(db);

    const preview = (
      await db.query(`
        select *
        from account_merge_preview('${ids.source}', '${ids.destination}')
      `)
    ).rows[0];

    assert.deepEqual(
      {
        source: Number(preview.source_transaction_count),
        overlap: Number(preview.overlapping_transaction_count),
        moved: Number(preview.transaction_count_to_move),
        copied: Number(preview.balance_dates_to_copy),
        sourceItemEmpty: preview.source_item_will_be_empty,
      },
      {
        source: 4,
        overlap: 1,
        moved: 3,
        copied: 1,
        sourceItemEmpty: true,
      },
    );

    await db.query(`
      select *
      from merge_duplicate_accounts('${ids.source}', '${ids.destination}')
    `);

    const sourceAccount = (
      await db.query(`
        select deleted_at, merged_into_account_id, merged_by_user_id
        from accounts
        where id = '${ids.source}'
      `)
    ).rows[0];

    assert.ok(sourceAccount.deleted_at);
    assert.equal(sourceAccount.merged_into_account_id, ids.destination);
    assert.equal(sourceAccount.merged_by_user_id, ids.user);

    const destinationRoots = await db.query(`
      select id
      from transactions
      where account_id = '${ids.destination}'
        and parent_id is null
        and deleted_at is null
      order by id
    `);
    assert.equal(destinationRoots.rows.length, 5);

    const movedSplit = (
      await db.query(`
        select account_id, parent_id
        from transactions
        where id = '${ids.sourceSplit}'
      `)
    ).rows[0];
    assert.deepEqual(movedSplit, {
      account_id: ids.destination,
      parent_id: ids.sourceUnique,
    });

    assert.deepEqual(
      (
        await db.query(`
          select id, account_id, transfer_pair_id
          from transactions
          where id in ('${ids.sourceOverlapB}', '${ids.mergeTransfer}')
          order by id
        `)
      ).rows,
      [
        {
          id: ids.sourceOverlapB,
          account_id: ids.destination,
          transfer_pair_id: ids.mergeTransfer,
        },
        {
          id: ids.mergeTransfer,
          account_id: ids.savings,
          transfer_pair_id: ids.sourceOverlapB,
        },
      ],
    );

    assert.deepEqual(
      (
        await db.query(`
          select id, account_id, transfer_pair_id
          from transactions
          where id in (
            '${ids.sourceSameAccountTransfer}',
            '${ids.destinationSameAccountTransfer}'
          )
          order by id
        `)
      ).rows,
      [
        {
          id: ids.sourceSameAccountTransfer,
          account_id: ids.destination,
          transfer_pair_id: null,
        },
        {
          id: ids.destinationSameAccountTransfer,
          account_id: ids.destination,
          transfer_pair_id: null,
        },
      ],
    );

    const archivedOverlap = await db.query(`
      select id
      from transactions
      where account_id = '${ids.source}'
        and deleted_at is not null
    `);
    assert.equal(archivedOverlap.rows.length, 1);

    const reconciled = (
      await db.query(`
        select description, notes, needs_review
        from transactions
        where id = '${ids.destinationOverlap}'
      `)
    ).rows[0];
    assert.deepEqual(reconciled, {
      // Destination display edits win; source notes/tags still fill missing
      // metadata without overwriting the kept account's version.
      description: 'Coffee',
      notes: 'Keep this note',
      needs_review: false,
    });

    assert.equal(
      (
        await db.query(`
          select count(*)::integer as count
          from transaction_tags
          where transaction_id = '${ids.destinationOverlap}'
            and tag_id = '${ids.tag}'
        `)
      ).rows[0].count,
      1,
    );

    const balanceDates = await db.query(`
      select to_char(date, 'YYYY-MM-DD') as day
      from account_balances
      where account_id = '${ids.destination}'
      order by date
    `);
    assert.deepEqual(
      balanceDates.rows.map((row) => row.day),
      ['2026-07-01', '2026-07-02'],
    );
  } finally {
    await db.close();
  }
});

test('transfer matching is symmetric, guarded, and reversible', async () => {
  const db = new PGlite();
  await db.waitReady;

  try {
    await applyMigrations(db);
    await seedMergeScenario(db);

    await db.exec(`
      insert into transactions (
        id,
        household_id,
        account_id,
        date,
        amount_cents,
        currency,
        description,
        needs_review
      )
      values
        (
          '${ids.transferOut}',
          '${ids.household}',
          '${ids.destination}',
          '2026-07-10',
          -50000,
          'USD',
          'Transfer out',
          false
        ),
        (
          '${ids.transferIn}',
          '${ids.household}',
          '${ids.savings}',
          '2026-07-11',
          50000,
          'USD',
          'Transfer in',
          false
        );
    `);

    assert.deepEqual(
      (
        await db.query(`
          select id, days_apart
          from transfer_candidates('${ids.transferOut}')
        `)
      ).rows,
      [{ id: ids.transferIn, days_apart: 1 }],
    );

    await db.query(`
      select link_transfer_pair('${ids.transferOut}', '${ids.transferIn}')
    `);

    assert.deepEqual(
      (
        await db.query(`
          select id, transfer_pair_id
          from transactions
          where id in ('${ids.transferOut}', '${ids.transferIn}')
          order by id
        `)
      ).rows,
      [
        { id: ids.transferOut, transfer_pair_id: ids.transferIn },
        { id: ids.transferIn, transfer_pair_id: ids.transferOut },
      ],
    );

    await db.exec(`
      update transactions
      set description = 'Renamed transfer'
      where id = '${ids.transferOut}'
    `);
    assert.equal(
      (
        await db.query(`
          select transfer_pair_id
          from transactions
          where id = '${ids.transferOut}'
        `)
      ).rows[0].transfer_pair_id,
      ids.transferIn,
    );

    // Amount/date/account/reporting-state edits invalidate the identity and
    // therefore unlink both sides in the same database transaction.
    await db.exec(`
      update transactions
      set amount_cents = -51000
      where id = '${ids.transferOut}'
    `);
    assert.ok(
      (
        await db.query(`
          select transfer_pair_id
          from transactions
          where id in ('${ids.transferOut}', '${ids.transferIn}')
        `)
      ).rows.every((row) => row.transfer_pair_id === null),
    );

    await db.exec(`
      update transactions
      set amount_cents = -50000
      where id = '${ids.transferOut}'
    `);
    await db.query(`
      select link_transfer_pair('${ids.transferOut}', '${ids.transferIn}')
    `);
    await db.query(`select unlink_transfer_pair('${ids.transferOut}')`);

    assert.ok(
      (
        await db.query(`
          select transfer_pair_id
          from transactions
          where id in ('${ids.transferOut}', '${ids.transferIn}')
        `)
      ).rows.every((row) => row.transfer_pair_id === null),
    );

    await assert.rejects(
      db.exec(`
        update transactions
        set transfer_pair_id = '${ids.transferIn}'
        where id = '${ids.transferOut}'
      `),
      /Transfer pair integrity check failed/,
    );

    await db.exec(`
      update transactions
      set amount_cents = -49000
      where id = '${ids.transferOut}'
    `);
    await assert.rejects(
      db.query(`
        select link_transfer_pair('${ids.transferOut}', '${ids.transferIn}')
      `),
      /not a valid transfer pair/,
    );
  } finally {
    await db.close();
  }
});
