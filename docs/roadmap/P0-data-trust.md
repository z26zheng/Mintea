[← Roadmap index](../PRODUCT_ROADMAP.md)

# P0 — Data trust and account hygiene

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


---

## Product requirements: Data Trust

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
