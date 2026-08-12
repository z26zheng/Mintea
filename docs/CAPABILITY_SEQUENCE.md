# Capability Sequence

Last updated: August 11, 2026

Every capability worth building, in one list ordered by customer value and
constrained by dependency. Work already shipped is included and holds its place,
because where it sits explains why the remaining order is what it is.

It numbers sixty-seven, which is the same total as
[COMPETITIVE_GAP_ANALYSIS.md](COMPETITIVE_GAP_ANALYSIS.md) by coincidence rather
than correspondence. The accounting:

- **62 of the gap analysis's 67 rows.** Five are excluded rather than ranked last
  — they are not engineering work at all, and are listed under *Not on this list*
  below.
- **CSV import and export are one entry**, since they are blocked on the same
  native file access and ship together.
- **Six entries the gap analysis has no row for**: the entitlement boundary,
  in-app purchase, subscription lifecycle, the billing flows, multi-currency, and
  joining a family with existing data. A competitive matrix compares what a user
  can do, so it has no row for monetization plumbing or for a migration that
  fixes a wall Monarch never built past either.

Three entries are also renamed where the gap analysis names a capability and the
work is really a specific fix to it: *Category budgets* appears as **transfer
exclusion in budget spend**, *Balance and spending alerts* as **the scheduler**,
and *iOS and Android apps* as **store submission**.

This is the *what and in which order*. [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)
remains the *how*, and its packages group the same work by implementation
concern rather than by value.

## How this is ordered

Three things decide a position, in this priority:

1. **Does its absence make a shipped number wrong?** Correctness outranks
   everything. A product whose claim is that its figures are right cannot carry
   a known-wrong figure.
2. **Reach × frequency.** How many households benefit, and how often it matters
   to them. A thing every household meets weekly beats a thing some households
   meet annually.
3. **Leverage.** What it unblocks. A small item that converts a large amount of
   already-built work into something users experience outranks a larger item
   that stands alone.

Dependency overrides all three. Nothing is placed before what it needs.

## The dependency chains

Five chains constrain the order. Everything else is free to move on value alone.

| Chain | Order forced |
|---|---|
| Delivery | Scheduler → alerts → digests → bill reminders → goal milestones |
| Store presence | Store submission → push → widgets → native file access → any revenue |
| Budget trust | Transfer exclusion → trustworthy budgets → budget alerts worth sending |
| Family | P6.1 sharing → P6.2 joining with data → P6.3 leaving → attribution |
| Portfolio | Holdings → allocation → fund analysis → tax lots |
| Money | Entitlement boundary → store purchase → lifecycle → any paid gate |

---

## Phase 0 — The ledger · 1–16 · all shipped

Nothing else can be true until these are. They are correctly first, and every
later phase reads from them.

| # | Capability | Status |
|---|---|---|
| 1 | Bank aggregation | Shipped — Plaid only |
| 2 | Manual accounts | Shipped |
| 3 | Search and filters | Shipped |
| 4 | Custom category tree | Shipped |
| 5 | Net worth tracking | Shipped |
| 6 | Balance and net-worth history | Shipped |
| 7 | Plain-language connection errors | Shipped |
| 8 | In-place reconnect (Link update mode) | Shipped |
| 9 | On-demand balance refresh | Shipped — 1×/item/hour |
| 10 | Review queue | Shipped |
| 11 | Merchant normalization | Shipped |
| 12 | Category group management | Shipped |
| 13 | Account grouping and visibility | Shipped |
| 14 | Credit utilization | Shipped |
| 15 | Full data export | Shipped — web |
| 16 | Self-service account deletion | Shipped |

Export sits deliberately high for a capability nobody asks for. An app holding a
decade of financial history with no way out has not earned the trust it is
asking for, and it is the one thing that must survive every later paywall.

## Phase 1 — Correctness · 17–26 · all shipped

The over-investment that is now the product's only defensible claim. Neither
Monarch nor Rocket Money markets any of it.

| # | Capability | Status |
|---|---|---|
| 17 | Guided duplicate-account merge | Shipped — no competitor equivalent |
| 18 | Transfer detection and pairing | Shipped |
| 19 | Tags | Shipped |
| 20 | Automatic property valuation | Shipped — RentCast |
| 21 | Income, spending, net cash flow, savings rate | Shipped |
| 22 | Category breakdown with drilldown | Shipped |
| 23 | Merchant and account breakdowns | Shipped |
| 24 | Monthly trends and multi-period comparison | Shipped |
| 25 | Web app | Shipped |
| 26 | Partner / household sharing | Shipped — invitations, roles, per-account privacy |

## Phase 2 — Finish what is already broken · 27–30

**Everything here is a shipped feature that is currently wrong, unreachable, or
unusable for the common case.** This phase outranks all new work. Shipping more
on top of a wrong number compounds the problem.

| # | Capability | Status | Why first |
|---|---|---|---|
| 27 | **Transfer exclusion in budget spend** | Category budgets shipped, transfers inflate spend | A user moving $2,000 to savings is shown as over budget. A shipped feature producing wrong numbers, in the product whose whole claim is correct numbers. Smallest fix here and the highest value |
| 28 | **The scheduler** | Balance and spending alerts: conditions built, nothing schedules them | `notification-evaluate` and `notification-dispatch` both exist and nothing invokes them. One cron job converts the entire P11 build into something users experience. Highest leverage in the repository |
| 29 | **Store submission** | iOS and Android apps configured, not submitted | `eas.json` has a production profile, CI exports both bundles. Unblocks push, widgets, native file access — and under IAP-only billing it is the sole path to any revenue |
| 30 | **Family joining with existing data** | P6.1 shipped; a populated household is refused | Only new signups can join a family today. The realistic case — two people who both already use Mintea — hits an error naming a flow that does not exist |

