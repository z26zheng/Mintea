[← Roadmap index](../PRODUCT_ROADMAP.md)

# P3 — Core monthly budgeting

Status: P3.1 shipped; P3.2 and P3.3 remain, and the substrate they alert
through is now P11.

This package absorbed the separate `docs/BUDGETING_ROADMAP.md`, whose P3.1–P3.3
breakdown is kept below. Its P4–P6 items were folded into those packages, and
its competitor survey into
[COMPETITIVE_GAP_ANALYSIS.md](../COMPETITIVE_GAP_ANALYSIS.md). Two roadmaps with
overlapping P-numbers that meant different things was worse than either alone.

Competitors converge on three planning models — Monarch's monthly cash-flow plan
with an optional flexible-spend bucket, Rocket Money's guided setup that starts
from income and proposes editable limits, and YNAB's envelope targets with
balances that carry forward. Mintea should not copy three models in its first
release. Its differentiator is trustworthy connected data, so it starts with a
clear monthly category plan that always explains *planned, spent, and remaining*.

## P3.1 — Monthly category budgets — shipped

- **Shipped** — month navigator and a per-category planned amount, with add,
  edit and remove
- **Shipped** — planned, spent and remaining totals with an over-budget state
  and an unplanned-spending state
- **Shipped** — copy last month's plan, which fills only the categories that
  have none and reports how many it copied
- **Shipped** — an empty state that explains how to start a plan
- **Partial** — actual spend from the same reportable rules as Reports; hidden,
  pending and split-parent rows are excluded, but **transfers are not**, so a
  paired transfer or a transfer-group category still counts against a budget
- **Planned** — group subtotals and drilldown into the transactions behind a
  category
- **Planned** — quick setup from a six-month category average, with explicit
  user review
- **Planned** — user-editable category inclusion; `categories.exclude_from_budget`
  exists and the budget screen honours it, but nothing in the app can set it

## P3.2 — Rollover and flexible planning

- **Planned** — per-category rollover with an auditable opening-balance
  calculation
- **Planned** — fixed, non-monthly and flexible buckets, preserving category
  detail underneath
- **Planned** — copy-forward and reset-from-history actions, each with a
  confirmation preview
- **Planned** — over-budget and unallocated-income alerts

## P3.3 — Targets and irregular expenses

- **Planned** — monthly, weekly, yearly and custom-date targets
- **Planned** — `refill up to`, `set aside` and `have a balance of` behaviours
- **Planned** — funding guidance and progress states that distinguish a target
  from a spending limit
- **Planned** — a target calendar for annual insurance, gifts, travel and other
  uneven costs

## P3.4 — The notification substrate

Moved to [P11 — Notifications](P11-notifications.md). It was scoped inside P4, then moved here
because P3.2's alerts needed it. Neither placement was right: it serves P0's
connection health, P3.2's alerts, P4's reminders, P5's milestones and P6's
family fan-out equally, and it has grown an in-app surface of its own. Nesting a
cross-cutting capability under one of its consumers was the wrong shape.

P3.2 still depends on it, and P3.1 shipped without it — which is why an
over-budget category is a colour on a screen the user has to remember to open
rather than something Mintea tells them.
