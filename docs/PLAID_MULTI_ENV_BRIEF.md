# Brief: run Plaid Sandbox and Production side by side in one Supabase project

**Status:** ready to implement  
**Written:** 2026-08-03  
**Backend:** the existing Supabase project `izrgorgsoxkamebddlon`

## 1. Goal

Let one Supabase project serve both Plaid environments at once, so a test
household can run the full Sandbox matrix while real households keep syncing
production banks — without a second project, a second schema, or a second set
of Edge Functions.

## 2. Why this is worth doing

It solves two problems with the same change.

**Sandbox testing is impossible today.** Every Plaid call resolves its
environment from one global secret at request time, so the deployment is in one
mode or the other. That mode is currently **production**: link tokens come back
prefixed `link-production-`, and all 8 `plaid_items` rows belong to one real
household with real institutions (Chase, PNC, Fidelity, Robinhood, E*TRADE).
None of Phase 3's exit criteria — new Item, OAuth institution, update mode,
duplicate Item, sync, webhook, throttled balance refresh, disconnect — can be
exercised without connecting a real bank and incurring a real per-Item charge.

**There is a live correctness hazard.** `plaid_items` records nothing about
which environment an Item came from, and `plaidHost()` falls back to `sandbox`
when `PLAID_ENV` is unset:

```ts
const env = Deno.env.get('PLAID_ENV') ?? 'sandbox';
```

If that secret is ever unset, mistyped, or flipped to enable testing, all 8
production Items keep production access tokens while every call routes to
sandbox. Sync, balance refresh and disconnect all begin returning
`INVALID_ACCESS_TOKEN`, and nothing in the schema can detect the mismatch.

It is worse than a simple outage, because `delete-account` currently treats
that error as "the Item is already gone":

```ts
const alreadyGone =
  error instanceof PlaidApiError &&
  (error.code === 'ITEM_NOT_FOUND' ||
    error.code === 'INVALID_ACCESS_TOKEN');
```

In a mismatched-environment state, deleting an account would erase all local
data while leaving the real bank connections **live at Plaid**, and report
success. That is the exact outcome the function was written to prevent.

Stamping the environment onto each Item fixes the hazard and enables Sandbox
testing in one move.

## 3. Design decision

**The Plaid environment is a property of the household, not of the deployment
and never of the request.**

A household is flagged `sandbox` or `production`. Link tokens derive their
environment from the caller's household, server-side. Each Item is stamped with
the environment it was created in, and every later call for that Item uses the
stamped value.

The client never names an environment, so there is no authorisation question to
reason about and no way for a request to select the wrong one.

## 4. Context you need before starting

- **Work in a git worktree**, never in `/Users/ziyou/Development/Mintea`. Branch
  from `origin/main`, and rebase before opening the PR — `main` moves, several
  agents work on this repo at once.
- **Migrations are append-only.** Never edit or delete a migration that has run
  remotely. `scripts/check-migrations.mjs` runs in CI and will fail the build.
  Add a new dated forward migration.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, tests, Expo Doctor, both
  native exports, and the migration guard. Merging to `main` deploys migrations
  and Edge Functions to the live project, so a mistake here reaches production
  banks.
- **Deno and Docker are not installed** on the dev Mac, so Edge Functions cannot
  be run or type-checked locally. Pure logic must therefore live in
  `supabase/functions/_shared/*.ts` and be unit-tested from `tests/*.test.mjs`,
  which import those `.ts` files directly — see `tests/accountDeletion.test.mjs`
  and `tests/plaidBalanceThrottle.test.mjs` for the established pattern.
- **Never** move `PLAID_SECRET`, the Supabase service-role key, or Item access
  tokens out of the Edge Function environment. Nothing Plaid-secret may appear
  in `EXPO_PUBLIC_*`, `eas.json`, or the app bundle.

## 5. Current state

`supabase/functions/_shared/plaid.ts`:

```ts
export function plaidHost(): string {
  const env = Deno.env.get('PLAID_ENV') ?? 'sandbox';
  ...
}

export async function plaid<T>(path, body): Promise<T> {
  const response = await fetch(`${plaidHost()}${path}`, {
    ...
    body: JSON.stringify({
      client_id: requireEnv('PLAID_CLIENT_ID'),
      secret: requireEnv('PLAID_SECRET'),
      ...body,
    }),
  });
}
```

Call sites to update:

