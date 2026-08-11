# Mintea Product Roadmap

Last updated: August 9, 2026

## Product direction

Mintea should become the most trustworthy way for a household to understand and
organize its money. The product should earn breadth in layers:

1. make connected financial data correct and explainable;
2. make daily transaction cleanup fast and increasingly automatic;
3. turn clean history into useful reports and a practical monthly plan;
4. add recurring obligations, goals, collaboration, and portfolio depth.

This roadmap prioritizes user reach, frequency of use, trust, and leverage from
the code already shipped. It does not attempt feature-for-feature Monarch parity
in one release. Where Mintea currently stands against Monarch and Rocket Money,
capability by capability, is recorded in
[COMPETITIVE_GAP_ANALYSIS.md](COMPETITIVE_GAP_ANALYSIS.md).

## Current foundation

Mintea already ships:

- **Shipped** — Plaid account and transaction sync, connection health,
  reauthentication, disconnection, and throttled real-time balance refreshes
- **Shipped** — linked and manual accounts, credit utilization, account
  grouping, account visibility controls, and durable account removal
- **Shipped** — manual and automatically valued real estate
- **Shipped** — net worth, cash, assets, liabilities, and cash-flow history
- **Shipped** — transaction search, filters, review, editing, notes, hiding,
  removal, fixed splits, and manual entry
- **Shipped** — a household-scoped category tree with full group management,
  and canonical merchant editing
- **Shipped** — tags: creation, assignment, filtering, and management with
  usage counts
- **Shipped** — reviewed duplicate-account detection and merging with
  conservative transaction reconciliation, balance-history transfer, and source
  archival
- **Shipped** — suggested and manual transfer pairing with reversible cash-flow
  exclusion
- **Shipped** — exact-description transaction cleanup rules with previews,
  historical application, future-sync application, and rule management
- **Shipped** — period reporting: income, spending, net cash flow and savings
  rate, with category, group, merchant and account breakdowns, monthly trend
  charts and drilldown
- **Shipped** — monthly category budgets: a month navigator, per-category
  planned amounts, planned/spent/remaining totals, and copy-last-month
- **Shipped** — family accounts: invitations with roles, per-account Family or
  Private visibility enforced in SQL, and an empty-household join
- **Shipped** — an in-app notification centre with connection-health and budget
  conditions, family events, and a durable email outbox
- **Shipped** — transactional email: Resend delivery, branded templates, and
  Supabase Auth template overrides
- **Shipped** — self-service account deletion
- **Shipped** — row-level security and isolated Plaid access tokens
- **Partial** — CSV export and duplicate-aware CSV import, both web only
- **Partial** — bulk editing; applying a tag to a selection only

These capabilities are the base for the roadmap below. A field or table that is
not reachable through a safe user experience does not count as a shipped
feature.

## Shipped implementation status

As of August 9, 2026, twelve vertical slices are deployed to production across
six packages. P4, P5, P7, P8, P9, P10, P12 and P13 have not been started.

Two things shipped outside the slice count. Self-service account deletion
arrived alongside the mobile release baseline rather than as a slice of its own,
which is why the P0 row lists it without changing that package's count. The
transactional email foundation landed as infrastructure ahead of P11 and is
counted inside P11's row rather than on its own.

Three packages are now partly open. P3 has P3.1; P6 has P6.1 and is fenced
against a populated household joining; P11 has most of its first three slices
and no scheduler.

A slice counts as shipped only when it is reachable through a safe user
experience, covered by tests, and verified in a browser against production data.
A field or table that exists but has no interface does not count.

Concretely, a slice ships only after schema and RLS coverage, domain tests, web
and native exports, and browser end-to-end verification against the disposable
sandbox fixture. One pull request per completed slice keeps migrations
reviewable and makes a bad financial rule easy to roll back.

