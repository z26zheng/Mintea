# Mintea 🍵

A personal finance app in the mold of Monarch Money. One universal codebase runs on
**web, iOS and Android**; Supabase provides auth and the database; Plaid provides bank
data. There is no separate backend server to deploy.

> **Status:** Phase 1, web-first. Accounts, transactions, categories, net worth and
> email/password auth are implemented end to end. The codebase is universal, so iOS and
> Android build from the same source once the toolchain allows (see below). Basic
> balance and net-cash-flow trends are available; budgets, full reports, goals and
> investments are planned — see
> [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

The web app is responsive: a bottom tab bar and single-column layout on phones, a
232px side navigation and centred content column from 768px up. Both themes follow the
OS setting.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project and apply the schema

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`supabase db push` applies both migrations: the schema, then row level security, the
signup trigger, and the default category tree.

### 3. Point the app at it

```bash
cp apps/mintea/.env.example apps/mintea/.env.local
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**. Both are public by design — the anon key grants nothing
without a signed-in session, because every table is behind RLS.

Without this file the app boots to a setup screen rather than failing, so you can run
`npm run web` right away to check the toolchain.

### 4. Deploy the Edge Functions

```bash
cp supabase/.env.example supabase/.env.local     # add your Plaid + RentCast keys
supabase secrets set --env-file supabase/.env.local
supabase functions deploy
```

Optional at first — you can add manual accounts, transactions and properties
without either key.

### 5. Run it

```bash
npm run web
```

```bash
npm run ios
```

```bash
npm run android
```

`npm run web` works immediately. The native targets need a development build
(`npx expo prebuild && npx expo run:ios`) because the Plaid SDK ships native code —
Expo Go can't load it.

> **iOS needs Xcode 26 or newer.** Expo SDK 57's `expo-modules-jsi` package declares
> `swift-tools-version: 6.2`, which ships with Xcode 26. On Xcode 16.x the build fails
> during the `Build ExpoModulesJSI xcframework` phase with:
>
> ```
> package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.0.0
> ```
>
> `expo prebuild` and `pod install` both succeed on Xcode 16 — only the compile step
> is blocked.

---

## Architecture

```
apps/mintea/       Expo app — the only place with UI or platform APIs
packages/core/     Domain logic, typed queries, money math. No UI, no platform imports.
supabase/
  migrations/      Schema + RLS
  functions/       The only server-side code: five Plaid Edge Functions
```

**The rule that keeps this portable:** `packages/core` may never import `react-native`,
`expo-*`, or `react-dom`. Platform differences live in `apps/mintea/lib`, or in
`.web.tsx` / `.tsx` file pairs that Metro resolves per target — `components/PlaidLink.tsx`
(native SDK) and `PlaidLink.web.tsx` (Plaid Link JS) are the worked example.

### Why there is any server-side code

Plaid's `client_secret` and per-Item `access_token` cannot ship in a frontend bundle —
they are extractable from any web bundle or decompiled APK, and they grant access to
every connected account. So five small Deno functions hold them:

| Function | Does |
|---|---|
| `plaid-link-token` | Creates the Link token (and update-mode tokens for re-auth) |
| `plaid-exchange` | Trades the public token for an access token, imports accounts |
| `plaid-sync` | `/transactions/sync` plus cooldown-guarded real-time balances |
| `plaid-webhook` | Syncs transactions and free cached balance snapshots |
| `plaid-remove` | Disconnects an Item |

Everything else — reading transactions, editing categories, adding accounts — goes
straight from the app to Postgres over PostgREST, protected by RLS.

Plaid's real-time `/accounts/balance/get` endpoint is isolated to authenticated
user refreshes and limited to once per Item per hour with an atomic database claim.
Transaction webhooks use the free cached `/accounts/get` endpoint instead, preserving
automatic balance history without turning Plaid's background polling into per-request
Balance charges.

### Security

- Access tokens live in `plaid_item_secrets`: RLS enabled, **zero policies**, so no client
  JWT can read a row. Only the service role, which exists solely as an Edge Function
  secret, can reach it.
- Plaid webhooks verify the ES256 `Plaid-Verification` JWT and check its
  `request_body_sha256` claim against the body actually received, so the one
  publicly-reachable function can't be spoofed.
- Every table is scoped by `household_id` and gated on household membership.

### Conventions worth knowing

- **Money is integer cents** (`amount_cents bigint`). No floats anywhere.
- **Negative means money left the account.** Plaid's sign is the opposite and is flipped
  once, at ingest.
- **Account balances store their signed contribution to net worth** — a credit card with
  $500 owed stores `-50000` — so net worth is a plain `SUM`. The UI re-derives "owed"
  from `is_asset`.
- **Every row carries `household_id`**, even in single-user mode, so partner sharing is a
  later feature rather than a migration that rewrites every RLS policy.

---

## Real estate

A property is an ordinary account of type `real_estate` with a companion
`property_details` row holding its address and valuation state — so it flows
through net worth, the balance history and the accounts list with no special
cases. Its mortgage stays a separate `loan` account, which is what makes equity
visible rather than netted away.

**Valuations come from [RentCast](https://www.rentcast.io/api).** Zillow's
Zestimate API was retired in 2021 and its replacement is MLS-members-only, so
RentCast is the only per-address AVM with instant self-serve access. The free
tier is 50 calls/month with no card, and one call per property per month keeps
you well inside it:

```bash
supabase secrets set RENTCAST_API_KEY=…
```

Without the key everything still works — properties are just valued by hand.

Two behaviours worth knowing:

- **Manual wins.** Typing a value flips the property to `manual`, and the bulk
  refresh then leaves it alone. Only an explicit "Refresh valuation" moves it
  back to automatic. An estimate should never silently overwrite a number the
  owner chose.
- **History is reconstructed.** Given a purchase price and date, the value curve
  is backfilled monthly at the growth rate implied by the two endpoints.
  Otherwise a house bought in 2019 would draw a flat line across the whole net
  worth chart and then jump on the day it was added. The curve is deliberately
  smooth — it does not claim to know which years were hot. Swapping in a
  ZIP-level index (Zillow ZHVI or FHFA HPI, both free) would replace only
  `interpolateValuationHistory` in `packages/core/src/domain/property.ts`.

Coverage is US-only, and note that storing a home address makes the database
meaningfully more sensitive than it was — RLS covers it, but the stakes on that
table are higher.

## Deployment

CI runs on every push and PR to `main`: typecheck both workspaces, build the web
bundle, upload it as an artifact. It needs no secrets and is green out of the box.

Deployment to Vercel is wired but **inactive until you add three repository secrets**,
because only you can mint them. Until then the deploy job logs a notice and passes
rather than failing the run.

1. Create the project once from the repo root:

```bash
npx vercel link
```

2. Read the ids it writes and add them to GitHub:

```bash
gh secret set VERCEL_TOKEN        # from vercel.com/account/tokens
gh secret set VERCEL_ORG_ID       # orgId in .vercel/project.json
gh secret set VERCEL_PROJECT_ID   # projectId in .vercel/project.json
```

3. Add the client config so the deployed app can reach Supabase. These are public
   values — RLS is the security boundary, not the anon key:

```bash
gh secret set EXPO_PUBLIC_SUPABASE_URL
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY
```

`vercel.json` already points Vercel at the monorepo build (`apps/mintea/dist`) and
rewrites unknown paths to `index.html`, which an Expo Router SPA needs for deep links
like `/transactions` to survive a hard refresh.

Finally, add your deployed origin to Supabase → Authentication → URL Configuration, or
the confirmation and password-reset emails will link back to localhost.

## Commands

| Command | Does |
|---|---|
| `npm run web` | Dev server at http://localhost:8081 |
| `npm run ios` / `npm run android` | Native development build |
| `npm run typecheck` | Typechecks both workspaces |
| `npm run db:push` | Applies migrations |
| `npm run db:types` | Regenerates `packages/core/src/types/database.ts` from the live schema |
| `npm run fn:serve` | Runs Edge Functions locally |
| `npm run fn:deploy` | Deploys Edge Functions |
| `npm test` | Unit tests plus executable migration tests (PGlite, no Docker) |

## End-to-end testing

Browser testing needs to create, edit and delete records, which is not something to do
against the real household. A hand-built fixture household is the usual answer, but it
never resembles production closely enough to catch the bugs that matter — an empty
filter menu, a query that only breaks past a few hundred rows, a split whose parent
sits on another page.

Instead, copy the real household into a throwaway user, test against the copy, and
delete it afterwards:

```bash
python3 scripts/e2e_household.py clone      # create the test user and copy into it
python3 scripts/e2e_household.py login      # print a one-time sign-in link
python3 scripts/e2e_household.py status     # what exists right now
python3 scripts/e2e_household.py teardown   # remove the user and its household
```

Authentication comes from the Supabase CLI (`supabase login`) — the same credential CI
uses. Nothing is written to disk, and the test user never gets a password: sign-in is a
one-time admin link, so there is no credential to leak or commit.

`plaid_item_secrets` is deliberately not copied. It holds Plaid access tokens under RLS
with no policies, so copying it would let the test household drive real syncs against
live Items. The copied `plaid_items` therefore carry no secret and any sync fails
cleanly. Two columns are prefixed rather than copied — `plaid_items.plaid_item_id` and
`transactions.plaid_transaction_id` are unique across the whole table rather than per
household, so a verbatim copy collides.

Run `teardown` when you are done. `clone` refuses to run while a test user already
exists, and `teardown` refuses to touch a household shared with another user.

### Notes

- Local Supabase (`supabase start`) needs Docker. Without it, develop against a hosted
  project — the flow above assumes that.
- If `pod install` fails with `Unicode Normalization not appropriate for ASCII-8BIT`,
  your shell locale isn't UTF-8. Run it as
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`.
