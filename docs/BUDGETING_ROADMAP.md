# Mintea budgeting roadmap

## What the market teaches us

Competitors converge on three models:

- **Monarch:** monthly cash-flow planning, with either detailed category plans or
  a simpler flexible-spend bucket; category rollovers are optional.
- **Rocket Money:** a guided setup that starts with income, separates bills, then
  proposes editable category limits and a projected savings outcome.
- **YNAB:** envelope-style planning with targets, explicit funding behaviour,
  and balances that carry forward automatically.

Mintea should not copy three different planning models in its first release.
Its differentiator is trustworthy connected data, so it should start with a clear
monthly category plan that always explains *planned, spent, and remaining*.

## Ranked roadmap

### P3.1 — Monthly category budgets (now)

1. Month navigator and a per-category planned amount.
2. Actual spend calculated from the same reportable transaction rules as Reports:
   hidden rows, transfers, and split parents cannot inflate a budget.
3. Planned / spent / remaining totals, group subtotals, and clear empty states.
4. Quick setup from a six-month category average, with explicit user review.
5. Category inclusion controls; transfer and income groups stay out of spending
   limits by default.

### P3.2 — Rollover and flexible planning

1. Per-category rollover with an auditable opening-balance calculation.
2. Fixed, non-monthly, and flexible buckets; preserve category detail underneath.
3. Copy-forward and reset-from-history actions, each with a confirmation preview.
4. Over-budget and unallocated-income alerts.

### P3.3 — Targets and irregular expenses

1. Monthly, weekly, yearly, and custom-date targets.
2. `refill up to`, `set aside`, and `have a balance of` behaviours.
3. Funding guidance and progress states that distinguish a target from a spending
   limit.
4. Target calendar for annual insurance, gifts, travel, and other uneven costs.

### P4 — Recurring obligations

1. Detect recurring merchants, cadence, amount range, and next expected date.
2. Confirm, dismiss, or create a recurring bill manually.
3. Expected-vs-actual matching, changed-amount and missed-payment alerts.
4. Subscription visibility and cancellation handoff; never claim a cancellation
   occurred until a provider confirms it.

### P5 — Goals and planning

1. Savings and debt-payoff goals with linked accounts and target dates.
2. Monthly contribution plans that connect to budget categories without double
   counting transfers.
3. Scenario planning: income changes, extra debt payments, and projected finish
   dates.

### P6 — Shared household budgeting

1. Member roles, owner attribution, and shared/private budget views.
2. Review assignment and a household change log for budget edits.
3. Shared goals with transparent contribution history.

## Delivery rules

Each slice ships only after schema/RLS coverage, domain tests, web and native
exports, and browser E2E against the disposable sandbox fixture. One pull request
per completed slice keeps migrations reviewable and makes a bad financial rule easy
to roll back.
