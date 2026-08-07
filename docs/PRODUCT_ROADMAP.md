# Mintea Product Roadmap

Last updated: August 6, 2026

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
  rate, with category and group breakdowns and drilldown
- **Shipped** — self-service account deletion
- **Shipped** — row-level security and isolated Plaid access tokens
- **Partial** — CSV export and duplicate-aware CSV import, both web only
- **Partial** — bulk editing; applying a tag to a selection only

These capabilities are the base for the roadmap below. A field or table that is
not reachable through a safe user experience does not count as a shipped
feature.

## Shipped implementation status

As of July 29, 2026, eight vertical slices are deployed to production across the
first three packages. P3 through P9 have not been started. Self-service account
deletion shipped afterwards, alongside the mobile release baseline, rather than
as a slice of its own — which is why the P0 row below lists it without changing
the slice count.

A slice counts as shipped only when it is reachable through a safe user
experience, covered by tests, and verified in a browser against production data.
A field or table that exists but has no interface does not count.

| Package | Shipped | Still planned |
|---|---|---|
| **P0 — Data Trust** (3 slices) | Duplicate-account detection across Plaid Items; reviewed keep-account choice with a dry-run impact summary; atomic merge with one-to-one overlap archival, transfer of unique transactions, splits and missing balance dates, archived source and audit metadata; transfer suggestions with manual match/unmatch. CSV export of transactions and accounts. Connection health: plain-language Plaid errors, consent-expiry and staleness warnings, and in-place reconnect via Link update mode. Self-service account deletion with typed confirmation, Plaid disconnection and household-aware departure. | Pre-merge backup; MFA; user-facing merge undo; export on native |
| **P1 — Smart Transactions** (3 slices) | Canonical merchant search and creation; exact bank-description match preview; historical merchant/category cleanup; saved rules for future imports with pause, resume and delete; preservation of explicit merchant edits across the pending-to-posted transition. Tags: create, rename, recolour, delete with usage counts; inline creation while assigning; assignment and row display; filtering; bulk application reporting server-side change counts. Category groups: create, rename, retype, reorder, and delete with categories relocated rather than destroyed. | Percentage splits; additional rule conditions and actions; quick-rule suggestions; retroactive rule runs; bulk tag *removal*; broader bulk actions |
| **P2 — Reports Lite** (2 slices) | Income, spending, net cash flow and savings rate per period, compared against the preceding period; spending broken down by category or group with shares; drilldown from a breakdown row into the transactions behind it. Duplicate-aware CSV import with column detection, date-order disambiguation, per-line error reporting and a preview. | Balance-history import; merchant and account breakdowns; monthly trend charts; saved reports; import on native |
| **P3 — P9** | Nothing | Budgeting, recurring bills, goals, household collaboration, investments, specialty integrations, advanced planning |

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

150 automated tests pass: unit tests for the domain layer and executable
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
[COMPETITIVE_GAP_ANALYSIS.md](COMPETITIVE_GAP_ANALYSIS.md): across 66
capabilities compared against Monarch and Rocket Money, Mintea ships 23,
partially ships 7, and has no form of 36 — including all ten planning
capabilities.

| Order | Package | Why here |
|---|---|---|
| 1 | **P3 budgeting + the notification substrate** | The substrate is the dependency nothing else can skip |
| 2 | **P6 household collaboration** | Schema cost already sunk; highest differentiation per unit of work |
| 3 | **P4 recurring bills** | Rocket Money gives this away free, so its absence reads as missing, not unbundled |
| 4 | **Parity finishers** | Individually small, collectively the "unfinished" tax |
| 5 | **P5 goals, then P7 investments** | Real gaps, but expensive and late-binding |

Two of these depart from numeric order, and both departures are the substance of
this update rather than a reshuffle.

### 1. Budgeting ships with notifications, not before them

The roadmap put email and push reminders inside P4. They belong in P3, because
Mintea currently sends nothing to anyone: there is no notification dependency in
`apps/mintea/package.json`, no transactional email, and no scheduled job that
could deliver either.

A budget nobody is told they blew is a spreadsheet. Building budgets first and
alerts three packages later means building budgets twice. The substrate — a
scheduled job, transactional email, an `expo-notifications` native rebuild, and a
per-user preferences table — is small next to the package it unblocks, and it
unblocks budget alerts, bill reminders, goal milestones and every later
re-engagement surface at once.

