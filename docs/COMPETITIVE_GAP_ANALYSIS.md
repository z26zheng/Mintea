# Competitive Gap Analysis: Monarch and Rocket Money

Last updated: August 11, 2026

Mintea is described in its own README as "a personal finance app in the mold of
Monarch Money." This document checks that claim against the two products it will
actually be compared to, and converts the difference into a build order.

## Method

Mintea's column is derived from the repository at commit `c4efb23` — the routes
under `apps/mintea/app`, the queries in `packages/core`, and the nineteen
migrations in `supabase/migrations` — rather than from
[PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md). Reading the code rather than the
roadmap caught two things the roadmap had wrong: self-service account deletion
was listed as planned but had shipped, and monthly budgets shipped while this
analysis was being written. Both are corrected in that document.

The matrix compares Mintea against Monarch and Rocket Money only. Those are the
two products it will actually be measured against — one is the feature
benchmark, the other sets the free-tier floor — and a six-column matrix would be
unreadable. The rest of the field is covered in *The wider field* below, which
is about positioning rather than feature counts.

Competitor rows come from vendor documentation and 2026 reviews. Where a
capability could not be confirmed from a primary source it is recorded as absent
rather than assumed, so the competitors' columns are conservative.

A capability counts as shipped under the same rule the roadmap uses: reachable
through a safe user experience, not merely present as a field or a table.

## Summary

Across 67 compared capabilities, Mintea ships 27, partially ships 7, and has no
form of 33. Monarch ships 28 capabilities that Mintea has in no form at all.

The distribution matters more than the total. Mintea is at or above parity on
connectivity, accounts and net worth, and it is genuinely ahead on data
correctness. Planning is where it is thinnest: of the ten budgeting, bill and
goal capabilities compared, one exists. Monthly category budgets shipped in
August 2026 and are the only planning capability Mintea has.

| Domain | Shipped | Partial | Absent |
|---|---|---|---|
| A · Connectivity and data foundation | 5 | 2 | 1 |
| B · Accounts and net worth | 6 | 0 | 0 |
| C · Transactions | 7 | 3 | 3 |
| D · Reports and insight | 4 | 0 | 4 |
| E · Planning — budgets, bills, goals | 1 | 0 | 9 |
| F · Investments | 0 | 0 | 4 |
| G · Collaboration | 1 | 0 | 3 |
| H · Engagement and platform | 1 | 2 | 4 |
| I · Money-saving services | 0 | 0 | 4 |
| J · Account security and portability | 2 | 0 | 1 |
| **Total** | **27** | **7** | **33** |

## Findings

### Mintea is not a worse Monarch; it is one layer behind

Almost everything shipped answers *is this number right?* — duplicate-account
merging with a dry run, reversible transfer pairing, one-to-one overlap
fingerprinting, import matching on date and amount rather than description,
connection staleness reported even when Plaid returns success. Neither
competitor markets any of this, and on the evidence available neither offers a
guided duplicate merge at all.

Monthly budgets are the first shipped feature that answers *what should I do?*
instead, and they are one capability against Monarch's ten. Correctness is a
real asset and not a product on its own: nobody pays for a clean ledger, they
pay for what a clean ledger lets them decide.

### Nothing brings a user back, and one missing job is why

This finding used to read that Mintea sent nothing to anyone, ever. Most of that
is now fixed: there is an in-app notification centre, connection-health and
budget conditions that resolve themselves, family events, a durable email outbox
with cross-channel dedup, and Resend delivery behind it.

What is missing is the trigger. `notification-evaluate` and
`notification-dispatch` both exist and nothing calls them on a schedule — there
is still no `pg_cron` and no workflow cron in the repository. So conditions are
evaluated when something happens to ask, and the outbox drains when something
happens to drain it.

The practical effect is unchanged from before, which is what makes it worth
keeping as a finding: a user whose bank connection died still finds out by
opening the app. The difference is that the remaining work is now one scheduled
job rather than a package, which is why the build order puts it first.

### Collaboration is half paid for, and the other half is bigger than it looks

Every table carries `household_id`, and every RLS policy already gates on
household membership — the deliberate cost the schema paid up front so that
"partner sharing is a later feature rather than a migration that rewrites every
RLS policy." That is the market Monarch built its business on, and Rocket Money
puts account sharing behind Premium.

