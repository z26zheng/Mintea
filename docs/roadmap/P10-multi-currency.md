[← Roadmap index](../PRODUCT_ROADMAP.md)

# P10 — Multi-currency

Status: scoped, not started. Not in the current top five; see the note on
sequencing at the end of this section.

Native currency is already recorded, on `accounts.currency` and
`transactions.currency`. Balances and property values carry no currency of their
own and inherit their account's, which is the right shape — an account has one
native currency, so a conversion joins through the account rather than trusting a
column that could disagree with it.

What is missing is everything above that. Nothing reads those columns, and every
screen renders as though one currency exists. That is true for a US-only
household and false the moment someone holds a foreign account, buys abroad, or
shares a family across a border.

## The rule

**Convert each amount at the rate for the date that amount describes.**

That single rule produces the two behaviours people expect, and the difference
between them is not a special case:

| Amount | Date it describes | Rate used | Converted value moves? |
|---|---|---|---|
| A transaction posted 12 March | 12 March | 12 March | Never — the date cannot change |
| A balance snapshot for 1 June | 1 June | 1 June | Never |
| A current account balance | Today | Today | Yes, daily |
| A current property valuation | Today | Today | Yes, daily |

A transaction's converted amount is stable because its date is in the past, not
because transactions are treated differently. A savings balance moves against a
foreign display currency because it genuinely is worth a different amount today,
and reporting it at the rate from its last sync would be the same class of error
as a stale balance that looks current.

## Two currencies, not one

- **Display currency is per user.** `profiles.currency` already exists and stays
  where it is. It is a lens, not a property of the data: two members of one
  family may read the same shared house in CAD and USD, and they are not
  disagreeing. Because rates are daily rather than intraday, both numbers derive
  from the same published rate and reconcile exactly.
- **Planning currency is per household.** An authored amount is not an
  observation. A C$500 budget is a different promise from a US$365 budget, and
  if the plan were stored in whichever currency its author happened to be using,
  the same plan would mean different things to two members and drift whenever
  the rate moved. Budget plans, and later goal targets, are therefore stored in
  one household planning currency and displayed converted.

The consequence that governs the implementation: **no converted amount is ever
stored on a shared row.** With display currency per user there is no single
converted value to persist, so conversion is computed per viewer at read time
against a shared rates table. Native amounts remain the record; converted
figures are derived and display-only, which also stops a CAD to USD and back
round trip from quietly losing money to rounding.

## P10.1 — Rates foundation

- **Planned** — a rates table keyed by date, base and quote, indexed for the
  per-viewer joins every total will make
- **Planned** — a daily fetch from [Frankfurter](https://frankfurter.dev/),
  chosen because it is MIT licensed, needs no API key, permits commercial use,
  and can be self-hosted from Docker if the public instance becomes unavailable
- **Planned** — historical backfill through the time-series endpoint, so a
  household's whole balance history can be converted the day the feature ships
- **Planned** — carry-forward for weekends and holidays, when no reference rate
  is published, recording which date a carried rate came from rather than
  implying a rate was quoted that day
- **Planned** — a stale-rates state that says so, on the same reasoning as
  connection health: a conversion silently using a two-week-old rate is worse
  than one that admits it

## P10.2 — Display conversion

- **Planned** — per-viewer conversion across dashboard, accounts, transactions,
  reports, net worth, search and budgets, each amount converted at the rate for
  the date it describes
- **Planned** — the original amount and currency shown wherever a converted
  figure could mislead, with the rate and its date available on inspection
- **Planned** — exports that name the currency they are in and carry the native
  amount alongside the converted one; a bare `Amount` column is a landmine when
  two members export the same data and get different numbers
- **Planned** — notification rendering per recipient, so one over-budget alert
  reaches two members each in their own currency; the payload carries the native
  amount and rate date rather than a pre-formatted string

## P10.3 — Explaining currency movement

- **Planned** — separation of change from activity and change from exchange rate
  in net worth history and period comparisons
- **Planned** — a plain-language account of a movement no transaction explains,
  so a household whose net worth fell overnight without spending anything is
  told why

A Canadian holding a US savings account has currency exposure, and their net
worth in CAD moves on days they do nothing at all. That is correct and it is
information, but presented without explanation it reads as a bug and undermines
the one thing the product is for. Monarch handles this poorly, which makes it an
opening rather than only a hazard.

## P10.4 — Authored amounts

- **Planned** — a household planning currency, set once and changed only with an
  explicit confirmation that states what happens to existing plans
- **Planned** — budget plans stored in the planning currency and displayed in
  each member's own, so editing a plan cannot change its meaning for anyone else
- **Planned** — an explicit currency on a manually entered property value.
  Manual entry already overrides an automatic estimate; it must not also
  silently reinterpret the unit when a Canadian types a value for a US property
- **Planned** — manual account and transaction entry in a chosen currency rather
  than an assumed one

## Non-goals

- Real-time or intraday rates. Daily published rates are deliberate: they keep
  two members of a family reconcilable and keep a report reproducible.
- Currency conversion as a financial service. Mintea reports what things are
  worth; it does not quote, execute or advise on exchange.
- Multi-currency accounts, where one account holds balances in several
  currencies. An account has one native currency in P10.
- Cryptocurrency valuation, which is a holdings problem for P7 rather than a
  foreign-exchange one.

## Success measures

- A household with accounts in two currencies reports a net worth that
  reconciles to the sum of its native balances at the published rates for the
  dates involved.
- A report exported twice a month apart shows identical historical figures.
- Two members of one family, displaying different currencies, see totals that
  convert into each other exactly at the published daily rate.
- A net worth movement with no underlying transaction is attributed to exchange
  rates rather than left unexplained.

## Sequencing

P10 is not in the current top five. It serves households that hold foreign
accounts or span a border, which is a smaller group than the one waiting on
notifications, family accounts or recurring bills.

Two dependencies are worth recording anyway. P10.4's household planning currency
is a prerequisite for multi-currency budgets, so if P3.2 is ever expected to
serve a cross-border family, that decision lands earlier than this package does.
And P10.2's per-recipient notification rendering is far cheaper to build into
[P11](P11-notifications.md)'s substrate than to retrofit once alerts are already sending formatted
strings.
