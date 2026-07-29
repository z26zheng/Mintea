#!/usr/bin/env python3
"""
Disposable end-to-end test household.

Browser testing needs to create, edit and delete records. Doing that against
the real household is not acceptable, and a hand-built fixture household never
resembles production closely enough to catch the bugs that matter — an empty
filter menu, a query that only breaks past a few hundred rows, a split whose
parent is on another page.

So: copy the real household into a throwaway user, test against the copy, and
delete it afterwards.

    python3 scripts/e2e_household.py clone      # create + copy
    python3 scripts/e2e_household.py login      # print a sign-in link
    python3 scripts/e2e_household.py status     # what exists right now
    python3 scripts/e2e_household.py teardown   # remove it

Authentication comes from the Supabase CLI (`supabase login`), which is also
what CI uses. Nothing is written to disk and no password is ever created — the
test user signs in through a one-time admin link.

Deliberately NOT copied: plaid_item_secrets. It holds Plaid access tokens under
RLS with no policies, so copying it would let the test household drive real
syncs against live Items. The copied plaid_items therefore have no secret, and
any sync attempt fails cleanly instead of reaching Plaid.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

TEST_EMAIL = 'mintea-e2e@example.com'

# Prefixed rather than copied: these two are unique across the whole table
# rather than per household, so a verbatim copy collides.
PREFIX = 'e2e_'

# Parents before children.
CLONE_ORDER = [
    'category_groups', 'categories', 'merchants', 'plaid_items',
    'accounts', 'account_balances', 'transactions', 'property_details',
]

# Tables whose ids other rows point at, so they need a stable old -> new map.
MAPPED = ['category_groups', 'categories', 'merchants', 'plaid_items',
          'accounts', 'transactions']

FOREIGN_KEYS: dict[str, dict[str, str]] = {
    'categories': {'group_id': 'category_groups'},
    'merchants': {'default_category_id': 'categories'},
    'accounts': {'plaid_item_id': 'plaid_items',
                 'merged_into_account_id': 'accounts'},
    'account_balances': {'account_id': 'accounts'},
    'transactions': {'account_id': 'accounts', 'category_id': 'categories',
                     'merchant_id': 'merchants', 'parent_id': 'transactions',
                     'transfer_pair_id': 'transactions'},
    'property_details': {'account_id': 'accounts'},
}

# Child-first, for teardown.
TEARDOWN_ORDER = [
    'transaction_tags', 'tags', 'transaction_rules', 'property_details',
    'transactions', 'account_balances', 'accounts', 'plaid_items',
    'merchants', 'categories', 'category_groups',
]


def project_ref() -> str:
    linked = pathlib.Path(__file__).resolve().parents[1] / 'supabase/.temp/project-ref'
    if linked.exists():
        return linked.read_text().strip()
    sys.exit('no linked project — run `supabase link` first')


REF = project_ref()
HOST = f'https://{REF}.supabase.co'


def service_key() -> str:
    result = subprocess.run(
        ['npx', '--yes', 'supabase', 'projects', 'api-keys',
         '--project-ref', REF, '--output', 'json'],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f'could not read API keys — is the CLI logged in?\n{result.stderr}')
    return next(k['api_key'] for k in json.loads(result.stdout)
                if k.get('name') == 'service_role')


def call(key, path, method='GET', body=None, extra_headers=None):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}',
               'Accept': 'application/json', 'Content-Type': 'application/json'}
    headers.update(extra_headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(HOST + path, data=data, headers=headers,
                                 method=method)
    try:
        with urllib.request.urlopen(req) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise SystemExit(
            f'{method} {path} -> {error.code}: {error.read().decode()[:400]}')


def select_all(key, table, params=''):
    """Pages past PostgREST's row cap."""
    rows, offset, page = [], 0, 1000
    while True:
        sep = '&' if params else ''
        chunk = call(key, f'/rest/v1/{table}?{params}{sep}limit={page}&offset={offset}')
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        offset += page


def find_test_user(key):
    listing = call(key, f'/auth/v1/admin/users?filter={TEST_EMAIL}')
    for user in listing.get('users', []):
        if user.get('email') == TEST_EMAIL:
            return user
    return None


def real_household(key) -> tuple[str, dict]:
    """The one household that is not the test clone."""
    test_user = find_test_user(key)
    test_hh = None
    if test_user:
        rows = call(key, f'/rest/v1/profiles?select=household_id&id=eq.{test_user["id"]}')
        test_hh = rows[0]['household_id'] if rows else None

    households = call(key, '/rest/v1/households?select=id,name,timezone')
    real = [h for h in households if h['id'] != test_hh]
    if len(real) != 1:
        sys.exit(f'expected exactly one real household, found {len(real)}')
    return real[0]['id'], real[0]


def cmd_status(key) -> None:
    user = find_test_user(key)
    src, _ = real_household(key)
    print(f'project        {REF}')
    print(f'real household {src}')
    if not user:
        print(f'test user      none ({TEST_EMAIL} does not exist)')
        return
    rows = call(key, f'/rest/v1/profiles?select=household_id&id=eq.{user["id"]}')
    dst = rows[0]['household_id'] if rows else None
    print(f'test user      {TEST_EMAIL} ({user["id"]})')
    print(f'test household {dst}')
    if dst:
        print()
        for table in CLONE_ORDER + ['tags', 'transaction_tags']:
            column = 'account_id' if table == 'property_details' else 'id'
            n = len(select_all(key, table, f'select={column}&household_id=eq.{dst}'))
            print(f'  {table:20} {n:6}')