P6.1 has since shipped: invitations with roles, per-account Family or Private
visibility enforced by `current_visible_account_ids()`, and an atomic join. The
schema foresight paid off exactly as intended.

The estimate was still too low, and the part that remains is the part that was
underestimated. A member who joins with existing data needs their household
migrated and deduplicated, and P6.1 explicitly refuses to try — a populated
household is turned away with *"Use the family migration flow instead."* So the
feature currently serves only new signups, and the honest comparison for what is
left is against P4 or P5 rather than against a screen.

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
| Bank aggregation | Shipped — Plaid only | Core — Plaid, Finicity and MX | Free |
| User-selectable data provider | **Absent** | Core — recommended default, alternates behind a `…` | Absent |
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
| Merchant and account breakdowns | Shipped | Core | Premium |
| Tag-based reporting | **Absent** | Core | Absent |
| Monthly trends and multi-period comparison | Shipped | Core | Premium |
| Sankey cash-flow diagram | **Absent** | Core — web | Absent |
| Saved reports and sharing | **Absent** | Core | Absent |
| Customizable dashboard | **Absent** | Core | Premium |

### E · Planning — budgets, bills, goals

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Category budgets | Shipped — transfers still inflate spend | Core | Premium |
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
| Partner / household sharing | Shipped — invitations, roles, per-account privacy | Core — unlimited | Premium |
| Per-member transaction attribution | **Absent** — scoped in P6.4 | Core | Absent |
| Advisor / professional access | **Absent** — explicit P6 non-goal | Core — portal | Premium |
| Business and rental tracking | **Absent** | Plus | Absent |

### H · Engagement and platform

| Capability | Mintea | Monarch | Rocket Money |
|---|---|---|---|
| Web app | Shipped | Core | Premium |
| iOS and Android apps | Partial — configured, not submitted | Core | Free |
| Mobile home-screen widgets | **Absent** | Core | Premium |
| Push notifications | **Absent** — no dependency installed | Core | Free |
| Email digests | **Absent** | Core — weekly recap | Free |
| Balance and spending alerts | Partial — conditions built, nothing schedules them | Core | Premium |
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

## The wider field

Monarch and Rocket Money are the two Mintea is measured against, but they are not
the whole market, and the rest of it locates Mintea more usefully than either
does alone.

| Product | Model | What it is good at | Why it matters here |
|---|---|---|---|
| **Monarch** | Closed SaaS, paid only | Breadth, couples, three aggregators | The feature benchmark |
| **Rocket Money** | Freemium, services | Cancellation, negotiation, credit | Sets the free-tier floor |
| **YNAB** | Paid only, $109/yr | Changing behaviour through method | Owns budgeting *discipline*, which no amount of features buys |
| **Copilot** | Paid only, Apple only | Design and learned categorization | Nearest thing to a design benchmark — and it has **no Android** |
| **Quicken Simplifi** | Paid only, ~$48/yr | Goals, price | Undercuts the premium tier by half |
| **Lunch Money** | Paid, hosted | Multi-currency, crypto, a public API | The indie hosted end |
| **Actual Budget** | Free, MIT, self-hosted | Ownership, privacy, local-first | The ownership end — but no real bank sync |

Three things follow.

**The position Mintea occupies is genuinely unoccupied.** Every product above
sits at one of two poles. The polished ones — Monarch, Copilot, Simplifi, YNAB —
are closed SaaS you rent, and only Rocket Money has a free tier. The ones you own
— Actual Budget above all — trade away bank sync, polish, or both; Actual's users
import files because it has no aggregation. Nobody offers *freemium, self-hostable,
real Plaid sync, and correctness machinery* at once. That is Mintea's combination,
and it is not one competitors can casually copy: Monarch cannot become
self-hostable, and Actual cannot become an aggregator.

**Copilot's gap is Mintea's structural advantage.** The design leader in this
category has shipped iPhone, iPad, Mac and web, and still has no Android app with
no public commitment to one. Mintea builds all three from one codebase. That
advantage is currently unrealised — nothing is in a store — which makes the
submission in *Parity finishers* worth more than its size suggests.