| Package | Shipped | Still planned |
|---|---|---|
| **P0 — Data Trust** (3 slices) | Duplicate-account detection across Plaid Items; reviewed keep-account choice with a dry-run impact summary; atomic merge with one-to-one overlap archival, transfer of unique transactions, splits and missing balance dates, archived source and audit metadata; transfer suggestions with manual match/unmatch. CSV export of transactions and accounts. Connection health: plain-language Plaid errors, consent-expiry and staleness warnings, and in-place reconnect via Link update mode. Self-service account deletion with typed confirmation, Plaid disconnection and household-aware departure. | Pre-merge backup; MFA; user-facing merge undo; export on native |
| **P1 — Smart Transactions** (3 slices) | Canonical merchant search and creation; exact bank-description match preview; historical merchant/category cleanup; saved rules for future imports with pause, resume and delete; preservation of explicit merchant edits across the pending-to-posted transition. Tags: create, rename, recolour, delete with usage counts; inline creation while assigning; assignment and row display; filtering; bulk application reporting server-side change counts. Category groups: create, rename, retype, reorder, and delete with categories relocated rather than destroyed. | Percentage splits; additional rule conditions and actions; quick-rule suggestions; retroactive rule runs; bulk tag *removal*; broader bulk actions |
| **P2 — Reports Lite** (3 slices) | Income, spending, net cash flow and savings rate per period, compared against the preceding period; spending broken down by category, group, merchant or account with shares; monthly trend charts and multi-period comparison; drilldown from a breakdown row into the transactions behind it. Duplicate-aware CSV import with column detection, date-order disambiguation, per-line error reporting and a preview. | Balance-history import; shared filters across report views; saved reports, Sankey and image sharing; import on native |
| **P3 — Budgeting** (1 slice) | P3.1 monthly category plans: `budget_category_plans` with household RLS, a month navigator, per-category planned amounts, spend derived from transactions, planned/spent/remaining totals with an over-budget state, copy-last-month, and per-category add/edit/remove; first P11 over-budget and unallocated-income notification evaluator. | P3.2 rollover and flexible planning; P3.3 targets and irregular expenses; group subtotals; historical-average setup |
| **P6 — Family accounts** (1 slice) | P6.1 family sharing: invitations that are expiring, revocable and email-bound; owner and member roles; `owner_user_id` and `family`/`private` visibility on every account, enforced by `current_visible_account_ids()`; visibility chosen at account creation and editable later by the owner; an atomic empty-household join that refuses a cross-environment family; a Family settings screen. | P6.2 joining with existing data — currently refused with *"Use the family migration flow instead"*; P6.3 leaving a family; P6.4 attribution and activity log; Share-all enablement; distinct Family and My views |
| **P11 — Notifications** (2 slices) | An in-app centre with unread counts, severity, deep links, read/dismiss state and an affirming empty state; the Accounts and Budget banners retired into it; connection-health and budget/unallocated-income conditions with automatic resolution; family joined and left events; a durable email outbox with cross-channel dedup, provider suppression checks and a log-only mode; transactional email via Resend. | A scheduler — nothing invokes `notification-evaluate` or `notification-dispatch` on a schedule; a provider bounce webhook; a preferences UI; `List-Unsubscribe`; grouping; import and merge events; retention; push |
| **P4, P5, P7 — P10, P12, P13** | Nothing | Recurring bills, goals, investments, specialty integrations and MX, advanced planning, multi-currency, subscription infrastructure and experience |

### What the remaining work is waiting on

Most of what is left is ordinary engineering. Four items are not, and need a
product decision before they can be built:

| Item | Decision needed |
|---|---|
| MFA | Which factors to support, and whether enrolment is optional or forced |
| User-facing merge undo | How far back a merge can be reversed, and what happens to edits made after it |
| Pre-merge backup | Whether the CSV export already satisfies this, or a snapshot needs to be restorable in place |

Self-service account deletion was on this list and is now shipped; the retention
question was settled by deleting outright rather than retaining, which the
confirmation screen states before the user commits.

Two shipped features are deliberately incomplete rather than blocked: CSV export
and CSV import are web-only. The native path needs `expo-file-system` and
`expo-sharing`, which are not installed and require a native rebuild; rather
than ship a route that fails the first time it is tapped, native says so and
the action is disabled.

### How the shipped work was verified

