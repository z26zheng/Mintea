[← Roadmap index](../PRODUCT_ROADMAP.md)

# P2 — Historical data and Reports Lite

Status: three vertical slices shipped (period reporting, duplicate-aware CSV
import, and report follow-ons); balance-history import remains.

Scope:

- **Shipped** — income, spending, net cash flow, and savings rate
- **Shipped** — drilldown from a breakdown row to the transactions behind it
- **Partial** — duplicate-aware CSV import; transactions are shipped, web only,
  and balance history is not
- **Partial** — CSV export; household-wide is shipped, web only, and per-account
  scoping is not
- **Shipped** — breakdowns; category, group, merchant, and account are sorted
  largest first with share bars and transaction-list drilldown
- **Shipped** — period comparison; the preceding period of the same length is
  supplemented by monthly trend charts and a multi-period comparison
- **Planned** — filters shared across report views
- **Planned** — saved reports, Sankey diagrams, and image sharing

The last of those follow after the core reports are accurate and useful.


---

## Product requirements: Reports Lite

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
- **Shipped** — merchant and account breakdowns
- **Shipped** — monthly trend charts and multi-period comparison
- **Planned** — saved reports and sharing

### Verification

- Unit tests cover transfer and split exclusion, refund netting, the null
  savings rate, category/group/merchant/account breakdown ordering and shares,
  uncategorized bucketing, quiet months, and comparison against an empty period.
- Browser verification runs against a cloned production household, where the
  totals can be checked against the same data the transaction list shows.
