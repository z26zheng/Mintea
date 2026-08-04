# Mintea — Implementation Plan

A personal finance app in the mold of Monarch Money. Universal codebase (web + iOS +
Android), Supabase for data/auth, Plaid for bank aggregation, no separate backend server.

---

## 1. Architecture

### 1.1 Stack

| Layer | Choice | Why |
|---|---|---|
| App | Expo SDK 57, React Native 0.86, React 19.2 | One codebase → web, iOS, Android |
| Routing | Expo Router v6 (file-based) | Same routes on all 3 targets; real URLs on web |
| Styling | NativeWind 4 (Tailwind syntax on RN primitives) | Familiar DX, works on all targets |
| State/cache | TanStack Query v5 | Platform-agnostic, handles sync/refetch/optimistic updates |
| DB + Auth | Supabase (Postgres + RLS + Auth) | Client talks to it directly; RLS is the authorization layer |
| Server code | Supabase Edge Functions (Deno) | Only where secrets are required — see §1.3 |
| Bank data | Plaid (Sandbox → Production) | Transactions, balances, investments, liabilities |
| Charts | `react-native-svg` + `d3-shape` | Renders identically on web/iOS/Android, no Skia dependency |

### 1.2 Repository layout

```
Mintea/
├── apps/
│   └── mintea/              # Expo universal app (web + iOS + Android)
│       ├── app/             # Expo Router routes
│       ├── components/      # UI components (RN primitives, work everywhere)
│       └── lib/             # Platform glue (storage adapter, Plaid Link wrapper)
├── packages/
│   └── core/                # Zero-UI, zero-platform domain layer
│       ├── src/domain/      # Money math, net worth, rules engine, date ranges
│       ├── src/db/          # Typed Supabase queries
│       ├── src/hooks/       # TanStack Query hooks
│       └── src/types/       # Generated DB types + domain types
├── supabase/
│   ├── migrations/          # SQL schema + RLS policies
│   └── functions/           # Deno Edge Functions (hold PLAID_SECRET)
└── docs/
```

**The rule that keeps this portable:** `packages/core` may never import from `react-native`,
`expo-*`, or `react-dom`. It is pure TypeScript. Anything platform-specific lives in
`apps/mintea/lib` behind an interface, or in a `.native.tsx` / `.web.tsx` file pair that
Metro resolves per-target.

### 1.3 Why there is server-side code at all

Plaid's `client_secret` cannot ship in a frontend bundle — it is extractable from any web
bundle or decompiled APK, and it grants access to every Item in the account. The same is
true of the per-Item `access_token`.

So a thin server tier is mandatory. It lives inside Supabase as Edge Functions, which means
there is still nothing separate to deploy, scale, or pay for:

| Function | Responsibility |
|---|---|
| `plaid-link-token` | Create `link_token` (also update-mode for re-auth) |
| `plaid-exchange` | `public_token` → `access_token`; persist Item + Accounts |
| `plaid-sync` | `/transactions/sync` + throttled real-time balances → Postgres |
| `plaid-webhook` | Transactions + free cached balances on Plaid notifications |
| `plaid-remove` | `/item/remove` on disconnect |

Access tokens live in `plaid_item_secrets`, a table with RLS enabled and **zero policies** —
unreachable from any client JWT, readable only by the service role inside Edge Functions.

Everything else — reading transactions, editing categories, budgets, goals — goes
straight from the app to Postgres over PostgREST, protected by RLS.

### 1.4 Data conventions

- **Money is integer minor units** (`amount_cents bigint`). No floats anywhere in the
  stack. Exact in both SQL and JS up to ±$90 trillion.
- **Sign convention: negative = money leaving the account** (expense), positive = money
  arriving (income). Plaid uses the opposite sign, so it is flipped once at ingest and
  never again.
- **Every row carries `household_id`.** Even in single-user mode a household of one is
  created at signup. This makes shared/partner access (Phase 6) a feature flag rather
  than a data migration that rewrites every RLS policy.

---

## 2. Feature inventory

Full Monarch surface area, tagged with the phase that delivers it.