**YNAB is the reminder that features are not the only axis.** It is the most
expensive product here, has no free tier, and wins on method rather than
capability. Mintea's roadmap is a feature roadmap, and there is no equivalent
claim about *what using it does to you*. That is not an argument to copy envelope
budgeting; it is an argument that the correctness story needs to become a story
about outcomes rather than a list of guarantees.

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
- **Single aggregator.** Monarch routes through three — Plaid, Finicity and MX —
  and lets a user retry a failed institution through a different one. Mintea is
  Plaid-only, so Plaid's coverage gaps and outages are Mintea's, and a bank that
  will not connect has no self-service answer at all. Deferring this to P8 is
  still correct, because it is an operational cost rather than a feature, but
  the gap is a missing escape hatch as much as missing coverage. Note that
  Monarch's own handling of the aftermath is weak — switching provider creates a
  duplicate the user must resolve by hand with a Transfer Tool — which is ground
  Mintea's existing merge already covers better.
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
| YNAB | $109/yr | Zero-based envelope budgeting. **No free tier.** The most expensive and the most opinionated |
| Copilot Money | $95/yr, or $13/mo | Design-led, machine-learned categorization, investments included. **Apple only — no Android** |
| Quicken Simplifi | ~$48/yr | Roughly half of Monarch or YNAB. Unlimited savings goals, subscription tracking |
| Lunch Money | Paid, hosted | Native multi-currency, crypto, a developer API |
| Actual Budget | Free, MIT | Local-first, self-hosted, envelope-only. **No real bank sync** — file import |
| Mintea | **Freemium**, not yet priced | No billing, tiers or entitlement model; [P12](roadmap/P12-subscriptions.md) scopes it |

## What this changes in the roadmap

The rows in this document are ranked by customer value and sequenced by
dependency in [CAPABILITY_SEQUENCE.md](CAPABILITY_SEQUENCE.md), which is where
the answer to *what should we build next* lives.


The package numbering in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md), whose packages
now live one per file under `docs/roadmap/`, is unchanged —
P0 through P9 are stable identifiers referenced throughout that document. What
changes is the order they are built in, recorded there under *What to build
next*. Two departures from numeric order come out of this analysis:

1. The notification substrate moves out of P4 and becomes P3.4, ahead of P3.2,
   because budgets, bills, goals and re-engagement all depend on it. P3.1
   shipped without it, which is the argument rather than a counter-example: the
   product now knows a user is over budget and has no way to say so.
2. P6 household collaboration moves ahead of P5 goals and P4 recurring, on the
   grounds that its schema cost is already sunk and its differentiation per unit
   of remaining work is the highest available.

That document also absorbed `docs/BUDGETING_ROADMAP.md`, which had been added
separately and carried its own competitor survey and its own P3–P6 numbering
meaning different things. Its planning detail now lives in P3.1–P3.3, its P4–P6
items were folded into those packages, and its competitor comparison is here.

Since then the roadmap has split one file per package under `docs/roadmap/`, and
monetization has been scoped in two: [P12](roadmap/P12-subscriptions.md) for
entitlement and store integration, [P13](roadmap/P13-subscription-experience.md)
for the subscribe, cancel and household flows. Two decisions there are
competitive positions as much as engineering ones, and belong in this document
rather than only in that one. Entitlement is **per household with unlimited
seats**, matching Monarch — which includes unlimited members under one
subscription — rather than Rocket Money, whose sharing is effectively one
partner. And Mintea is **freemium**, which neither Monarch, YNAB, Copilot nor
Simplifi offers; every lifecycle failure ends at the free tier rather than a
locked door, which is why the departure and lapse cases can be handled more
generously than any of them manage.

## Sources

- [Monarch Plus announcement](https://www.monarch.com/blog/monarch-plus)
- [Monarch Plus launch release](https://www.prnewswire.com/news-releases/monarch-launches-premium-tier-monarch-plus-302748653.html)
- [Rocket Money premium membership features](https://help.rocketmoney.com/en/articles/2677184-premium-membership-features)
- [Rocket Money pricing](https://www.rocketmoney.com/learn/personal-finance/how-much-does-rocket-money-cost)
- [Monarch Money review 2026](https://www.thepennyhoarder.com/budgeting/monarch-money-review/)
- [Best budgeting apps 2026 — NerdWallet](https://www.nerdwallet.com/finance/learn/best-budget-apps)
- [Copilot Money pricing 2026](https://getfinny.app/blog/copilot-money-pricing-2026)
- [Monarch vs YNAB vs Simplifi 2026](https://getfinny.app/blog/monarch-vs-ynab-vs-simplifi-2026)
- [Actual Budget](https://github.com/actual-budget)