| File | Calls |
|---|---|
| `plaid-link-token/index.ts` | `/link/token/create` |
| `plaid-exchange/index.ts` | `/item/public_token/exchange`, `/item/get`, `/institutions/get_by_id`, `/accounts/get`, `/item/remove` |
| `plaid-sync` via `_shared/sync.ts` | `/transactions/sync`, `/accounts/balance/get` |
| `plaid-remove/index.ts` | `/item/remove` |
| `plaid-webhook/index.ts` | `/webhook_verification_key/get` |
| `delete-account/index.ts` | `/item/remove` |

## 6. Implementation

### 6.1 Migration

New dated migration adding:

- `households.plaid_environment text not null default 'production'`
  with `check (plaid_environment in ('sandbox','production'))`
- `plaid_items.plaid_environment text not null default 'production'`
  with the same check

`default 'production'` backfills the 8 existing Items correctly, which is the
whole reason this is safe to ship before the function changes.

**A column guard is required, not optional.** The existing grant is
table-wide with no column list:

```sql
grant update on households, profiles to authenticated;

create policy households_update on households
  for update to authenticated
  using (id in (select current_household_ids()))
  with check (id in (select current_household_ids()));
```

So without a guard, any signed-in user could `PATCH /households?id=eq.<own>`
and set their own `plaid_environment`. That is not a cross-household breach —
RLS still confines them to their own row — but it defeats the containment
entirely: a sandbox household could promote itself to production and start
creating real, billable Items, and a production household could demote itself
and break its own syncing.

Replace the blanket grant with a column-level one in the same migration.
`households` has four columns — `id`, `name`, `created_at`, `timezone` (added by
`20260728000400_reporting_timezone.sql`) — and clients legitimately write only
`name`:

```sql
revoke update on households from authenticated;
grant update (name) on households to authenticated;
```

This was checked, not assumed: every client reference to `households` in
`packages/core` and `apps/mintea` is a `.select()` — `db/session.ts:50`,
`db/accounts.ts:195` and `db/accounts.ts:218`, all reading `timezone`. Nothing
in the client updates the table at all. `timezone` is written only through the
`set_reporting_timezone` SECURITY DEFINER function, which is unaffected by a
table grant, so narrowing the grant breaks nothing today. The `name` column is
kept writable only so a future rename feature does not need another migration.

Add a regression test in `tests/householdIsolationMigration.test.mjs`: signed in
as `authenticated`, updating `name` succeeds and updating `plaid_environment`
is refused.

### 6.2 Secrets

Add `PLAID_SECRET_SANDBOX` and `PLAID_SECRET_PRODUCTION`. `PLAID_CLIENT_ID` is
shared across environments and stays as it is.

Keep reading `PLAID_SECRET` as a fallback when the environment-specific one is
absent, so the deploy is not ordering-sensitive and nothing breaks if only one
is set at first.

### 6.3 `_shared/plaid.ts`

```ts
export type PlaidEnvironment = 'sandbox' | 'production';

export function plaidHost(env: PlaidEnvironment): string
export async function plaid<T>(path: string, body: Record<string, unknown>, env: PlaidEnvironment): Promise<T>
```

Make `env` a **required** parameter. Delete the `?? 'sandbox'` default
entirely — a missing environment must be a loud failure, not a silent
mis-route. The compiler then finds every call site for you.

Put the environment-resolution helpers (parse/validate an environment string,
choose a secret name, choose a host) in `_shared/plaid.ts` as pure functions
and unit-test them, since the functions themselves cannot run locally.

### 6.4 `_shared/supabase.ts`

Extend `loadItemForCaller` to select and return `plaid_environment` alongside
the access token, so callers cannot forget it.

### 6.5 `plaid-link-token`

Read the caller's `households.plaid_environment` and pass it to `plaid()`.
Ignore any environment supplied in the request body — the client must not be
able to choose.

Sandbox OAuth institutions still need `redirect_uri` (iOS/web) and
`android_package_name` (Android), the same as production. The existing
per-platform logic stays; only the environment routing changes.

### 6.6 `plaid-exchange`

Resolve the environment from the caller's household, use it for every call, and
**write it to the new `plaid_items.plaid_environment` column** when inserting
the Item. This is the step that makes every later call correct.

### 6.7 `plaid-sync`, `plaid-remove`, `_shared/sync.ts`

