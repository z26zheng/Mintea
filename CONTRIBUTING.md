# Contributing to Mintea

This guide covers onboarding, day-to-day development, test accounts, E2E testing,
and how to send pull requests. For what the app is and how it's architected, read
[README.md](README.md) first.

## Onboarding

1. **Prerequisites:** Node ≥ 20, npm, the [Supabase CLI](https://supabase.com/docs/guides/cli),
   and a free [Supabase](https://supabase.com) account. For iOS builds you also need
   Xcode 26+ (see the README's toolchain note); Docker only if you want a fully local
   database via `supabase start`.
2. **Set up your own dev environment.** Every contributor runs their **own Supabase
   project** — there is no shared dev database, so you can never break another
   contributor's data. Follow the README's *Getting started* section: `npm install`,
   create a Supabase project, `supabase db push`, copy the two `.env.example` files
   to `.env.local` and fill them in.
3. **Verify the toolchain** before touching code:

   ```bash
   npm run typecheck && npm test && npm run web
   ```

   All three should pass on a clean checkout. If `npm run web` boots to the setup
   screen instead of the sign-in screen, `apps/mintea/.env.local` is missing or empty.

## Test accounts

### App account (Supabase auth)

There is no shared test user. Create your own account through the app's **Sign up**
screen against your dev Supabase project — a plus-address like
`you+mintea-dev@gmail.com` keeps it distinguishable from your real accounts. If the
confirmation email doesn't arrive (or you want to skip it), confirm the user manually
in the Supabase dashboard under **Authentication → Users**.

Never use real financial credentials or real bank logins in development.

### Bank accounts (Plaid sandbox)

Development runs against **Plaid sandbox** (`PLAID_ENV=sandbox`), which never touches
real banks. When the app opens Plaid Link, pick any institution and sign in with
Plaid's public sandbox test account:

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
against your own Supabase project and Plaid sandbox:

1. **Start the stack:** `npm run web`. For Edge Function work, run them locally with
   `npm run fn:serve` (needs `supabase/.env.local` with Plaid sandbox keys); otherwise
   deployed functions on your project are fine.
2. **Auth:** sign up, sign out, sign back in, reset password.
3. **Plaid flow:** link a sandbox institution with `user_good`/`pass_good`, confirm
   accounts import, run a sync, and check transactions appear with correct signs
   (negative = money left the account).
4. **Core flows:** categorize a transaction, add a manual account and transaction,
   add a property, and confirm the dashboard's net worth and trends update.
5. **Both layouts:** the web app is responsive — check phone width (bottom tabs) and
   ≥768px (side nav), and ideally both themes.

Before every PR, also run what CI runs: `npm run typecheck`, `npm test`, and
`npm run build:web --workspace=@mintea/app`.

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
5. Open the PR with a description of *why*, not just *what*. CI (typecheck, tests,
   web build) must pass before merging.

## Credentials and secrets

### Where credentials live

| What | Where | Sensitivity |
|---|---|---|
| Supabase URL + anon key | `apps/mintea/.env.local` (local), GitHub Actions secrets (CI/deploy) | Public by design — RLS is the security boundary, not the key |
| Plaid client ID + secret, RentCast key | `supabase/.env.local` (local `fn:serve`), Supabase Edge Function secrets via `supabase secrets set` (hosted) | **Secret** |
| Supabase service-role key | Injected automatically into hosted Edge Functions; `supabase/.env.local` only for local `fn:serve` | **Secret** — bypasses RLS |
| Vercel token / org / project IDs | GitHub Actions secrets | **Secret** |
| Plaid bank access tokens | `plaid_item_secrets` table (RLS enabled, zero policies — unreadable by any client) | **Secret** |

There is no shared credentials vault checked into or referenced by this repo, and
that's deliberate: **no real secret ever appears in the repo, in a PR, in an issue,
or in CI logs.** `.gitignore` excludes `.env` and `.env.*` (except the `.env.example`
templates); if you add a new secret, extend the relevant `.env.example` with an
empty placeholder and a comment, never the value.

### Getting access for E2E testing

You don't need anyone's production credentials to do full E2E testing — every
credential in the dev loop is self-serve:

- **Supabase:** your own free project (you created it during onboarding). URL and
  anon key are under **Project Settings → API**.
- **Plaid sandbox:** create your own free account at
  [dashboard.plaid.com](https://dashboard.plaid.com) — sandbox keys are available
  immediately, no approval needed. Put them in `supabase/.env.local` and run
  `supabase secrets set --env-file supabase/.env.local` to push them to your
  project's Edge Functions. Keep `PLAID_ENV=sandbox`.
- **RentCast:** free key at [app.rentcast.io/app/api](https://app.rentcast.io/app/api),
  optional.

Access to the **production** Supabase project, Plaid production keys, Vercel, and
the GitHub Actions secrets is restricted to the maintainer. If you believe you need
one of these, ask the maintainer directly — anything granted is shared through a
password manager or other secure channel, never through the repo, chat logs, or email.
