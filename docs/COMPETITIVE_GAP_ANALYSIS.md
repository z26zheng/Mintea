# Competitive Gap Analysis: Monarch and Rocket Money

Last updated: August 6, 2026

Mintea is described in its own README as "a personal finance app in the mold of
Monarch Money." This document checks that claim against the two products it will
actually be compared to, and converts the difference into a build order.

## Method

Mintea's column is derived from the repository at commit `6b2dd6b` — the routes
under `apps/mintea/app`, the queries in `packages/core`, and the fifteen
migrations in `supabase/migrations` — not from
[PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md). The two disagree in one place: the
roadmap lists self-service account deletion as still planned, and it shipped.

Competitor rows come from vendor documentation and 2026 reviews. Where a
capability could not be confirmed from a primary source it is recorded as absent
rather than assumed, so the competitors' columns are conservative.

A capability counts as shipped under the same rule the roadmap uses: reachable
through a safe user experience, not merely present as a field or a table.

## Summary

Across 66 compared capabilities, Mintea ships 23, partially ships 7, and has no
form of 36. Monarch ships 31 capabilities that Mintea has in no form at all.

The distribution matters more than the total. Mintea is at or above parity on
connectivity, accounts and net worth, and it is genuinely ahead on data
correctness. It is at zero on planning: of the ten budgeting, bill and goal
capabilities compared, none exist, and no table in the schema anticipates them.

| Domain | Shipped | Partial | Absent |
|---|---|---|---|
| A · Connectivity and data foundation | 5 | 2 | 0 |
| B · Accounts and net worth | 6 | 0 | 0 |
| C · Transactions | 7 | 3 | 3 |
| D · Reports and insight | 2 | 0 | 6 |
| E · Planning — budgets, bills, goals | 0 | 0 | 10 |
| F · Investments | 0 | 0 | 4 |
| G · Collaboration | 0 | 1 | 3 |
| H · Engagement and platform | 1 | 1 | 5 |
| I · Money-saving services | 0 | 0 | 4 |
| J · Account security and portability | 2 | 0 | 1 |
| **Total** | **23** | **7** | **36** |

## Findings

### Mintea is not a worse Monarch; it stopped one layer short

Everything shipped so far answers *is this number right?* — duplicate-account
merging with a dry run, reversible transfer pairing, one-to-one overlap
fingerprinting, import matching on date and amount rather than description,
connection staleness reported even when Plaid returns success. Neither
competitor markets any of this, and on the evidence available neither offers a
guided duplicate merge at all.

That is a real asset, and it is not a product on its own. Nobody pays for a
clean ledger; they pay for what a clean ledger lets them decide. The correctness
work is the foundation the roadmap said it was — but a foundation is only worth
what gets built on it.

### The largest gap is not budgets, it is that nothing brings a user back

Monarch pushes a notification before a bill is charged and sends a weekly
recap. Rocket Money alerts on balances and upcoming charges. Mintea sends
nothing, to anyone, ever: there is no notification dependency in
`apps/mintea/package.json`, no transactional email, and no scheduled job that
could deliver either.

This is why the notification substrate is treated as part of the budgeting
package rather than as part of P4 below. A budget nobody is told they blew is a
spreadsheet, and building budgets first with alerts three packages later means
building budgets twice.

### Collaboration is already paid for and still unshipped

Every table carries `household_id`, and every RLS policy already gates on
household membership — the deliberate cost the schema paid up front so that
"partner sharing is a later feature rather than a migration that rewrites every
RLS policy." What is missing is an invitation flow, a members screen, and an
owner column on transactions.

That is a fraction of what budgeting costs. It is also the market Monarch built
its business on, and Rocket Money puts account sharing behind Premium. Holding
it at P6, behind budgets, bills and goals, spends the schema's foresight on
nothing.

### Rocket Money is a services business, not a feature competitor

Its premium value is concierge subscription cancellation, bill negotiation at a
35–60% success fee, and credit bureau data. Those require staff on phones,
carrier relationships and a bureau agreement. They are not engineering problems,
and they are precisely why Rocket Money can afford to give the ledger away.

Mintea should not chase them. What Rocket Money does set is a *free-tier floor* —
subscription list, upcoming bills, credit score — and Mintea is below it today
on the first two.

### Monarch has moved twice since this roadmap was written

Monarch Core absorbed a natural-language assistant, receipt scanning, and
item-level Amazon and Target categorization. In April 2026 it added a second
paid tier, Monarch Plus, carrying scenario forecasting, business and rental
tracking, Morningstar fund analysis, and gains and losses with tax lots.

