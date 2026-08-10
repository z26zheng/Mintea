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

**Contributing?** [CONTRIBUTING.md](CONTRIBUTING.md) covers onboarding, test
accounts (Plaid sandbox), E2E testing, the PR workflow, and how credentials are
stored and accessed.

## Worktree-first development

All feature work and verification — including code, documentation, tests, and
browser E2E testing — must happen in a dedicated Git worktree. Treat the primary
`main` checkout as read-only and keep it clean; use it only to inspect or
synchronize branches. Start each task from the latest remote branch:

```bash
git fetch origin
git worktree add ../mintea-<topic> -b codex/<topic> origin/main
cd ../mintea-<topic>
```

Open the pull request from that worktree and merge through the normal PR flow.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Get credentials

Two ways. **If you have access to the credentials vault** (a private, invite-only
repository — ask @z26zheng), clone it *beside* this checkout, never inside it, and
run its installer:

```bash
git clone https://github.com/z26zheng/vault.git    # from the PARENT directory
cd vault/Mintea && ./install.sh
```

That writes both `.env.local` files for you, and steps 3 and 4 are already done —
skip to *Run it*.

**Otherwise, set up your own project**, which needs no permission from anyone and
keeps your data entirely separate. Continue with steps 3 and 4.

### 3. Create a Supabase project and apply the schema

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`supabase db push` applies both migrations: the schema, then row level security, the
signup trigger, and the default category tree.

### 4. Point the app at it

