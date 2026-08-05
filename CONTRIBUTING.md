# Contributing to Mintea

This guide covers onboarding, day-to-day development, test accounts, E2E testing,
and how to send pull requests. For what the app is and how it's architected, read
[README.md](README.md) first.

## Onboarding

1. **Prerequisites:** Node ≥ 20, npm, and the
   [Supabase CLI](https://supabase.com/docs/guides/cli). For iOS builds you also need
   Xcode 26+ (see the README's toolchain note); Docker only if you want a fully local
   database via `supabase start`. You need your own free
   [Supabase](https://supabase.com) account only if you're taking the self-serve path
   in step 2.
2. **Get credentials.** Shared development credentials live in a private, invite-only
   vault repository. Ask Ziyou (@z26zheng) for access with your GitHub username, then
   clone the vault **beside your Mintea checkout, not inside it**, and run its
   installer:

   ```bash
   npm install                                        # in the Mintea checkout
   cd ..                                              # the PARENT directory
   git clone https://github.com/z26zheng/vault.git
   cd vault/Mintea && ./install.sh
   ```

   That writes `apps/mintea/.env.local` and `supabase/.env.local`, both gitignored.
   In practice only the first matters: it carries the Supabase URL and anon key,
   which is everything normal feature work needs.

   **You almost certainly don't need Plaid or RentCast credentials.** The app
   never sees one — every Plaid call goes through an Edge Function that holds the
   secret server-side, and those are already deployed. `supabase/.env.local`
   feeds only `npm run fn:serve`, which runs the functions locally and needs
   Docker. So it matters just if you're editing an Edge Function locally, or
   deploying functions to your own Supabase project. Expect it to be empty.

   The location matters: the vault's files are named `*.env`, which the Mintea
   `.gitignore` patterns for `.env*` do not match. `vault/` is ignored as a safety
   net, but keeping it outside the checkout entirely is the habit worth having.

   Prefer to stay independent, or waiting on access? You can run entirely on your own
   free Supabase and Plaid sandbox accounts instead; see
   *[Credentials and secrets](#credentials-and-secrets)* below.
3. **Verify the toolchain** before touching code:

   ```bash
   npm run typecheck && npm test && npm run web
   ```

   All three should pass on a clean checkout. If `npm run web` boots to the setup
   screen instead of the sign-in screen, `apps/mintea/.env.local` is missing or empty.

## Test accounts

### App account (Supabase auth)

There is no shared **password-based** developer account. For normal feature work,
create your own account through the app's **Sign up** screen — a plus-address like
`you+mintea-dev@gmail.com` keeps it distinguishable from your real accounts. That
account gets its own household and cannot see another household's data, including the
shared E2E fixture, because RLS keeps them isolated.

The shared development project does have a disposable, passwordless E2E identity,
`mintea-e2e@example.com`, for testing against the existing fixture dataset. A
maintainer generates its one-time sign-in link; there is no password to request or
store in the vault. See *E2E testing* below.

If the confirmation email doesn't arrive: on **your own** project, confirm the user
yourself in the Supabase dashboard under **Authentication → Users**. On the **shared
dev** project, vault access does not include dashboard access, so ask Ziyou to confirm
it (or to add you to the Supabase project if you'll be doing this often).

Two rules that matter more than they look: **never use real financial credentials or
real bank logins in development**, and **never put real personal financial data into
the shared dev project** — everyone with vault access can read it.

### Bank accounts (Plaid sandbox)

Development runs against **Plaid sandbox**, which never touches real banks.

Which environment you get is a property of your **household**, not of a secret or a
setting you control: `households.plaid_environment` decides it, each connection is
stamped with the environment it was created in, and clients cannot write that column
by design. So before you link anything, ask Ziyou to flag your test household as
`sandbox` — otherwise a Link flow would connect a **real bank** and create a real,
billable Item. The shared E2E fixture is already sandbox; a newly created personal
household is not guaranteed to be.

Once your household is on sandbox: when the app opens Plaid Link, pick any
institution and sign in with Plaid's public sandbox test account:

| Field | Value |
|---|---|
| Username | `user_good` |
| Password | `pass_good` |
| MFA code (if asked) | `1234` |

This yields a full set of fake accounts (checking, savings, credit card) with
generated transactions — enough to exercise sync, categorization, and net worth end
to end. Other sandbox personas (error states, MFA variants) are listed in
[Plaid's sandbox docs](https://plaid.com/docs/sandbox/test-credentials/).

### Property valuations (RentCast)

Optional. Without a key, properties are valued by hand and everything else works.
The free tier needs no card — see the README's *Real estate* section.

## Testing

### Unit tests

```bash
npm test
```

Tests run with `node --experimental-strip-types --test tests/*.test.mjs`, importing
TypeScript source directly. That imposes one non-obvious constraint: **a module
imported by a test may not have relative *runtime* imports** — Node's ESM resolver
wants file extensions the type-stripper doesn't add, so they fail with
`ERR_MODULE_NOT_FOUND` on an extensionless path. `import type` is fine (it's stripped
entirely), and package imports (`date-fns`, …) are fine. In practice: keep pure,
testable logic in `packages/core/src/domain/*` free of relative runtime imports, and
re-export it from wrapper modules that need runtime wiring.

### E2E testing

There is no automated E2E harness yet (Playwright for web is the likely first
addition — talk to the maintainer before building one). E2E verification is manual,
against whichever project you set up in onboarding — the shared dev one or your own —
and always Plaid sandbox:

Choose the identity that matches the test:

- **Fresh, isolated data:** sign in with your personal Mintea account, have its
  household confirmed as `sandbox`, then link with Plaid's `user_good` / `pass_good`.
  Plaid generates fake accounts and transactions for that household only.
- **The existing E2E fixture:** ask the maintainer for a one-time link to the
  passwordless `mintea-e2e@example.com` account. The maintainer generates it with
  `python3 scripts/e2e_household.py login`. Treat the link as an authentication
  credential and never paste it into a PR, issue, chat, screenshot, or log. Do not
  run `clone` or `teardown` merely to sign in; those commands create or destroy the
  fixture.

In both cases, `user_good` / `pass_good` belong inside Plaid Link. They are not
Mintea sign-in credentials.

1. **Start the stack:** `npm run web`. For Edge Function work, run them locally with
   `npm run fn:serve` (needs Docker, plus `supabase/.env.local` with Plaid sandbox
   keys — ask if you don't have them). For everything else the functions already
   deployed on that project are fine, and most work never touches them.
2. **Auth:** sign up, sign out, sign back in, reset password.
3. **Plaid flow:** link a sandbox institution with `user_good`/`pass_good`, confirm
   accounts import, run a sync, and check transactions appear with correct signs
   (negative = money left the account).
4. **Core flows:** categorize a transaction, add a manual account and transaction,
   add a property, and confirm the dashboard's net worth and trends update.
5. **Both layouts:** the web app is responsive — check phone width (bottom tabs) and
   ≥768px (side nav), and ideally both themes.

### Native E2E: Android emulator and iOS simulator

> **Confirm your household is on the sandbox environment before you open Plaid Link
> on a device.** This is the one step in this guide that costs real money to get
> wrong: on a production household, Link connects a **real bank** and creates a
> real, billable Plaid Item. Uninstalling the app does not undo it — the Item lives
> at Plaid until someone calls `/item/remove`.

The environment is a property of the household, so it is the same on emulator,
simulator and web — there is no device-level setting and nothing you can toggle
from inside the app. Check it before linking, not after:

```sql
select id, name, plaid_environment from households where id = '…';
```

It must say `sandbox`. If it says `production`, stop and ask Ziyou — clients cannot
change this column by design. A second, independent confirmation is the link token
itself: sandbox sessions return a token starting `link-sandbox-…`, production ones
`link-production-…`.

Then link with Plaid's sandbox credentials (`user_good` / `pass_good`, MFA `1234`)
and run the same flow as the web checklist above: accounts import, transactions
sync with the right signs, balances refresh, disconnect.

Two emulator-specific traps, both of which look like app bugs and are not:

- **Disable stylus handwriting first**, or text input silently goes to a
  handwriting panel instead of the field:
  `adb shell settings put secure stylus_handwriting_enabled 0`
- **Don't drive the emulator while Gradle is building.** It produces
  `System UI isn't responding` dialogs that look like crashes.

### What CI runs (run it yourself before pushing)

```bash
npm run typecheck
npm test
npm run build:web --workspace=@mintea/app
```

If you touched anything the mobile targets compile — components, styles, or
`global.css` — also run the native exports, from `apps/mintea` (they fail from the
repo root):

```bash
cd apps/mintea && npx --yes expo-doctor
cd apps/mintea && npx expo export --platform ios --output-dir /tmp/export-ios
cd apps/mintea && npx expo export --platform android --output-dir /tmp/export-android
```

These exist because a green web build is **not** evidence the mobile apps still
bundle: NativeWind compiles `global.css` for native too, and a stylesheet the web
path never touches once broke both native exports for several commits while
typecheck, tests, and the web build all stayed green.

### Migrations are append-only

An applied migration is immutable — never edit or delete one, add a new migration
instead. CI enforces this by diffing against `origin/main`, because merging a
rewritten migration leaves the hosted database with a schema that matches no file
in the repo.

## Sending pull requests

`main` is protected: **direct pushes are rejected; every change lands through a PR**
with green CI. Force-pushes and deletion of `main` are blocked too.

1. Branch from the latest `origin/main`. If you work on multiple things in parallel
   (or run agents against the repo), use a worktree instead of switching your main
   checkout:

   ```bash
   git worktree add ../mintea-<topic> -b <branch> origin/main
   ```

2. Keep the PR focused — one concern per PR.
3. **Rebase onto `origin/main` immediately before pushing** — not just when you
   start. `main` moves quickly here, and when you resolve conflicts, read what
   actually changed on `main` rather than resolving textually; semantic breaks
   (a convention added mid-flight, a helper moved) pass typecheck and still break
   things.
4. After rebasing, re-run typecheck, tests, and the web build from your branch.
5. Open the PR with a description of *why*, not just *what*. All CI checks must pass
   before merging.

**Merging to `main` deploys.** It applies your migrations to the hosted Supabase
project, deploys the Edge Functions, and promotes the web app to Vercel production —
in that order, because the frontend calls RPCs the migrations add. Review PRs with
that in mind; a PR is the last point at which a schema change is cheap to reconsider.

## Credentials and secrets

### Where credentials live

| What | Where | Sensitivity |
|---|---|---|
| Supabase URL + anon key | The vault → `apps/mintea/.env.local` (local), GitHub Actions secrets (CI/deploy) | Public by design — RLS is the security boundary, not the key |
| `PLAID_CLIENT_ID`, `PLAID_SECRET_SANDBOX`, RentCast key | Supabase Edge Function secrets (hosted, and where they normally live). Handed out per person for local `fn:serve` only | **Secret**, but low blast radius — sandbox touches no real bank |
| `PLAID_SECRET_PRODUCTION` | Supabase Edge Function secrets only. Never the vault, never a laptop | **Secret** — reaches real banks |
| Supabase service-role key | Injected automatically into hosted Edge Functions; `supabase/.env.local` only for local `fn:serve` | **Secret** — bypasses RLS |
| Vercel token / org / project IDs | GitHub Actions secrets | **Secret** |
| Plaid bank access tokens | `plaid_item_secrets` table (RLS enabled, zero policies — unreadable by any client) | **Secret** |

Shared **development** credentials live in a separate private, invite-only repository
(the vault) — never in this one. **No real secret ever appears in this repo, in a PR,
in an issue, or in CI logs.** `.gitignore` excludes `.env` and `.env.*` (except the
`.env.example` templates); if you add a new secret, extend the relevant `.env.example`
with an empty placeholder and a comment, never the value — then add the real value to
the vault.

### Getting access for E2E testing

**The vault (recommended).** Ask Ziyou (@z26zheng) for access with your GitHub
username. It carries the shared dev Supabase project, which is everything the E2E
flow needs — the Plaid and RentCast secrets stay server-side in the deployed Edge
Functions, so you never handle them. Its README covers the rules and the
rotation process. Note that the shared dev database is visible to everyone with
access, so it holds fake data only.

**Or go fully self-serve.** You don't need anyone's credentials, including the
vault's — every service in the dev loop has a free self-signup, and running your own
project means you can't break anyone else's data:

- **Supabase:** create a free project, `supabase db push`, then take the URL and anon
  key from **Project Settings → API**.
- **Plaid sandbox:** free account at [dashboard.plaid.com](https://dashboard.plaid.com);
  sandbox keys are issued immediately, no approval needed. Put the sandbox secret in
  `supabase/.env.local` as `PLAID_SECRET_SANDBOX` and run
  `supabase secrets set --env-file supabase/.env.local` to push it to your project's
  Edge Functions. On your own project, set your household to `sandbox`:
  `update households set plaid_environment = 'sandbox' where id = '…';`
- **RentCast:** free key at [app.rentcast.io/app/api](https://app.rentcast.io/app/api),
  optional.

**Production credentials are not shared with anyone** — not the Supabase service-role
key, not Plaid production keys, not the Vercel token. They are not in the vault
either, and adding them to it would defeat its purpose. If you believe a task requires
one, raise it before starting; there is almost always a sandbox path to the same
result.
