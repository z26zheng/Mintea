# Mintea Product Roadmap

Last updated: July 28, 2026

## Product direction

Mintea should become the most trustworthy way for a household to understand and
organize its money. The product should earn breadth in layers:

1. make connected financial data correct and explainable;
2. make daily transaction cleanup fast and increasingly automatic;
3. turn clean history into useful reports and a practical monthly plan;
4. add recurring obligations, goals, collaboration, and portfolio depth.

This roadmap prioritizes user reach, frequency of use, trust, and leverage from
the code already shipped. It does not attempt feature-for-feature Monarch parity
in one release.

## Current foundation

Mintea already ships:

- Plaid account and transaction sync, connection health, reauthentication,
  disconnection, and throttled real-time balance refreshes;
- linked and manual accounts, credit utilization, account grouping, account
  visibility controls, and durable account removal;
- manual and automatically valued real estate;
- net worth, cash, assets, liabilities, and cash-flow history;
- transaction search, filters, review, editing, notes, hiding, removal, fixed
  splits, manual entry, and limited bulk editing;
- a household-scoped category tree, canonical merchant editing, and partially
  surfaced tag data;
- reviewed duplicate-account detection and merging with conservative
  transaction reconciliation, balance-history transfer, and source archival;
- suggested and manual transfer pairing with reversible cash-flow exclusion;
- exact-description transaction cleanup rules with previews, historical
  application, future-sync application, and rule management;
- row-level security and isolated Plaid access tokens.

These capabilities are the base for the roadmap below. A field or table that is
not reachable through a safe user experience does not count as a shipped
feature.

## Shipped implementation status

As of July 29, 2026, three vertical slices of P0 Data Trust and two of P1 Smart
Transaction Workflow are deployed to production. This does not mean every item
in either roadmap package is complete.

| Package | Status | Implemented | Still planned |
|---|---|---|---|
| P0 — Data Trust | Third vertical slice shipped | High-signal duplicate candidates across Plaid Items; reviewed keep-account choice; dry-run impact summary; atomic merge; one-to-one overlap archival; transfer of unique transactions, splits, and missing balance dates; archived source and audit metadata; transfer suggestions plus manual match/unmatch; CSV export of transactions and accounts; connection health with plain-language errors, consent-expiry and staleness warnings, and in-place reconnect | Pre-merge backup; CSV import; MFA; self-service account deletion; user-facing merge undo; export on native |
| P1 — Smart Transactions | Second vertical slice shipped | Canonical merchant search and creation; exact bank-description match preview; historical merchant/category cleanup; saved rules for future Plaid imports; rule pause, resume, and deletion; preservation of explicit merchant edits during pending-to-posted reconciliation; tag creation, rename, recolour, and deletion; tag assignment from a transaction; tag display on rows; tag filtering; bulk tag application | Full category-group management; broader bulk actions beyond tagging and categorizing; additional rule conditions/actions; quick-rule suggestions; percentage splits; removing a tag from many transactions at once |

The production release was verified with 69 automated tests, TypeScript checks,
the production web build, executable migration tests, and browser coverage at
desktop, tablet, and phone widths in light and dark themes. The Supabase
migrations and sync function are live. A read-only production smoke test
confirmed the merchant editor, exact-match preview, and rule-management entry
points without modifying user data.

## Prioritization model

Feature packages are ordered using four questions:

1. **Reach:** How many users benefit?
2. **Trust and frequency:** Does it affect correctness or a repeated workflow?
3. **Leverage:** How much of the necessary model and UI already exists?
4. **Dependency:** Which later features become useful only after this one?

## Roadmap

### P0 — Data trust and account hygiene

Status: three vertical slices shipped (account merging, CSV export, then
connection health); account-security and merge-undo work remains.

Correctness is a prerequisite for every total, chart, report, budget, recurring
schedule, and goal.

Scope:

- conservative likely-duplicate account detection;
- reviewed account merge with a dry-run impact summary;
- one-to-one reconciliation of overlapping transactions;
- transfer of non-overlapping transaction and balance history;
- preservation of the archived source account and merge audit metadata;
- transfer suggestions plus manual match and unmatch;
- CSV export and a pre-merge backup path;
- better sync diagnostics;
- account security basics such as MFA and self-service account deletion.