Two consequences. Forecasting, filed here under "P9 — advanced planning and
polish," is now a shipped competitor tier. And Mintea's deterministic-only
stance on categorization is now a visible difference rather than a quiet one; it
is defensible, but it has to be argued rather than left to look like a product
that has not caught up.

## The matrix

Mintea's status uses the roadmap's own vocabulary. For competitors, the tier
name records where the capability sits: Monarch **Core** or **Plus**, Rocket
Money **Free** or **Premium**.

### A · Connectivity and data foundation

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Bank aggregation | Shipped — Plaid only | Core — 13,000+ institutions | Free |
| Plain-language connection errors | Shipped | Core | Free |
| In-place reconnect (Link update mode) | Shipped | Core | Free |
| On-demand balance refresh | Shipped — 1×/item/hour | Core | Premium |
| Guided duplicate-account merge | Shipped | No equivalent | No equivalent |
| CSV import | Partial — web only | Core | Absent |
| CSV export | Partial — web only | Core | Premium |

### B · Accounts and net worth

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Manual accounts | Shipped | Core | Premium |
| Net worth tracking | Shipped | Core | Premium |
| Balance and net-worth history | Shipped | Core | Premium |
| Account grouping and visibility | Shipped | Core | Premium |
| Credit utilization | Shipped | Core | Free |
| Automatic property valuation | Shipped — RentCast | Core | Absent |

### C · Transactions

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Search and filters | Shipped | Core | Free |
| Custom category tree | Shipped | Core | Premium — 2 free |
| Category group management | Shipped | Core | Premium |
| Tags | Shipped | Core | Premium |
| Transaction splits | Partial — fixed only | Core | Premium |
| Categorization rules | Partial — exact match only | Core | Premium |
| Merchant normalization | Shipped | Core | Premium |
| Transfer detection and pairing | Shipped | Core | Premium |
| Bulk editing | Partial — tag add only | Core | Premium |
| Review queue | Shipped | Core | Absent |
| Receipt capture and attachments | **Absent** | Core — AI scan | Absent |
| Item-level retail categorization | **Absent** | Core | Absent |
| Learned auto-categorization | **Absent** — deterministic by choice | Core | Free |

### D · Reports and insight

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Income, spending, net cash flow, savings rate | Shipped | Core | Free |
| Category breakdown with drilldown | Shipped | Core | Premium |
| Merchant and account breakdowns | **Absent** | Core | Premium |
| Tag-based reporting | **Absent** | Core | Absent |
| Monthly trends and multi-period comparison | **Absent** — one prior period | Core | Premium |
| Sankey cash-flow diagram | **Absent** | Core — web | Absent |
| Saved reports and sharing | **Absent** | Core | Absent |
| Customizable dashboard | **Absent** | Core | Premium |

### E · Planning — budgets, bills, goals

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Category budgets | **Absent** — no schema | Core | Premium |
| Flex / non-category budgeting | **Absent** | Core | Absent |
| Budget rollover and exclusion | **Absent** | Core | Premium |
| Recurring stream detection | **Absent** | Core | Free — signature feature |
| Upcoming bills list and calendar | **Absent** | Core | Free |
| Expected-vs-actual matching, amount-change alerts | **Absent** | Core | Free |
| Savings goals | **Absent** | Core | Premium |
| Debt payoff planning | **Absent** | Core | Absent |
| Automated savings transfers | **Absent** | Absent | Premium |
| Forecasting and scenario modelling | **Absent** | Plus | Absent |

### F · Investments

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Holdings and securities | **Absent** | Core | Premium |
| Allocation and performance | **Absent** | Core | Absent |
| Fund analysis and diversification | **Absent** | Plus — Morningstar | Absent |
| Gains, losses and tax lots | **Absent** | Plus | Absent |

### G · Collaboration

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Partner / household sharing | Partial — schema and RLS only | Core — unlimited | Premium |
| Per-member transaction attribution | **Absent** | Core | Absent |
| Advisor / professional access | **Absent** | Core — portal | Premium |
| Business and rental tracking | **Absent** | Plus | Absent |

### H · Engagement and platform

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Web app | Shipped | Core | Premium |
| iOS and Android apps | Partial — configured, not submitted | Core | Free |
| Mobile home-screen widgets | **Absent** | Core | Premium |
| Push notifications | **Absent** — no dependency installed | Core | Free |
| Email digests | **Absent** | Core — weekly recap | Free |
| Balance and spending alerts | **Absent** | Core | Premium |
| Natural-language assistant | **Absent** | Core | Absent |

### I · Money-saving services

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Subscription cancellation concierge | Absent | Absent | Premium — signature feature |
| Bill negotiation | Absent | Absent | Free to start, 35–60% success fee |
| Credit score | Absent | Absent | Free |
| Full credit report | Absent | Absent | Premium — FICO 2, Experian |