269 automated tests pass: unit tests for the domain layer and executable
migration tests that run the real schema under PGlite, so the SQL is exercised
rather than described. TypeScript checks and the production web export pass on
every pull request.

Browser verification runs at phone, tablet and desktop widths in both themes,
exercising success, loading, empty, error and destructive-confirmation states.
It runs against a **clone of the production household** — a throwaway user
holding a copy of the real data, created and destroyed by
`scripts/e2e_household.py`. Testing against realistic volume is what caught an
empty-state bug, a reconnect button gated on the wrong condition, and duplicate
UI that a hand-built fixture had hidden.

Supabase migrations and Edge Functions deploy from CI. The web app deploys
through Vercel's GitHub integration; the `Deploy to Vercel` workflow step is
skipped for missing `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, so
it is currently redundant.

## What to build next

The package numbers below are stable identifiers, not a build order. This is the
build order, and it comes out of
[COMPETITIVE_GAP_ANALYSIS.md](COMPETITIVE_GAP_ANALYSIS.md): across 67
capabilities compared against Monarch and Rocket Money, Mintea ships 24,
partially ships 7, and has no form of 36.

Two packages opened since this order was last written, which changes what is at
the top. P11 built its centre, its conditions and its outbox, and P6 built
family sharing. Both stopped one step short of being usable end to end, and
finishing those two steps now beats starting anything new.

| Order | Package | Why here |
|---|---|---|
| 1 | **P11's scheduler** | Everything else in P11 works and nothing runs it; `notification-evaluate` and `notification-dispatch` exist with no trigger |
| 2 | **P6.2 joining with data** | P6.1 refuses a populated household and names a flow that does not exist, so only new signups can join a family |
| 3 | **P3.2 rollover, then P4 recurring bills** | P3.2 finally has an alert path; Rocket Money gives recurring away free, so its absence reads as missing rather than unbundled |
| 4 | **Parity finishers** | Individually small, collectively the "unfinished" tax |
| 5 | **P5 goals, then P7 investments** | Real gaps, but expensive and late-binding |

The first two are unfinished work rather than new work, and both are small
relative to what they unlock. The rest departs from numeric order for the
reasons below.

### 1. The scheduler is the only thing standing between P11 and working

P3.1 shipped a working monthly plan, and its first alert path now exists in P11.
The durable notification store and server-only email transport are in place, but
there is still no scheduled job that evaluates every household or drains the
outbox automatically. Without that final trigger, an over-budget category is
still a red bar on a screen the user has to remember to open.

A budget nobody is told they blew is a spreadsheet. The substrate — a scheduled
job, transactional email, an `expo-notifications` native rebuild, and a per-user
preferences table — is small next to what it unblocks: P3.2's over-budget and
unallocated-income alerts, P4's pre-bill reminders, P5's goal milestones, and
every later re-engagement surface.

Build it before P3.2 rather than alongside, since P3.2's alerts are the first
thing that needs it and would otherwise ship half-finished for the same reason
P3.1 did.

### 2. Family accounts move ahead of recurring and goals

Every table already carries `household_id`, and every RLS policy already gates on
household membership — the cost the schema deliberately paid up front so that
partner sharing would be a feature rather than a migration. What is missing is an
invitation flow, per-account privacy, safe household migration and deduplication,
a members screen, and a way to leave without deleting a person's Mintea account.

That is a fraction of what budgeting costs. It is also the market Monarch built
its business on, and Rocket Money puts account sharing behind Premium. Holding
collaboration at P6 spends the schema's foresight on nothing, and the original
note on that package — "move this package earlier if couples become Mintea's
primary customer" — is the decision being made here.

### 3. Recurring bills close the free-tier floor

Rocket Money gives subscription detection and an upcoming-bills list away for
free, so their absence reads as a missing feature rather than a withheld tier.
Detection from merchant, amount and cadence needs no new provider and no new
data — the P0 and P1 correctness work is exactly what makes the history clean
enough to derive it.

### 4. Parity finishers

Each is a scoped follow-on slice with its groundwork already laid, and none needs
new architecture: MFA over Supabase TOTP, percentage splits, further rule
conditions, bulk tag removal, merchant and account breakdowns, monthly trend
charts, native CSV import and export, and an actual store submission — `eas.json`
already defines a production profile with store distribution, and CI already
exports both native bundles, so what is missing is the submission itself.
Together they close most of the remaining daily-use complaints.

### 5. Goals, then investments

Savings goals are cheap once budgets exist and can share their interface.
Investments are not: Plaid Investments is a separately priced product, holdings
and securities are new schema, and Monarch has already moved that bar to
Morningstar fund analysis and tax lots.

### Not worth building

Subscription cancellation, bill negotiation and credit scores are Rocket Money's
actual moat, and none of them is a code problem — they need staff on phones,
carrier relationships, and a bureau agreement with the compliance surface that
follows. They are also why Rocket Money can afford to give the ledger away.
Mintea should compete on the ledger.

## Prioritization model

Feature packages are ordered using four questions:

1. **Reach:** How many users benefit?
2. **Trust and frequency:** Does it affect correctness or a repeated workflow?
3. **Leverage:** How much of the necessary model and UI already exists?
4. **Dependency:** Which later features become useful only after this one?

## Roadmap

Every scope item below carries its build status, so the roadmap can be read as an
inventory rather than a wish list. The three labels mean:

| Label | Meaning |
|---|---|
| **Shipped** | Reachable through a safe user experience, covered by tests, and verified in a browser against production data |
| **Partial** | Part of the item meets that bar; the remainder is named in the same line |
| **Planned** | Not started |

A field or table that exists but has no interface is **Planned**, not
**Shipped** — the same rule the shipped-status section above uses.

Every bullet naming a user-facing capability carries one of these labels,
throughout the document. Bullets that are not capabilities do not: design goals
and non-goals, duplicate-detection and transfer-matching criteria, authorization
invariants, success measures, and verification notes describe how shipped work
behaves or how it was proven, and a build status would be meaningless on them.

Each package lives in its own file under [`docs/roadmap/`](roadmap/). The
numbers are stable identifiers, not a build order — that is *What to build
next* above.

| Package | Status |
|---|---|
| [P0 — Data trust and account hygiene](roadmap/P0-data-trust.md) | 3 slices shipped — MFA and merge undo remain |
| [P1 — Smart transaction workflow](roadmap/P1-smart-transactions.md) | 3 slices shipped — rule expansion and percentage splits remain |
| [P2 — Historical data and Reports Lite](roadmap/P2-reports.md) | 3 slices shipped — balance-history import remains |
| [P3 — Core monthly budgeting](roadmap/P3-budgeting.md) | P3.1 shipped — rollover, targets and group subtotals remain |
| [P4 — Recurring bills and subscriptions](roadmap/P4-recurring-bills.md) | Not started |
| [P5 — Goals](roadmap/P5-goals.md) | Not started |
| [P6 — Family accounts and household collaboration](roadmap/P6-family-accounts.md) | P6.1 shipped — **P6.2 is the blocker**: joining with existing data is refused |
| [P7 — Investments](roadmap/P7-investments.md) | Not started |
| [P8 — Connectivity and specialty integrations](roadmap/P8-connectivity.md) | Scoped, not started — P8.1 gates MX on a reliability report |
| [P9 — Advanced planning and polish](roadmap/P9-advanced-planning.md) | Not started |
| [P10 — Multi-currency](roadmap/P10-multi-currency.md) | Scoped, not started |
| [P11 — Notifications](roadmap/P11-notifications.md) | Most of P11.1–P11.4 shipped — **no scheduler**, so nothing runs it |
| [P12 — Subscription infrastructure](roadmap/P12-subscriptions.md) | Scoped, not started — per-household entitlement, IAP on both platforms |
| [P13 — Subscription experience](roadmap/P13-subscription-experience.md) | Scoped, not started — the user-facing half of P12 |

One file per package so that agents working on different packages in parallel
do not collide. Anything shared — the foundation list, the shipped-status
table, the build order and the label convention above — stays here, and is the
one place that needs coordinating.