def cmd_clone(key) -> None:
    if find_test_user(key):
        sys.exit(f'{TEST_EMAIL} already exists — run teardown first')

    src, source = real_household(key)
    print(f'copying household {src}')

    data = {table: select_all(key, table, f'select=*&household_id=eq.{src}')
            for table in CLONE_ORDER}
    profile = call(key, f'/rest/v1/profiles?select=*&household_id=eq.{src}')[0]

    user = call(key, '/auth/v1/admin/users', 'POST', {
        'email': TEST_EMAIL,
        'email_confirm': True,
        # No password at all. Sign-in is via `login`, so there is no credential
        # to leak, reuse, or accidentally commit.
        'user_metadata': {'display_name': 'E2E (test)',
                          'timezone': source.get('timezone') or 'UTC'},
    })
    uid = user['id']

    profiles = call(key, f'/rest/v1/profiles?select=*&id=eq.{uid}')
    if not profiles:
        sys.exit('signup trigger did not create a profile')
    dst = profiles[0]['household_id']
    if dst == src:
        sys.exit('refusing to write into the source household')

    # The signup trigger seeds default categories; drop them so the copy is exact.
    call(key, f'/rest/v1/categories?household_id=eq.{dst}', 'DELETE')
    call(key, f'/rest/v1/category_groups?household_id=eq.{dst}', 'DELETE')

    # Pre-generate every new id so self-references (a split's parent, a merged
    # account) resolve without a second pass.
    idmap = {table: {row['id']: str(uuid.uuid4()) for row in data[table]}
             for table in MAPPED}

    for table in CLONE_ORDER:
        rows = []
        for row in data[table]:
            new = dict(row)
            if 'id' in new:
                new['id'] = (idmap[table][row['id']] if table in MAPPED
                             else str(uuid.uuid4()))
            new['household_id'] = dst
            for column, target in FOREIGN_KEYS.get(table, {}).items():
                old = row.get(column)
                new[column] = idmap[target].get(old) if old else None

            if table == 'plaid_items':
                new['plaid_item_id'] = PREFIX + new['plaid_item_id']
                new['transactions_cursor'] = None  # a real cursor means nothing here
            if table == 'transactions' and new.get('plaid_transaction_id'):
                new['plaid_transaction_id'] = PREFIX + new['plaid_transaction_id']

            assert new['household_id'] == dst, 'row escaped the test household'
            rows.append(new)

        for i in range(0, len(rows), 500):
            call(key, f'/rest/v1/{table}', 'POST', rows[i:i + 500],
                 {'Prefer': 'return=minimal'})
        print(f'  {table:20} {len(rows):6}')

    call(key, f'/rest/v1/profiles?id=eq.{uid}', 'PATCH',
         {'currency': profile.get('currency'), 'timezone': profile.get('timezone')},
         {'Prefer': 'return=minimal'})

    print(f'\ntest user {TEST_EMAIL} ({uid})')
    print(f'household {dst}')
    print('\nnext: python3 scripts/e2e_household.py login')


def cmd_login(key) -> None:
    if not find_test_user(key):
        sys.exit(f'{TEST_EMAIL} does not exist — run clone first')
    result = call(key, '/auth/v1/admin/generate_link', 'POST',
                  {'type': 'magiclink', 'email': TEST_EMAIL})
    print(result['action_link'])
    print('\nOne-time link. If the app drops the session on redirect, exchange '
          'the hash directly:')
    print(f'  token_hash = {result["hashed_token"]}')


def cmd_teardown(key) -> None:
    user = find_test_user(key)
    if not user:
        print(f'{TEST_EMAIL} not found — nothing to remove')
        return

    uid = user['id']
    profiles = call(key, f'/rest/v1/profiles?select=household_id&id=eq.{uid}')
    dst = profiles[0]['household_id'] if profiles else None

    if dst:
        others = call(key, f'/rest/v1/profiles?select=household_id&id=neq.{uid}')
        if dst in {p['household_id'] for p in others}:
            sys.exit(f'refusing: household {dst} is shared with another user')
        for table in TEARDOWN_ORDER:
            call(key, f'/rest/v1/{table}?household_id=eq.{dst}', 'DELETE', None,
                 {'Prefer': 'return=minimal'})
        print(f'cleared household {dst}')

    call(key, f'/auth/v1/admin/users/{uid}', 'DELETE')
    print(f'deleted user {uid}')

    if dst:
        call(key, f'/rest/v1/households?id=eq.{dst}', 'DELETE', None,
             {'Prefer': 'return=minimal'})
        print(f'deleted household {dst}')


COMMANDS = {'clone': cmd_clone, 'login': cmd_login,
            'status': cmd_status, 'teardown': cmd_teardown}


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        sys.exit(f'usage: {sys.argv[0]} {{{"|".join(COMMANDS)}}}')
    COMMANDS[sys.argv[1]](service_key())


if __name__ == '__main__':
    main()