```bash
cp apps/mintea/.env.example apps/mintea/.env.local
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**. Both are public by design — the anon key grants nothing
without a signed-in session, because every table is behind RLS.

Without this file the app boots to a setup screen rather than failing, so you can run
`npm run web` right away to check the toolchain.

### 5. Deploy the Edge Functions

```bash
cp supabase/.env.example supabase/.env.local     # add your Plaid + RentCast keys
supabase secrets set --env-file supabase/.env.local
supabase functions deploy
```

Only for your **own** project. If you're using the shared one, its functions are
already deployed with these secrets and you never need them locally — the app
talks to the functions, and only the functions talk to Plaid.

Optional at first — you can add manual accounts, transactions and properties
without either key.

Use `PLAID_SECRET_SANDBOX`, not a production secret. Which Plaid environment a call
uses is decided by the household (`households.plaid_environment`), not by anything in
that file, so also set your own household to sandbox before linking anything —
otherwise Link connects a **real bank** and creates a real, billable Item:

```sql
update households set plaid_environment = 'sandbox' where id = '…';
```

### Transactional email

Mintea uses Supabase Auth to create confirmation, recovery, email-change and
security-notification emails. Production delivery goes through Resend; the
built-in Supabase sender is only suitable for local testing.

1. Verify Mintea's sending domain in Resend (SPF and DKIM; add DMARC too).
2. In **Supabase → Authentication → SMTP Settings**, enable custom SMTP and use
   Resend's SMTP credentials (`smtp.resend.com`, port `465`, username `resend`,
   and a Resend API key as the password).
3. Publish the version-controlled templates to hosted Supabase. The paths in
   `supabase/config.toml` apply the same templates to local Supabase/Inbucket:

```bash
SUPABASE_PROJECT_REF=YOUR_PROJECT_REF npm run email:templates:push
```

The command uses `SUPABASE_ACCESS_TOKEN`, validates every local template, and
updates only the corresponding subjects, HTML bodies and security-notification
flags through the Supabase Management API.
4. Keep local development and mock E2E in log-only mode:

```bash
EMAIL_DELIVERY_MODE=log
```

This is the default and records delivery metadata without contacting Resend.
The disposable fixture identity `mintea-e2e@example.com` is intentionally
undeliverable by design; log-only mode is not a bounce or suppression list.
Set `EMAIL_DELIVERY_MODE=send` only in a controlled environment that has a
verified sender domain, then add the server-side secrets:

```bash
supabase secrets set EMAIL_DELIVERY_MODE=send
supabase secrets set RESEND_API_KEY=…
supabase secrets set EMAIL_FROM="Mintea <notifications@YOUR_DOMAIN>"
supabase secrets set EMAIL_REPLY_TO="support@YOUR_DOMAIN"
```

Never put the Resend key in `apps/mintea/.env.local` or an `EXPO_PUBLIC_*`
variable. Application emails use `supabase/functions/_shared/email.ts`, which
sends both HTML and plaintext and requires an idempotency key for safe retries.
The welcome message is the only current direct-send exception: it is an account
onboarding message, not a notification about household financial state. Any
future budget, connection-health, import, or other product alert must be generated
from P11's in-app notification store and use email only as a delivery channel.
The authenticated `email-welcome` function is the first consumer: it resolves
the recipient from the caller's Supabase account, so clients cannot use it to
send arbitrary email.

P11 product alerts use the same server-only transport through the durable
`notifications` and `notification_deliveries` tables. The local browser fixture
for the first alert paths is available at `/dev/notifications`: trigger the
over-budget/unallocated-income path, trigger family-member joined and left, then
queue the unread alerts. The page uses mock data and reports the outbox keys in
log-only mode; it does not contact Resend or deliver to Gmail. Real alert email
requires the notification migration and Edge Functions to be deployed in a
controlled send-configured environment. The page also exposes a separate live
evaluator/dispatcher control for an authenticated development session; use that
only when provider delivery is intentionally enabled.

### 6. Run it

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

### Sandbox and production, side by side

**The Plaid environment is a property of the household, never of the deployment
and never of a request.** `households.plaid_environment` decides which
environment a new connection is made in, and each Item stores the environment it
was created in, so every later sync, balance refresh and disconnect uses the same
one. One project therefore serves both at once: a test household can run the full
Plaid Sandbox matrix while real households keep syncing production banks.

To move a household, as the operator:

```sql
update households set plaid_environment = 'sandbox' where id = '…';
```

Clients cannot write that column — the `authenticated` grant covers `name` only —
so a household can neither promote itself into creating real, billable Items nor
demote itself and break its own syncing.

Because it lives on the household, the environment is the same on web, the Android
emulator and the iOS simulator; there is no device-level setting. **Confirm it says
`sandbox` before opening Plaid Link on any of them** — on a production household
Link connects a real bank and creates a real, billable Item, and uninstalling the
app does not undo that. The link token is the second confirmation: sandbox sessions
return `link-sandbox-…`, production ones `link-production-…`.

Set `PLAID_SECRET_SANDBOX` and `PLAID_SECRET_PRODUCTION` as needed;
`PLAID_CLIENT_ID` is shared. The older single `PLAID_SECRET` still works as a
fallback. There is no `PLAID_ENV`: a deployment-wide switch is what made Sandbox
testing impossible, and its `sandbox` default meant one unset secret could point
production access tokens at the wrong host and make every call fail as though the
connection were already gone.

### Security

- Access tokens live in `plaid_item_secrets`: RLS enabled, **zero policies**, so no client
  JWT can read a row. Only the service role, which exists solely as an Edge Function
  secret, can reach it.
- Plaid webhooks verify the ES256 `Plaid-Verification` JWT and check its
  `request_body_sha256` claim against the body actually received, so the one
  publicly-reachable function can't be spoofed. The body is parsed before the
  signature is checked — unavoidably, since the verification key endpoint is
  environment-specific and the Item has to be resolved to know which key to
  ask for — but nothing is trusted or acted on until the check passes, and a
  forged webhook naming a sandbox Item is still checked against sandbox's key.
- Every table is scoped by `household_id` and gated on household membership.
- `households.plaid_environment` is operator-only. RLS cannot express that
  restriction, because the row legitimately belongs to the user, so the
  `authenticated` UPDATE grant is narrowed to the `name` column instead.

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

### Choose the right test identity

Mintea sign-in and Plaid Link sign-in are separate. Plaid's `user_good` /
`pass_good` (and MFA `1234`) are entered inside Plaid Link; they cannot sign anyone
into Mintea.

- **Personal Mintea account:** this creates an isolated household. It cannot see the
  shared E2E fixture because RLS separates household data. After a maintainer confirms
  `households.plaid_environment = 'sandbox'`, linking with Plaid's sandbox credentials
  creates a fresh set of fake accounts and transactions for that household.
- **Shared E2E fixture:** the shared development project uses the disposable,
  passwordless identity `mintea-e2e@example.com` for tests that need its existing
  fixture dataset. It has no password and no password belongs in the vault. A
  maintainer generates a one-time sign-in link with
  `python3 scripts/e2e_household.py login`. Treat that link as an authentication
  credential and deliver it only through an approved secure channel—never a commit,
  PR, issue, chat, screenshot, or log. If no secure delivery destination is available,
  the maintainer should run the command locally instead of asking an agent to print it.

Do not run `clone` or `teardown` merely to sign in to an existing fixture. Those are
fixture-lifecycle commands: `clone` creates and populates the disposable account, and
`teardown` destroys it.

### E2E fixture lifecycle (maintainers)

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
one-time admin link. The link itself is a short-lived authentication credential, so
capture and deliver it securely rather than pasting it into chat or logs.

`plaid_item_secrets` is deliberately not copied. It holds Plaid access tokens under RLS
with no policies, so copying it would let the test household drive real syncs against
live Items. The copied `plaid_items` therefore carry no secret and any sync fails
cleanly. Two columns are prefixed rather than copied — `plaid_items.plaid_item_id` and
`transactions.plaid_transaction_id` are unique across the whole table rather than per
household, so a verbatim copy collides.

Linking a new institution with Plaid's sandbox credentials later creates a new
sandbox Item and access token normally; the no-token rule applies only to Items copied
from the source fixture.

Run `teardown` when you are done. `clone` refuses to run while a test user already
exists, and `teardown` refuses to touch a household shared with another user.

### Fresh disposable Sandbox users (maintainers)

Use a fresh Sandbox user when the test needs to exercise authentication, RLS,
Plaid Link, account exchange, sync, or any flow that creates data. The clone
fixture above contains realistic copied rows but deliberately has no Plaid access
tokens, so it cannot test a new Plaid connection.

The general fixture script creates one or more confirmed Mintea users with empty
households, marks every household as `sandbox`, and prints the emails and
household IDs without printing the password:

```bash
export E2E_SANDBOX_PASSWORD="$(openssl rand -base64 24)"
python3 scripts/e2e_sandbox.py create --run-id smoke-20260809 --count 2
python3 scripts/e2e_sandbox.py status --run-id smoke-20260809 --count 2
```

Keep `E2E_SANDBOX_PASSWORD` in the local shell only. Never commit it, put it in
the vault, or paste it into chat or logs. The script uses the Supabase CLI's
service-role access internally and never prints that key. Run it only against a
disposable development project.

Start the app with `npm run web`, sign in to one of the printed users with the
local password, and open Plaid Link. In Plaid Sandbox, `user_good` / `pass_good`
(and MFA `1234` if requested) belong inside Link, not in the Mintea sign-in form.
A direct Sandbox institution such as **First Platypus Bank** is easiest for
browser testing; OAuth institutions may open a separate provider handoff. Plaid
then creates fake checking, savings, credit, investment, loan, and transaction
data for that household. Sign in to additional users when the scenario needs
multiple isolated identities; all users created by one run use the local
`E2E_SANDBOX_PASSWORD`.

Before cleanup, disconnect every Plaid institution from the app so Plaid Items
are revoked externally. Then remove the disposable records:

```bash
python3 scripts/e2e_sandbox.py teardown --run-id smoke-20260809 --count 2
```

Teardown refuses to remove a household that still has Plaid Items or members
outside the requested run. It deletes households before auth users because
account ownership is intentionally protected by a foreign key. If a test is
interrupted, use `status` first and do not reuse the run ID until teardown has
reported zero remaining users.

### Notes

- Local Supabase (`supabase start`) needs Docker. Without it, develop against a hosted
  project — the flow above assumes that.
- If `pod install` fails with `Unicode Normalization not appropriate for ASCII-8BIT`,
  your shell locale isn't UTF-8. Run it as
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`.