Read each Item's stored `plaid_environment` and thread it through. A sync that
covers several Items must resolve the environment per Item, not once per
request — a household is single-environment today, but per-Item is what the
column promises and costs nothing.

### 6.8 `plaid-webhook`

This one needs a reorder. It currently verifies the signature **before**
parsing the body:

```ts
const token = req.headers.get('plaid-verification');
const rawBody = await req.text();
if (!token || !(await isFromPlaid(token, rawBody))) return 401;
const body = JSON.parse(rawBody);
// item is only looked up after this
```

`/webhook_verification_key/get` is environment-specific, so the Item must be
resolved first to know which environment's key to fetch:

1. Read the raw body and parse `item_id` **without trusting it**.
2. Look the Item up to get its `plaid_environment`.
3. Verify the signature using that environment's credentials.
4. Only then act.

This is safe. The unverified `item_id` selects *which key to check against*,
nothing more — a forged webhook naming a sandbox Item is still checked against
sandbox's key and still fails. Unknown `item_id` keeps returning
`{ ignored: true }` so Plaid stops retrying, exactly as now.

Also key the `keyCache` by `${environment}:${keyId}`, not `keyId` alone.

### 6.9 `delete-account`

With the environment stamped, a cross-environment call is no longer possible,
so narrow the benign-error set:

- `ITEM_NOT_FOUND` — still benign; the Item really is gone.
- `INVALID_ACCESS_TOKEN` — **no longer benign.** It now indicates a genuine
  problem, and the function should abort rather than delete local data while a
  live connection survives at Plaid.

Update the comment to explain why, and extend
`tests/accountDeletion.test.mjs` to cover it.

## 7. Must not break

The household `951e0b24…` holds **8 real Plaid Items, 47 accounts and ~2,520
real transactions**, syncing daily. Nothing in this change may interrupt them.

- The migration defaults must label those Items `production` — verify after
  applying, before deploying functions.
- Never call `/item/remove` against them while testing.
- If you need to confirm behaviour against a real Item, read-only calls
  (`/item/get`) are acceptable; mutating ones are not.

## 8. Verification

**Unit** — pure environment-resolution helpers in `_shared/plaid.ts`, tested
from `tests/`. Cover: valid values, unknown value rejected, missing value
rejected (no silent default), correct secret name chosen per environment.

**Migration** — extend `tests/householdIsolationMigration.test.mjs`, which
applies the real migrations to PGlite. Assert the new columns exist, default to
`production`, and reject an invalid value.

**Live, once deployed** — flag the `mintea-e2e@example.com` household
(`ead3e9e9-37c9-4f09-9415-3ca62484b233`) as `sandbox`, then from the Android
emulator run: Link with `user_good` / `pass_good` (MFA `1234`), confirm accounts
and transactions import, run a sync, then disconnect. Confirm throughout that
the real household's Items still show `status = good` and keep syncing.

Full suite before the PR: `npm run typecheck`, `npm test`,
`(cd apps/mintea && npx expo-doctor)`, `node scripts/check-migrations.mjs origin/main`.

## 9. Gotchas that will otherwise cost you time

- **`expo-doctor` must run from `apps/mintea`.** From the repo root it finds no
  Expo app and its checks pass without checking anything.
- **`pod install` needs `LANG=en_US.UTF-8`** or CocoaPods dies with
  `Unicode Normalization not appropriate for ASCII-8BIT`.
- **The hosted project's email is rate-limited** to a few per hour (Supabase's
  built-in SMTP). Do not test flows that send email; use
  `POST /auth/v1/admin/generate_link`, which returns the link and sends nothing.
- **`mintea://**` is not in the hosted Auth redirect allow-list**, so links fall
  back to the website. Capture tokens from the redirect's `Location` header and
  deliver them to the app as a deep link instead.
- **On the Android emulator, disable stylus handwriting** —
  `adb shell settings put secure stylus_handwriting_enabled 0` — or text input
  silently goes to a handwriting panel.
- **Do not drive the emulator while Gradle builds.** It produces
  `System UI isn't responding` dialogs that look like app crashes and are not.

## 10. Out of scope

Custom SMTP, the Auth redirect allow-list, Plaid Dashboard registration of
`com.mintea.app`, EAS credentials, and store submission. All are tracked in
[IOS_ANDROID_PLAN.md](IOS_ANDROID_PLAN.md) §7.9 and each needs an account rather
than code.