The product must never silently merge two accounts based only on a name, balance,
or last four digits.

### P1 — Smart transaction workflow

Status: two vertical slices shipped (merchant cleanup rules, then tags); the
remaining transaction-organization and rule-expansion work is still planned.

Scope:

- merchant editing and consolidation;
- tag creation, assignment, removal, and filtering;
- complete category-group management, reordering, and deactivation;
- broader bulk editing for tags, merchant, review, visibility, and removal;
- deterministic transaction rules with preview and retroactive application;
- quick-rule suggestions after repeated corrections;
- fixed and percentage smart splits.

Rules should be deterministic before Mintea claims personalized or AI
categorization.

### P2 — Historical data and Reports Lite

Scope:

- duplicate-aware transaction and balance-history CSV import;
- account-level and household-wide CSV export;
- income, spending, net cash flow, and savings rate;
- category, group, merchant, and account breakdowns;
- monthly trends and period comparisons;
- shared filters and drilldown from a chart to its transactions.

Saved reports, Sankey diagrams, and image sharing follow after the core reports
are accurate and useful.

### P3 — Core monthly budgeting

Scope:

- planned, actual, and remaining amounts by month and category;
- group totals and drilldown;
- previous/next month navigation;
- copy previous month and historical-average suggestions;
- category exclusion and rollover.

Traditional category budgeting ships before Flex budgeting because Mintea
already has the category tree and rollover/exclusion fields.

### P4 — Recurring bills and subscriptions

Scope:

- recurring-stream detection from merchant, amount, cadence, and history;
- user confirmation, rejection, and manual creation;
- upcoming list and monthly calendar;
- expected-versus-actual matching;
- amount-change, missed-payment, and cancellation status;
- email and push reminders.

Credit-report bill sync, statement balances, minimum payments, and credit scores
are later integrations.

### P5 — Goals

Ship savings goals first:

- target amount and date;
- planned monthly contribution;
- linked accounts;
- progress and projected completion.

Then add debt payoff:

- APR, minimum payment, and planned payment;
- payoff date and projected interest;
- extra-payment scenarios;
- budget contribution integration.

### P6 — Household collaboration

Scope:

- invitations and member management;
- shared and individual account ownership;
- transaction ownership;
- owner filters across accounts, transactions, and reports;
- review assignment;
- shared budget and goal visibility.

Move this package earlier if couples become Mintea's primary customer.

### P7 — Investments

Scope:

- Plaid Investments;
- securities and holdings;
- quantity, price, current value, and manual holdings;
- allocation and basic performance;
- top movers.

Benchmarks, cost basis, tax lots, fund analysis, equity vesting, and tax planning
are later portfolio features.

### P8 — Connectivity and specialty integrations

Add another aggregation provider only when connection failure and coverage data
justify the operational cost. Apple Card, vehicle valuation, bill sync, and
other direct integrations should follow measured demand.

### P9 — Advanced planning and polish

Longer-term scope includes forecasting, business tracking, tax reports,
customizable dashboards, attachments and receipt capture, mobile widgets,
offline mode, and advanced privacy controls.

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

## P1 product requirements: Smart transaction workflow

### First vertical slice: merchant cleanup rules — shipped

The first P1 slice makes a repeated transaction correction reusable without
pretending that Mintea can safely infer a broad rule from one edit.

Users can:

- choose an existing canonical merchant or create one while editing a
  transaction;
- preview how many active transactions share the exact bank description;
- apply the selected merchant and category to those historical matches;
- remember the cleanup for future Plaid imports;
- review, pause, resume, and delete saved rules from Settings.

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

- create, rename, recolour, and delete tags from Settings → Tags, with usage
  counts and a delete confirmation that names how many transactions are
  affected and states that the transactions themselves are kept;
- create a tag inline while assigning one, so tagging does not require a detour
  into Settings first;
- assign and unassign tags on a transaction;
- see tags on transaction rows;
- filter the transaction list by one or more tags;
- apply a tag to a multi-transaction selection in one action.

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

- full category-group creation, ordering, and deactivation;
- more rule conditions and actions with explicit previews;
- retroactive rule runs initiated from rule management;
- percentage splits and broader bulk transaction actions;
- removing a tag from a whole selection (bulk tagging currently only adds);
- tag-based reporting and budgets.

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
