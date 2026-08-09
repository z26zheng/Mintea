#!/usr/bin/env python3
"""Disposable Mintea users with fresh Plaid Sandbox households.

This fixture is intentionally general. It creates one or more empty Mintea
users, marks each new household as Plaid Sandbox, and leaves the browser to
link whichever Sandbox institution the test needs. It is useful for auth,
household/RLS, Plaid Link, account, import, and multi-user E2E flows.

The users are password-authenticated only so a maintainer can sign into each
one locally. The password comes from E2E_SANDBOX_PASSWORD and is never printed
or stored by this script.

    export E2E_SANDBOX_PASSWORD="$(openssl rand -base64 24)"
    python3 scripts/e2e_sandbox.py create --run-id smoke-20260809 --count 2
    python3 scripts/e2e_sandbox.py status --run-id smoke-20260809 --count 2
    python3 scripts/e2e_sandbox.py teardown --run-id smoke-20260809 --count 2

Teardown refuses to remove a household while it still has Plaid Items. Link
Sandbox data through the app, then disconnect every institution in the app
before running teardown so the external Plaid Items are revoked first.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


EMAIL_DOMAIN = 'example.com'
RUN_ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,31}$')


def project_ref() -> str:
    linked = pathlib.Path(__file__).resolve().parents[1] / 'supabase/.temp/project-ref'
    if linked.exists():
        return linked.read_text().strip()
    sys.exit('no linked project — run `supabase link` first')


def service_key(ref: str) -> str:
    result = subprocess.run(
        ['npx', '--yes', 'supabase', 'projects', 'api-keys',
         '--project-ref', ref, '--output', 'json'],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit('could not read API keys — is the Supabase CLI logged in?')
    try:
        return next(
            key['api_key'] for key in json.loads(result.stdout)
            if key.get('name') == 'service_role'
        )
    except (KeyError, StopIteration, json.JSONDecodeError):
        sys.exit('Supabase CLI did not return a service-role key')


class Api:
    def __init__(self, ref: str, key: str):
        self.host = f'https://{ref}.supabase.co'
        self.key = key

    def call(self, path: str, method: str = 'GET', body=None):
        headers = {
            'apikey': self.key,
            'Authorization': f'Bearer {self.key}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        if method in {'POST', 'PATCH', 'DELETE'}:
            headers['Prefer'] = 'return=minimal'
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            self.host + path,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors='replace')[:400]
            raise SystemExit(f'{method} {path} -> {error.code}: {detail}') from error

    def rows(self, table: str, params: str):
        return self.call(f'/rest/v1/{table}?{params}')


def validate_run_id(run_id: str) -> str:
    if not RUN_ID_RE.fullmatch(run_id):
        sys.exit('run-id must be lowercase letters, numbers, and hyphens (1-32 chars)')
    return run_id


def validate_count(count: int) -> int:
    if count < 1 or count > 10:
        sys.exit('count must be between 1 and 10')
    return count


def email_for(run_id: str, index: int) -> str:
    return f'mintea-e2e-{run_id}-{index}@{EMAIL_DOMAIN}'


def user_for(api: Api, email: str):
    encoded = urllib.parse.quote(email, safe='')
    users = api.call(f'/auth/v1/admin/users?filter={encoded}').get('users', [])
    return next((user for user in users if user.get('email') == email), None)


def profile_for(api: Api, user_id: str):
    profiles = api.rows('profiles', f'select=id,household_id&id=eq.{user_id}')
    return profiles[0] if profiles else None


def household_for(api: Api, user_id: str):
    for _ in range(20):
        profile = profile_for(api, user_id)
        if profile:
            return profile['household_id']
        time.sleep(0.25)
    raise SystemExit(f'signup trigger did not create a profile for {user_id}')


def users_for_run(api: Api, run_id: str, count: int):
    result = []
    for index in range(1, count + 1):
        email = email_for(run_id, index)
        user = user_for(api, email)
        result.append({'index': index, 'email': email, 'user': user})
    return result


def household_ids_for(api: Api, records):
    households = {}
    for record in records:
        user = record['user']
        if not user:
            continue
        household_id = profile_for(api, user['id'])
        if household_id:
            households.setdefault(household_id['household_id'], []).append(user['id'])
    return households


def active_plaid_items(api: Api, household_id: str):
    return api.rows(
        'plaid_items',
        f'select=id,plaid_environment&household_id=eq.{household_id}',
    )


def cmd_create(api: Api, run_id: str, count: int) -> None:
    password = os.environ.get('E2E_SANDBOX_PASSWORD', '')
    if len(password) < 8:
        sys.exit('set E2E_SANDBOX_PASSWORD to a local password of at least 8 characters')

    records = users_for_run(api, run_id, count)
    existing = [record['email'] for record in records if record['user']]
    if existing:
        sys.exit(f'users already exist for this run — use another run-id or teardown: {", ".join(existing)}')

    created = []
    try:
        for record in records:
            display_name = f'E2E Sandbox {record["index"]} ({run_id})'
            user = api.call('/auth/v1/admin/users', 'POST', {
                'email': record['email'],
                'password': password,
                'email_confirm': True,
                'user_metadata': {
                    'display_name': display_name,
                    'timezone': 'UTC',
                    'e2e_run_id': run_id,
                },
            })
            household_id = household_for(api, user['id'])
            created.append((user, household_id))
            api.call(
                f'/rest/v1/households?id=eq.{household_id}',
                'PATCH',
                {
                    'name': display_name,
                    'plaid_environment': 'sandbox',
                },
            )
            api.call(
                f'/rest/v1/profiles?id=eq.{user["id"]}',
                'PATCH',
                {'display_name': display_name},
            )
    except BaseException:
        # New users have empty households and no Plaid Items, so a partial
        # create can be safely removed before returning the original error.
        for user, household_id in created:
            api.call(f'/rest/v1/households?id=eq.{household_id}', 'DELETE')
            api.call(f'/auth/v1/admin/users/{user["id"]}', 'DELETE')
        raise

    print(f'run_id       {run_id}')
    print('password     E2E_SANDBOX_PASSWORD (not printed)')
    for user, household_id in created:
        print(f'user         {user["email"]}')
        print(f'household    {household_id} (sandbox)')
    print()
    print('Next: start `npm run web`, sign into a user with E2E_SANDBOX_PASSWORD,')
    print("then link a Plaid Sandbox institution with user_good / pass_good inside Link.")


def cmd_status(api: Api, run_id: str, count: int) -> None:
    records = users_for_run(api, run_id, count)
    print(f'run_id {run_id}')
    for record in records:
        user = record['user']
        print(f'\nuser {record["email"]}')
        if not user:
            print('  status       absent')
            continue
        household_id = household_for(api, user['id'])
        members = api.rows(
            'household_members',
            f'select=user_id,role&household_id=eq.{household_id}',
        )
        accounts = api.rows(
            'accounts',
            f'select=id&household_id=eq.{household_id}&deleted_at=is.null',
        )
        items = active_plaid_items(api, household_id)
        households = api.rows(
            'households',
            f'select=plaid_environment&id=eq.{household_id}',
        )
        environment = households[0]['plaid_environment'] if households else 'missing'
        print(f'  status       present')
        print(f'  household    {household_id}')
        print(f'  members      {len(members)}')
        print(f'  accounts     {len(accounts)}')
        print(f'  plaid_items  {len(items)}')
        print(f'  environment  {environment}')


def cmd_teardown(api: Api, run_id: str, count: int) -> None:
    records = users_for_run(api, run_id, count)
    users = [record['user'] for record in records if record['user']]
    if not users:
        print(f'run_id {run_id}: no users found')
        return

    households = household_ids_for(api, records)
    if not households:
        sys.exit('refusing teardown: matching users have no profile/household rows')
    run_user_ids = {user['id'] for user in users}
    for household_id, member_ids in households.items():
        members = api.rows(
            'household_members',
            f'select=user_id&household_id=eq.{household_id}',
        )
        foreign_members = {
            member['user_id'] for member in members
            if member['user_id'] not in run_user_ids
        }
        if foreign_members:
            sys.exit(
                f'refusing to remove household {household_id}: it has other members'
            )
        items = active_plaid_items(api, household_id)
        if items:
            sys.exit(
                f'refusing to remove household {household_id}: disconnect its '
                'Plaid institutions in the app first'
            )

    # Delete households before auth users. accounts.owner_user_id intentionally
    # protects account attribution when an auth user is deleted first.
    for household_id in households:
        api.call(f'/rest/v1/households?id=eq.{household_id}', 'DELETE')
    for user in users:
        api.call(f'/auth/v1/admin/users/{user["id"]}', 'DELETE')

    remaining_users = [
        record['email'] for record in users_for_run(api, run_id, count)
        if record['user']
    ]
    if remaining_users:
        sys.exit(f'teardown incomplete; users remain: {", ".join(remaining_users)}')
    print(f'run_id {run_id}: removed {len(users)} users and {len(households)} households')


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('create', 'status', 'teardown'))
    parser.add_argument('--run-id', required=True, help='lowercase fixture identifier')
    parser.add_argument('--count', type=int, default=1, help='number of disposable users (1-10)')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_id = validate_run_id(args.run_id)
    count = validate_count(args.count)
    ref = project_ref()
    api = Api(ref, service_key(ref))
    if args.command == 'create':
        cmd_create(api, run_id, count)
    elif args.command == 'status':
        cmd_status(api, run_id, count)
    else:
        cmd_teardown(api, run_id, count)


if __name__ == '__main__':
    main()