Ship, in this order: category budgets with planned/actual/remaining, then the
substrate, then overspend alerts as the first thing that uses it.

### 2. Collaboration moves ahead of recurring and goals

Every table already carries `household_id`, and every RLS policy already gates on
household membership — the cost the schema deliberately paid up front so that
partner sharing would be a feature rather than a migration. What is missing is an
invitation flow, a members screen, and an owner column on transactions.

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

### P0 — Data trust and account hygiene

Status: three vertical slices shipped (account merging, CSV export, then
connection health), plus self-service account deletion; MFA and merge-undo work
remains.

Correctness is a prerequisite for every total, chart, report, budget, recurring
schedule, and goal.

Scope:

- **Shipped** — conservative likely-duplicate account detection
- **Shipped** — reviewed account merge with a dry-run impact summary
- **Shipped** — one-to-one reconciliation of overlapping transactions
- **Shipped** — transfer of non-overlapping transaction and balance history
- **Shipped** — preservation of the archived source account and merge audit
  metadata
- **Shipped** — transfer suggestions plus manual match and unmatch
- **Shipped** — sync diagnostics, as connection health: plain-language Plaid
  errors, consent-expiry and staleness warnings, and in-place reconnect
- **Shipped** — self-service account deletion
- **Partial** — CSV export; web only, because the native path needs
  `expo-file-system` and `expo-sharing`
- **Planned** — a pre-merge backup path
- **Planned** — MFA
- **Planned** — user-facing merge undo

The product must never silently merge two accounts based only on a name, balance,
or last four digits.

### P1 — Smart transaction workflow

Status: three vertical slices shipped (merchant cleanup rules, tags, then
category-group management); the remaining rule-expansion and split work is
still planned.

Scope:

- **Shipped** — merchant editing and consolidation
- **Shipped** — tag creation, assignment, removal, and filtering
- **Partial** — category-group management; create, rename, retype, reorder and
  delete are shipped, deactivation is not
- **Partial** — deterministic transaction rules; exact bank-description matching
  with preview and historical application is shipped, retroactive runs launched
  from rule management are not
- **Partial** — bulk editing; applying a tag to a selection is shipped, and bulk
  tag removal, merchant, review and visibility are not
- **Partial** — smart splits; fixed amounts are shipped, percentages are not
- **Planned** — additional rule conditions and actions with explicit previews
- **Planned** — quick-rule suggestions after repeated corrections

Rules should be deterministic before Mintea claims personalized or AI
categorization.

### P2 — Historical data and Reports Lite

Status: two vertical slices shipped (period reporting, then duplicate-aware
CSV import); balance-history import, merchant and account breakdowns, and
monthly trend comparison remain.

Scope:

- **Shipped** — income, spending, net cash flow, and savings rate
- **Shipped** — drilldown from a breakdown row to the transactions behind it
- **Partial** — duplicate-aware CSV import; transactions are shipped, web only,
  and balance history is not
- **Partial** — CSV export; household-wide is shipped, web only, and per-account
  scoping is not
- **Partial** — breakdowns; category and group are shipped, merchant and account
  are not
- **Partial** — period comparison; the preceding period of the same length is
  shipped, monthly trend charts and multi-period comparison are not
- **Planned** — filters shared across report views
- **Planned** — saved reports, Sankey diagrams, and image sharing

The last of those follow after the core reports are accurate and useful.

### P3 — Core monthly budgeting

Status: not started. **Build first**, together with the notification substrate.

Scope:

- **Planned** — planned, actual, and remaining amounts by month and category
- **Planned** — group totals and drilldown
- **Planned** — previous/next month navigation
- **Planned** — copy previous month and historical-average suggestions
- **Planned** — category exclusion and rollover
- **Planned** — the notification substrate: a scheduled job, transactional
  email, an `expo-notifications` native rebuild, and per-user delivery
  preferences
- **Planned** — overspend alerts, as the first feature that uses the substrate

Traditional category budgeting ships before Flex budgeting because Mintea
already has the category tree and rollover/exclusion fields.

The notification substrate was previously scoped inside P4. It moves here
because P3, P4 and P5 all depend on it and none of them is worth shipping
without it — see *What to build next* above.

### P4 — Recurring bills and subscriptions

Status: not started.

Scope:

- **Planned** — recurring-stream detection from merchant, amount, cadence, and
  history
- **Planned** — user confirmation, rejection, and manual creation
- **Planned** — upcoming list and monthly calendar
- **Planned** — expected-versus-actual matching
- **Planned** — amount-change, missed-payment, and cancellation status
- **Planned** — pre-bill reminders, delivered over the substrate built in P3