### Accounts — Phase 1
- Link institutions via Plaid Link (banks, cards, loans, investments)
- Manual accounts for assets Plaid can't see (property, vehicles, private holdings)
- Balance + available balance, credit limits, currency
- Account groups: Cash · Credit Cards · Investments · Loans · Real Estate · Other
- Daily balance snapshots → history
- Hide from net worth, hide from budget, custom display order
- Re-authentication flow when an Item breaks; institution status/error surfacing
- Disconnect / delete with cascade

### Transactions — Phase 1
- Infinite-scroll list, grouped by date
- Full-text search over description + merchant + notes
- Filters: date range, account, category, merchant, amount range, tags, review status
- Inline edit: category, merchant, date, amount, notes
- Splits (one transaction → N categorized children)
- Bulk edit and bulk categorize
- Manual transactions
- Review queue (`needs_review` flag, "mark as reviewed")
- Hide from reports
- Pending → posted reconciliation
- Duplicate detection
- CSV import with column mapping; CSV export
- Receipt/attachment upload (Supabase Storage)

### Categories & tags — Phase 1
- System category tree seeded at signup (mirrors Monarch's default set)
- Custom categories and groups, emoji icon + colour
- Rename, reorder, merge, delete-with-reassign
- Free-form tags, many-to-many

### Net worth — Phase 1
- Selectable net worth, cash, assets and liabilities from daily balance snapshots
- Net cash flow from posted transactions, excluding transfers and hidden activity
- Line/bar toggle and range selector (1M · 3M · 6M · YTD · 1Y · All)
- Per-account and per-group contribution breakdown

### Rules engine — Phase 2
- Conditions: merchant / description matches, amount range, account, direction
- Actions: set category, rename merchant, add tag, hide, mark reviewed
- Priority ordering, apply-to-existing, preview before commit

### Transfers — Phase 2
- Auto-match paired transactions across accounts
- Manual link/unlink, exclusion from income/expense totals

### Budgets — Phase 3
- Monthly amount per category; income budgeting
- Planned vs actual vs remaining, with progress bars
- Rollover / carry-over per category
- Copy previous month, budget templates
- Fixed · Flexible · Non-monthly expense grouping
- "Left to budget" zero-based view

### Cash flow & reports — Phase 4
- Income vs expense over time (bar + line)
- Sankey cash-flow diagram
- Spending by category, group, merchant, tag
- Trends, month-over-month and year-over-year comparison
- Custom date ranges, saved report views

### Recurring & bills — Phase 4
- Detect recurring merchant streams from transaction history
- Upcoming bills calendar, expected amount and date
- Subscription list with cancel-tracking

### Goals — Phase 5
- Savings goals: target amount, target date, linked accounts
- Debt payoff goals with projected payoff date
- Priority ordering, progress and required-monthly-contribution

### Investments — Phase 5
- Holdings, securities, cost basis, unrealised gain/loss
- Allocation breakdown by asset class and account
- Portfolio performance vs benchmark

### Households & sharing — Phase 6
- Invite a partner; shared household data
- Roles: owner · member · read-only advisor
- Per-account visibility controls

### Platform & polish — Phase 6
- Dark mode, multi-currency display
- Push notifications and alerts (large transaction, low balance, budget exceeded)
- Biometric app lock
- Home-screen widgets (iOS/Android)
- Offline read cache

---

## 3. Delivery phases

**Phase 1 — Foundation (this phase).** Auth, schema + RLS, Plaid link and sync, accounts,
transactions with full editing and filtering, categories, net worth chart. Ships as a
usable app on web; runs on iOS/Android simulators from the same source.

**Phase 2** — Rules engine, transfer matching, CSV import/export, review queue polish.

**Phase 3** — Budgets.

**Phase 4** — Cash flow, reports, Sankey, recurring detection.

**Phase 5** — Goals, investments.

**Phase 6** — Households/sharing, notifications, widgets, biometric lock.

---

## 4. Phase 1 task breakdown

1. Monorepo scaffold — npm workspaces, Expo app, `packages/core`, Metro config for workspaces
2. Supabase schema migration — all Phase 1 tables, indexes, sign/currency conventions
3. RLS policies + household bootstrap trigger + default category seed
4. `packages/core` — types, Supabase client factory, domain math (money, net worth, ranges)
5. Auth flow — email/password + magic link, session persistence per platform
6. Edge Functions — link-token, exchange, sync, webhook, remove
7. Plaid Link integration — `.web.tsx` (react-plaid-link) / `.native.tsx` (RN SDK)
8. Accounts UI — list, grouping, detail, manual account CRUD, balances
9. Transactions UI — list, search, filters, detail sheet, edit, split, bulk actions
10. Categories UI — tree management, merge/reassign
11. Financial trends — SVG line/bar charts, metric and range selectors, breakdown
12. Verify: run on web, then iOS simulator, from the same source

---

## 5. Phase 1 verification status

Refreshed 2026-08-01 after the mobile release pass. The full record, including
exact errors for everything still blocked, is in
[IOS_ANDROID_PLAN.md §7](IOS_ANDROID_PLAN.md).

| Check | Result |
|---|---|
| `npm run typecheck` (both workspaces) | Passes |
| `npm test` | Passes — 218 tests |
| `expo export --platform web` | Passes — 1,502 modules |
| `expo export --platform ios` / `--platform android` | Passes — 2,253 / 2,329 modules |
| Expo Doctor | Passes — 18/18, run from `apps/mintea` |
| Web render, light + dark, mobile + desktop | Verified |
| Routing, auth gating, setup fallback | Verified |
| `expo prebuild --platform ios` + `pod install` | Succeeds (needs a UTF-8 `LANG`) |
| iOS simulator build | Passes on Xcode 26.6; app runs on an iOS 26.5 simulator |
| Android `assembleDebug` | Passes; APK installs and launches on an API 36 emulator |
| Android `assembleRelease` | Passes — 104 MB standalone APK, sideloadable; sign-in and manual-account creation verified on it |
| Hosted Supabase | Verified — project active, all seven Edge Functions reachable |
| Hosted migration parity | In sync; CI now enforces append-only history |
| Two-user household RLS | Verified in PGlite and against the hosted production database with real signed-in users |
| Native auth deep links | Verified on Android and iOS, cold start and warm; password recovery run end to end with real Supabase tokens |
| Native session storage | Device keystore; a real session occupies 2 chunks, and no token appears in either AsyncStorage database |
| Account deletion | Verified against the hosted project — all three household branches, plus the Settings flow on device |
| End-to-end against Plaid | Not run — the deployed Plaid environment is **production**, so a Link flow would connect a real bank |

Three things are worth calling out.

**iOS compile is blocked by the host toolchain, not the code.** Expo SDK 57's
`expo-modules-jsi` declares `swift-tools-version: 6.2`, which ships with Xcode 26. On
Xcode 16.2 the build fails in the `Build ExpoModulesJSI xcframework` phase with
`package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.0.0`.
Everything up to the compile step — prebuild, CocoaPods, the native project — works.

**Android now builds and runs.** Plaid's SDK requires API 26 while the generated project
declared 24; `expo-build-properties` sets the floor. The debug APK reaches the sign-in
screen on an emulator with the Plaid native module loaded.

**The backend is real and in use, and household isolation is now proven rather than
assumed.** A test runs the actual migrations, signs in as two separate users, and checks
that neither can read or mutate the other across every client table, the household RPCs,
and `plaid_item_secrets`. What remains untested is anything needing a mailbox, a Plaid
Sandbox session, or a physical device.

---

## 6. Security posture

- Plaid `client_secret` and per-Item `access_token` never leave Edge Functions.
- `plaid_item_secrets` has RLS on and no policies → no client JWT can read it.
- All client access is through RLS-protected PostgREST; the anon key is public by design
  and grants nothing without a valid session.
- Plaid webhooks verify the `Plaid-Verification` JWT against Plaid's JWKS before acting.
- Supabase service-role key exists only as an Edge Function secret, never in the app.
- Phase 6 adds biometric lock and at-rest encryption for cached data on device.