### J · Account security and portability

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Multi-factor authentication | **Absent** | Core | Free |
| Self-service account deletion | Shipped | Core | Free |
| Full data export | Shipped — web | Core | Premium |

## What Mintea has that neither competitor does

These are shipped and verified against a clone of the production household. They
are also the only available basis for a positioning claim other than "cheaper
Monarch."

- **Reviewed duplicate-account merge.** Detection across separate Plaid Items, a
  dry-run impact summary, one-to-one overlap fingerprinting, and archival rather
  than deletion. Both competitors leave double-counted accounts to the user.
- **An import that refuses to guess.** Ambiguous date order is surfaced rather
  than silently resolved, and duplicates match on date and amount instead of
  description — the only rule that survives a bank CSV landing in an account
  Plaid also feeds.
- **Staleness that gets reported.** A connection returning success but producing
  nothing for five days is called out. Every competitor's quiet failure mode is a
  stale balance that looks current, and everything downstream inherits it.
- **Self-hostable, with no data monetization.** Both competitors are closed SaaS,
  and Rocket Money's revenue depends on acting on the user's accounts. Mintea's
  whole stack runs in a Supabase project the user controls.
- **Reconstructed property history.** A valuation is backfilled monthly from
  purchase price and date, so a house bought in 2019 does not draw a flat line
  and then jump. Monarch tracks home value; it does not rebuild the curve.
- **Per-household Plaid environment.** Sandbox and production coexist in one
  project, which is why verification runs against a copy of real data rather than
  a fixture. Invisible to users, and the reason several of the bugs above were
  caught.

## Structural gaps that are not features

- **No monetization surface exists.** There is no plan, entitlement or billing
  concept anywhere in the schema. If Mintea ever intends to charge, that boundary
  should exist *before* features are built across it — retrofitting one means
  touching every query, which is the same argument that put `household_id` on
  every table from the first migration.
- **"Universal codebase" is a claim until something is in a store.** The
  groundwork is further along than the gap suggests: `eas.json` defines a
  production profile with store distribution and a `submit` block, and CI already
  exports both native bundles on every run. What is missing is the submission
  itself — plus both CSV import and export, which are explicitly disabled on
  native. Money apps are used on phones; Rocket Money charges for its iOS widget,
  which is a fair measure of what mobile presence is worth.
- **Single aggregator.** Monarch advertises 13,000+ institutions across multiple
  providers; Mintea is Plaid-only, so Plaid's coverage gaps and outages are
  Mintea's. Deferring this to P8 is correct — it is an operational cost, not a
  feature — but it caps reach until measured.
- **MFA is filed as a decision, and it is a small one.** The roadmap blocks it on
  which factors to support and whether enrolment is forced. Supabase ships TOTP,
  and optional enrolment is the ordinary answer. It is the cheapest credibility
  gap on this list.

## What they charge

| Product | Price | What it buys |
|---|---|---|
| Monarch Core | $14.99/mo or $99.99/yr | Unlimited accounts, budgets, goals, recurring, investments, household collaboration, AI assistant |
| Monarch Plus | $199–299/yr | Forecasting, business and rental tracking, Morningstar fund analysis, gains and losses with tax lots. Sources disagree on list price |
| Rocket Money Premium | $7–14/mo, "pay what you think is fair" | Unlimited budgets, goals, net worth, rules, splits, export, sharing, web, widgets. Bill negotiation charges 35–60% of first-year savings on top |
| Mintea | Not priced | No billing, tiers or entitlement model |

## What this changes in the roadmap

The package numbering in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) is unchanged —
P0 through P9 are stable identifiers referenced throughout that document. What
changes is the order they are built in, recorded there under *What to build
next*. Two departures from numeric order come out of this analysis:

1. The notification substrate moves out of P4 and ships with P3, because
   budgets, bills, goals and re-engagement all depend on it and none of them
   should ship without it.
2. P6 household collaboration moves ahead of P5 goals and P4 recurring, on the
   grounds that its schema cost is already sunk and its differentiation per unit
   of remaining work is the highest available.

## Sources

- [Monarch Plus announcement](https://www.monarch.com/blog/monarch-plus)
- [Monarch Plus launch release](https://www.prnewswire.com/news-releases/monarch-launches-premium-tier-monarch-plus-302748653.html)
- [Rocket Money premium membership features](https://help.rocketmoney.com/en/articles/2677184-premium-membership-features)
- [Rocket Money pricing](https://www.rocketmoney.com/learn/personal-finance/how-much-does-rocket-money-cost)
- [Monarch Money review 2026](https://www.thepennyhoarder.com/budgeting/monarch-money-review/)