Credit-report bill sync, statement balances, minimum payments, and credit scores
are later integrations — and credit scores likely never, since they need a
bureau agreement rather than engineering.

### P5 — Goals

Status: not started.

Ship savings goals first:

- **Planned** — target amount and date
- **Planned** — planned monthly contribution
- **Planned** — linked accounts
- **Planned** — progress and projected completion

Then add debt payoff:

- **Planned** — APR, minimum payment, and planned payment
- **Planned** — payoff date and projected interest
- **Planned** — extra-payment scenarios
- **Planned** — budget contribution integration

### P6 — Household collaboration

Status: not started. **Build second**, ahead of P4 and P5.

Scope:

- **Planned** — invitations and member management
- **Planned** — shared and individual account ownership
- **Planned** — transaction ownership
- **Planned** — owner filters across accounts, transactions, and reports
- **Planned** — review assignment
- **Planned** — shared budget and goal visibility

The `households` and `household_members` tables and the household-scoped RLS
policies every feature already runs through are **Shipped**; nothing in the list
above is reachable by a user yet.

This package said "move earlier if couples become Mintea's primary customer."
That decision is made: it moves ahead of P4 and P5. The schema already carries
`household_id` on every table and every RLS policy already gates on membership,
so what remains is an invitation flow, a members screen, and an owner column —
a fraction of what budgeting costs, in the market Monarch built its business on.

### P7 — Investments

Status: not started.

Scope:

- **Planned** — Plaid Investments
- **Planned** — securities and holdings
- **Planned** — quantity, price, current value, and manual holdings
- **Planned** — allocation and basic performance
- **Planned** — top movers
- **Planned** — benchmarks, cost basis, tax lots, fund analysis, equity vesting
  and tax planning, all later than the rest of this package

### P8 — Connectivity and specialty integrations

Status: not started.

Scope:

- **Planned** — a second aggregation provider
- **Planned** — Apple Card
- **Planned** — vehicle valuation
- **Planned** — bill sync

Add another aggregation provider only when connection failure and coverage data
justify the operational cost; the other direct integrations should follow
measured demand.

### P9 — Advanced planning and polish

Status: not started.

Scope:

- **Planned** — forecasting and scenario modelling
- **Planned** — business tracking
- **Planned** — tax reports
- **Planned** — customizable dashboards
- **Planned** — attachments and receipt capture
- **Planned** — mobile widgets
- **Planned** — offline mode
- **Planned** — advanced privacy controls

Forecasting and business tracking are no longer purely longer-term: Monarch ships
both in its paid Plus tier as of April 2026. See
[COMPETITIVE_GAP_ANALYSIS.md](COMPETITIVE_GAP_ANALYSIS.md).

## P0 product requirements: Data Trust

Implementation status: the first vertical slice described below is shipped in
production.

### Problem

The same real-world account can be connected more than once through separate
Plaid Items. Without reconciliation, its balance and transactions count twice.
Transfers between owned accounts can also look like income and spending unless
both sides are linked.

These failures are difficult to notice and undermine every downstream number.

### Goals

- Detect high-signal duplicate candidates without making automatic destructive
  decisions.
- Let the user choose which live account to keep.
- Explain exactly what a merge will do before it runs.
- Preserve unique history and count overlapping history only once.
- Keep enough archived state and audit metadata for support and future undo.
- Make transfer linking understandable, symmetric, and reversible.
- Immediately refresh every affected balance, chart, list, and summary.

### Non-goals for the first slice

- Automatic merges without review.
- Fuzzy transaction deletion across unrelated accounts.
- A complete undo UI.
- CSV import/export, MFA, or account deletion in the first vertical slice.
- A second financial aggregation provider.

### Duplicate detection

A candidate is shown only when all of the following are true:

- both accounts are active, linked accounts;
- they came from different Plaid Items;
- currency, account type, and asset/liability direction agree;
- non-empty account masks agree;
- institution identity agrees by Plaid institution ID or normalized name.

Official name, subtype, current balance, and sync health increase confidence but
cannot create a candidate on their own.

### Merge experience

For each candidate, the user sees:

- institution, account name, type, last four digits, current balance, Plaid
  profile label, and connection health;