## Phase 3 — Reach the user · 31–35

Depends on 28 and 29. Mintea currently tells nobody anything; this is the phase
where the product acquires a reason to be reopened.

| # | Capability | Status | Depends on |
|---|---|---|---|
| 31 | Push notifications | Absent — no dependency installed | 29 |
| 32 | Email digests | Absent | 28 |
| 33 | Recurring stream detection | Absent | — |
| 34 | Upcoming bills list and calendar | Absent | 33 |
| 35 | Expected-vs-actual matching, amount-change alerts | Absent | 33, 34, 28 |

Recurring bills is the largest single gap against Rocket Money, which gives all
three away free. Their absence therefore reads as a missing feature rather than
a withheld tier.

## Phase 4 — Make the plan usable · 36–39

| # | Capability | Status | Depends on |
|---|---|---|---|
| 36 | Budget rollover and exclusion | Absent | 27 |
| 37 | Per-member transaction attribution | Absent — scoped in P6.4 | 30 |
| 38 | Multi-factor authentication | Absent | — |
| 39 | Native file access — CSV import and export | Partial — web only | 29 |

MFA sits here rather than lower because it is the cheapest credibility gap in
the product. Supabase ships TOTP; the roadmap treated it as a decision when the
decision is small.

## Phase 5 — Daily-use polish · 40–46

Individually minor, collectively the difference between a product that works and
one that feels finished.

| # | Capability | Status |
|---|---|---|
| 40 | Transaction splits — percentages | Partial — fixed only |
| 41 | Bulk editing beyond adding a tag | Partial — tag add only |
| 42 | Categorization rules — richer conditions, retroactive runs | Partial — exact match only |
| 43 | Tag-based reporting | Absent |
| 44 | Mobile home-screen widgets | Absent — Rocket Money charges for these |
| 45 | Customizable dashboard | Absent |
| 46 | Saved reports and sharing | Absent |

## Phase 6 — Charge for it · 47–50

Deliberately after Phase 5, not before. At 27 of 67 capabilities the product is
not yet worth paying for, and a paywall on an unfinished product converts worse
and costs more trust than waiting.

| # | Capability | Status | Depends on |
|---|---|---|---|
| 47 | Entitlement boundary | Absent — P12.1 | — |
| 48 | In-app purchase, both platforms | Absent — P12.2 | 29, 47 |
| 49 | Subscription lifecycle mechanics | Absent — P12.4 | 48 |
| 50 | Subscribe, cancel and billing flows | Absent — P13 | 48 |

**47 is the exception to this phase's position.** The entitlement boundary should
exist before more features are built across it — the same argument that put
`household_id` on every table in the first migration. It is cheap now and
expensive once a dozen features check it.

## Phase 7 — Goals and depth · 51–58

| # | Capability | Status | Depends on |
|---|---|---|---|
| 51 | Savings goals | Absent | 36 |
| 52 | Debt payoff planning | Absent | 51 |
| 53 | Holdings and securities | Absent | Plaid Investments, a paid add-on |
| 54 | Allocation and performance | Absent | 53 |
| 55 | Flex / non-category budgeting | Absent | 36 |
| 56 | Sankey cash-flow diagram | Absent | — |
| 57 | Learned auto-categorization | Absent — deterministic by choice | 42 |
| 58 | Receipt capture and attachments | Absent | 29 |

Learned categorization is placed after deterministic rules deliberately. Rules
that can be read and undone are a defensible position against Monarch's AI
assistant, but only if they are good first.

## Phase 8 — Later, or never · 59–67

| # | Capability | Status | Position |
|---|---|---|---|
| 59 | Forecasting and scenario modelling | Absent | Monarch Plus territory; wait for demand |
| 60 | Fund analysis and diversification | Absent | Needs 53; Morningstar-grade is a different company |
| 61 | Gains, losses and tax lots | Absent | Needs 53 |
| 62 | Business and rental tracking | Absent | Monarch Plus |
| 63 | Item-level retail categorization | Absent | Impressive, narrow |
| 64 | Natural-language assistant | Absent | Expensive; the correctness story is the better differentiator |
| 65 | User-selectable data provider | Absent | Only once connection-failure data justifies a second aggregator — P8.1 |
| 66 | Multi-currency | Absent — P10 | Serves cross-border households only |
| 67 | Advisor / professional access | Absent | **Explicit non-goal** in P6 |

### Not on this list on purpose

Five capabilities from the gap analysis are deliberately excluded rather than
ranked last, because they are not engineering work at all:

- **Subscription cancellation concierge** — needs staff on phones
- **Bill negotiation** — needs carrier relationships and a fee mechanism
- **Credit score** and **full credit report** — need a bureau agreement and its
  compliance surface
- **Automated savings transfers** — moves customer money, which is a different
  regulatory product

These are Rocket Money's actual moat, and the reason it can afford to give the
ledger away. Competing there is a category error rather than a backlog item.

## The short answer

If only four things happen next, in this order:

1. **Stop transfers inflating budgets.** A shipped feature is wrong.
2. **Add the scheduler.** One cron job releases the whole notification build.
3. **Submit to the stores.** Unblocks push, widgets, native files, and revenue.
4. **Let existing users join a family.** P6.1 currently serves only new signups.

None is large. Together they finish four things already mostly built, which is
worth more than starting a fifth.