- a clear choice of which connection to keep;
- the number of unique transactions that will move;
- the number of overlapping transactions that will be archived;
- the number of missing balance-history days that will be copied;
- a warning that the other account will stop contributing to net worth and
  stop importing new activity.

The operation must be one database transaction. The destination account keeps
its identity, settings, current balance, and overlapping transaction edits.
Unique source transactions and their splits move to it. Missing balance dates
are copied without adding same-day balances together. The source account and
overlapping source transactions are soft archived with merge metadata.

### Transaction overlap

The first slice uses an intentionally narrow one-to-one fingerprint:

- posted date;
- amount;
- currency;
- pending state;
- normalized original bank description, falling back to display description;
- occurrence number among otherwise identical transactions.

Matching occurrences are considered overlap. Similarity alone is not enough.
This may leave a small number of duplicates for manual cleanup, but it avoids
deleting legitimate repeated purchases.

### Transfer experience

An unpaired, posted, unsplit transaction may show possible counterparts when:

- the candidate is in a different active account;
- currencies match;
- amounts are exact opposites;
- dates are within seven calendar days.

Candidates are ordered by closest date, then newest activity. The user chooses a
counterpart. Both rows point to each other and are excluded from cash flow.
Either transaction can unlink the pair.

### Safety and authorization

- All merge and transfer mutations run in Postgres functions scoped through
  `current_household_ids()`.
- Source and destination accounts must belong to the same household and agree
  on type, currency, and asset/liability direction.
- Transfer pairs must be symmetric, exact-opposite, cross-account, same-currency
  transactions.
- Split, pending, hidden, removed, or already-paired transactions cannot be
  newly linked.
- The client never receives Plaid access tokens.

### Success measures

- Zero automatic merges.
- No same-day balance double counting after a merge.
- No asymmetric transfer pairs.
- A confirmed merge refreshes accounts, transactions, and charts without a
  reload.
- Users can understand the merge outcome without financial terminology.
- Duplicate-account support incidents and cash-flow correction work decrease.

### Verification

- Pure unit tests cover account candidate detection and false-positive guards.
- Migration review covers authorization, one-to-one overlap, split handling,
  history copying, and symmetric transfer invariants.
- The full test suite, TypeScript checks, and web production build pass.
- Browser verification covers desktop and phone widths, light and dark themes,
  empty/loading/error states, preview/cancel/confirm, transfer match/unmatch, and
  keyboard-visible focus states.

### Second vertical slice: CSV export — shipped

Getting your data out is a data-trust guarantee, not a reporting feature: an
app that holds a decade of financial history and offers no way to leave it is
asking for trust it has not earned.

Users can export from Settings → Export:

- every transaction, or the last 90 days, this year, or the last 12 months;
- every account, including hidden ones, with balances and institutions.

The export walks the whole result set rather than the page on screen. A file
that silently stopped at the first 50 rows would be worse than no export,
because it would look complete. Above 50,000 rows the file stops and says so,
naming the limit and suggesting a narrower range.

Amounts are signed, so money out stays negative and the column sums to the net.
They are written as plain decimals rather than through `Intl`, because a
thousands separator makes the column non-numeric in a spreadsheet and a locale
that uses a comma as the decimal mark corrupts the row outright. Dates use the
household calendar, matching the rest of the app. Tags are joined with
semicolons rather than commas, which would need quoting on nearly every tagged
row. Files carry a UTF-8 byte-order mark so Excel does not render non-ASCII
merchant names as mojibake.

Split children are exported alongside their parent with a `Split of` column
naming it, rather than either one being dropped — a file missing either would
not reconcile against the bank.

Export is web-only for now. The native route needs expo-file-system and
expo-sharing, which are not installed; rather than ship a path that fails the
first time someone taps it, native says so and the button is disabled.

### Third vertical slice: connection health — shipped

A stale balance that looks current is the worst failure this product can have:
every total, chart, budget and goal downstream inherits it silently, and the
user has no way to tell. The data to detect it was already stored on every
Plaid Item — status, error code, error message, consent expiry, last sync — and
none of it was reachable. Settings showed a status badge and a date.

Now each connection states what is wrong in the user's own terms and what to do
about it:

- Plaid error codes are translated into plain language, with the raw message
  from the bank as a fallback so a code we have not seen is never swallowed;
- consent expiry warns two weeks ahead, because a connection can be syncing
  perfectly today and still be days from going dark;
- a connection that reports success but has not produced data for five days is
  called out as out of date, since silence and health look identical otherwise;
- anything fixable by re-authenticating offers Reconnect in place, wired to
  Plaid Link update mode so it repairs the existing Item rather than creating a
  duplicate.

Reconnect is deliberately not offered for mere staleness. The connection
reports healthy, so re-authenticating is unlikely to change anything and would
send the user through Link for nothing.

A banner on the Accounts screen carries the worst problem to where the user
already looks at their money, rather than waiting to be discovered in Settings.

## P2 product requirements: Reports Lite

### First vertical slice: period reporting — shipped

Users can see, for this month, last month, the last three months or the year
so far: income, spending, net cash flow, and the share of income kept. Each
headline is compared against the preceding period of the same length. Spending
is broken down by category or by group, sorted largest first with a share bar,
and tapping a category opens the transaction list filtered to exactly that
category and window.

Most of the work is deciding which rows count. Three classes of transaction
inflate every number if included, and all three are common:

- **transfers between the user's own accounts**, which are neither income nor
  spending but look like both — moving $5,000 into savings would otherwise
  report $5,000 earned and $5,000 spent;
- **split parents**, whose children carry the real categorisation, so counting
  both doubles the amount;
- **hidden transactions**, which the user has already excluded elsewhere.

A split parent is dropped only when its children are actually loaded. If a
result page holds the parent but not its children, keeping it attributes the
amount to the parent's own category, which is wrong in a small way; dropping it
loses the amount entirely, which is wrong in a large one.

Sign is the source of truth rather than the category type, so a refund posted
against a spending category nets out and a category total matches a statement.

Savings rate is null rather than zero when no income arrived, because "kept 0%
of what came in" and "nothing came in" are different situations and rendering
them identically misleads. The same reasoning applies to period comparison:
there is no meaningful percentage change from zero, so none is shown.

Drilldown required the transaction list to accept an explicit date window.
Its presets cannot express "the calendar month this report covers", so the
window arrives as route parameters and appears as a clearable filter chip.

### Second vertical slice: CSV import — shipped

Users choose a file, choose the account, see what was readable and what was
skipped, see how much of it is already present, and only then import. Rows land
marked for review, so an import joins the same triage queue as a fresh sync
rather than quietly entering reviewed history.

Every bank formats differently and none of them say how, so most of the work is
refusing to guess wrong:

- `03/04/2026` is March 4th or April 3rd depending on the bank's country. The
  order is inferred when the file proves it — any day above twelve settles it —
  and when every row reads both ways the import says so and asks rather than
  picking one and silently moving a transaction by a month.
- Amounts arrive as `$1,234.56`, `(45.00)`, `45.00-`, or split across debit and
  credit columns written unsigned. Anything unparseable becomes a skipped row
  with a line number, never a zero.
- A description can contain the delimiter, quotes, or a line break.

Duplicates are matched on **date and amount, not description**. The case that
actually corrupts data is importing a bank's CSV into an account Plaid also
feeds: Plaid rewrites descriptions, so `BLOCK INC PAYROLL, DIRECT DEP` and
`BLOCK, INC. PAYROLL PPD ID: 6506940773` are one payment under two names, and a
description-based match would let it in twice. Matching is counted as a
multiset, so two genuine coffees on one day both import when the account holds
one of them.

The trade-off is that two unrelated charges of the same amount on the same day
look identical to this rule, so skipped rows are listed with their descriptions
for the user to check before importing.

### Follow-on slices

- **Planned** — balance-history CSV import
- **Planned** — merchant and account breakdowns
- **Planned** — monthly trend charts and multi-period comparison
- **Planned** — saved reports and sharing

### Verification

- Unit tests cover transfer and split exclusion, refund netting, the null
  savings rate, breakdown ordering and shares, uncategorized bucketing, and
  comparison against an empty period.
- Browser verification runs against a cloned production household, where the
  totals can be checked against the same data the transaction list shows.

## P1 product requirements: Smart transaction workflow

### First vertical slice: merchant cleanup rules — shipped

The first P1 slice makes a repeated transaction correction reusable without
pretending that Mintea can safely infer a broad rule from one edit.

Users can:

- **Shipped** — choose an existing canonical merchant or create one while
  editing a transaction
- **Shipped** — preview how many active transactions share the exact bank
  description
- **Shipped** — apply the selected merchant and category to those historical
  matches
- **Shipped** — remember the cleanup for future Plaid imports
- **Shipped** — review, pause, resume, and delete saved rules from Settings

The initial matcher normalizes only capitalization, leading/trailing spaces,
and repeated spaces. It does not use substring, similarity, amount, or merchant
logo matching. `BLUE BOTTLE COFFEE #1842` can match a differently-cased copy of
the same string, but it cannot match `BLUE BOTTLE COFFEE #1843`.

Historical application and rule creation run together in Postgres. The rule
cannot reference a merchant or category from another household. Existing
split-category allocations are preserved, and user-selected merchants survive
the Plaid pending-to-post transition.

Deleting a rule does not undo past corrections. It only stops future automatic
cleanup. This makes rule lifecycle behavior predictable and avoids silently
rewriting reviewed history.

### Second vertical slice: tags — shipped

Tags cut across categories: a transaction has exactly one category but any
number of tags, so "reimbursable", "tax deductible", and a trip name can coexist
on the same row without competing with categorization.

Users can:

- **Shipped** — create, rename, recolour, and delete tags from Settings → Tags,
  with usage counts and a delete confirmation that names how many transactions
  are affected and states that the transactions themselves are kept
- **Shipped** — create a tag inline while assigning one, so tagging does not
  require a detour into Settings first
- **Shipped** — assign and unassign tags on a transaction
- **Shipped** — see tags on transaction rows
- **Shipped** — filter the transaction list by one or more tags
- **Shipped** — apply a tag to a multi-transaction selection in one action

Tag names are normalized in Postgres (trimmed, internal whitespace collapsed)
and are unique per household case-insensitively, so "Tax Deductible" and "tax
deductible" cannot both exist. The name rules live in a database trigger and a
unique index rather than only in the client, so a second device or a direct API
call cannot create a duplicate.

Assignment and bulk tagging run through SQL functions. Replacing a
transaction's tags is atomic, bulk tagging reports how many rows it actually
changed rather than how many were selected, and neither can reference a tag or
transaction from another household. Deleting a tag removes its assignments and
leaves the transactions intact.

Tag filtering uses a PostgREST inner-joined embed rather than looking up
matching transaction ids and passing them back in an `id=in.(…)` list, so the
request size does not grow with how heavily a tag is used.

### Follow-on slices

- **Planned** — more rule conditions and actions with explicit previews
- **Planned** — retroactive rule runs initiated from rule management
- **Planned** — percentage splits and broader bulk transaction actions
- **Planned** — removing a tag from a whole selection (bulk tagging currently
  only adds)
- **Planned** — tag-based reporting and budgets

### Third vertical slice: category groups — shipped

Categories could be renamed and moved since the first release, but the groups
holding them were fixed: `createCategoryGroup` existed in the data layer and
nothing in the app called it, and there was no way to rename, reorder or remove
one at all.

Users can now create a group, rename it, change what it counts as, move it up
and down the list, and delete it.

Deleting is where the care went. The schema already cascades:

    category_groups --on delete cascade--> categories
    categories      --on delete set null--> transactions.category_id
    categories      --on delete cascade--> transaction_rules

A plain delete would therefore destroy every category in the group, silently
uncategorise every transaction that used them, and remove any cleanup rules
that referenced them. The money survives; years of categorisation do not.

So deletion goes through a SQL function that refuses to run unless the group is
empty or its categories have somewhere to go, and the screen asks where they
should move before offering the button. A group is a container, and removing a
container should not destroy its contents. Verified on a copy of the production
household: deleting a five-category group relocated all five and left all 53
transactions categorised exactly as before.

Reordering is applied in a single statement rather than a write per row, since
partial ordering shows as groups jumping around; the same function renormalises
the gaps that deleting a group leaves behind.

### Verification

- Migration tests execute the full schema and prove exact normalization,
  historical application, household authorization, and safe rejection paths.
- TypeScript checks and the production web build must pass.
- Browser verification covers merchant search/creation, rule preview,
  enable/pause/delete, success/error/loading states, responsive presentation,
  accessibility semantics, and light/dark themes.
- For tags, migration tests cover name normalization, case-insensitive
  uniqueness per household, usage counts that exclude removed rows and split
  children, atomic set-replacement with rollback, bulk tagging change counts,
  cross-household rejection, and delete cascade. Unit tests cover the shared
  name-validation and display-ordering rules. Browser verification covers
  create/rename/recolour/delete, inline creation, the duplicate-name message,
  assignment, row display, filtering, bulk tagging, and the destructive delete
  confirmation, at phone/tablet/desktop widths in both themes, including the
  empty and error states.
