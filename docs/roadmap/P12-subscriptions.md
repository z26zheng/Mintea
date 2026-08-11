[← Roadmap index](../PRODUCT_ROADMAP.md)

# P12 — Subscription infrastructure

Status: scoped, not started. Not in the current top five, with one exception
called out under sequencing.

This package is the plumbing: entitlement, store purchases, receipts and
webhooks. The first release charges through in-app purchase on both platforms
and nowhere else; web billing is scoped but deferred. The
user-facing half — paywalls, subscribing, the billing screen, invoices,
cancellation and every state in between — is
[P13](P13-subscription-experience.md).

Mintea has no monetization surface at all: no plan, no tier, no entitlement
concept anywhere in the schema. Monarch charges $99.99 a year and Rocket Money
$7–14 a month, and Mintea charges nothing because it cannot.

## Entitlement is per household, not per user

This is the decision the rest of the package hangs on, and it is settled.

**The data is already joint.** A budget belongs to a household, not to the
member who created it. If one member pays and another does not, there is no
answer to *what does the unpaid member see on the Budget tab* that can be
explained in a sentence. Per-account privacy already answers "this member should
not see this account"; layering a second, orthogonal reason a member cannot see
household data on top of it produces states that are coherent in code and
incoherent on screen.

The schema agrees. Everything is scoped by `household_id` and every policy gates
on membership, so entitlement becomes a third household-scoped helper beside
`current_household_ids()` and `current_visible_account_ids()`. Per-user
entitlement would make every gated query ask two questions at two different
scopes.

It also matches the market and keeps the growth loop intact. Monarch includes
**unlimited** household members under one subscription with no per-user fee;
Rocket Money's sharing is effectively one partner, Primary and Secondary.
Charging a couple twice would read as double Monarch's price, and it would put a
price on the invitation that family accounts exist to encourage.

**Seats are unlimited, and the schema is built so they need not stay that way.**
Monarch accepts the same abuse exposure with unlimited members, and Mintea has a
structural deterrent Monarch does not: a person may belong to exactly one active
family, and joining moves their profile and disposes of their bootstrap
household. Freeloading in a friend's family costs you your own.

Unlimited is therefore the right first answer, but it should be a *value* rather
than an assumption baked into the code. Three things make a seat limit a
configuration change later instead of a migration:

- **A nullable `seat_limit`**, where `null` means unlimited. It belongs on the
  plan, with a per-household override column, so a limit can be introduced for
  new plans, and exceptions granted, without a schema change or a deploy.
- **Enforcement on the transition, never as a standing invariant.** The check
  belongs in `accept_family_invitation` and `create_family_invitation` — the two
  functions that already mutate membership — and nowhere else. A limit expressed
  as a constraint or a read-time check would retroactively break every household
  already over it the day it is switched on; a join-time check grandfathers them
  automatically, which is the behaviour we would want anyway.
- **A seat count derived from `household_members`, not stored.** A cached count
  is one more thing that can disagree with reality, and membership changes are
  already funnelled through those two functions.

Per-seat *pricing* is a further step and stays deferred, but it is reachable from
this model without a rewrite — which is one more reason not to choose per-user
now.

## P12.1 — The entitlement boundary

Build this before any payment code. It is cheap while nothing depends on it and
expensive once features are built across it, which is the same argument that put
`household_id` on every table in the first migration.

- **Planned** — an entitlement record keyed on the household, carrying status,
  period end, and the source that granted it
- **Planned** — one SECURITY DEFINER helper as the single definition of whether a
  household is entitled, checked server-side in RLS and SQL functions and never
  trusted from a client
- **Planned** — a nullable `seat_limit` on the plan with a per-household
  override, shipped as `null` so seats are unlimited, and read only by the two
  membership functions
- **Planned** — grandfathering for households that predate billing
- **Planned** — revocation when the provider reports a refund or chargeback, so a
  refunded household actually loses entitlement rather than keeping it until the
  period would have ended

What free and paid gate is a product decision and lives in
[P13](P13-subscription-experience.md). The helper here answers only *is this
household entitled*; it does not need to know what that unlocks, and keeping the
list out of the mechanism is what lets the gated set change without touching it.

## P12.2 — In-app purchase on both platforms

The first and, for now, only way to pay. StoreKit on iOS and Play Billing on
Android, both through RevenueCat.

- **Planned** — RevenueCat's SDK with products configured in App Store Connect
  and Play Console
- **Planned** — an idempotent path from RevenueCat's lifecycle events to the
  entitlement record, since a replayed or out-of-order event must not grant or
  revoke twice
- **Planned** — authentication of that webhook before anything is trusted. It is
  the second function reachable without a user session, and it grants paid
  access, so an unauthenticated endpoint is a free-subscription exploit rather
  than merely a bug. `plaid-webhook` is the precedent: verify the provider's
  signature against the body actually received, and act on nothing until it
  passes
- **Planned** — a sandbox path. Store purchases cannot be exercised without store
  presence, and the disposable E2E household needs a way to hold entitlement
  without a real transaction. This follows the household-scoped
  `plaid_environment` pattern rather than a deployment-wide switch
- **Planned** — household entitlement resolved *before* any paywall renders; a
  member of an already-entitled household is shown their membership status,
  never a purchase option
- **Planned** — restore purchases, and reconciliation for the case where one
  household ends up with two live subscriptions

**Why IAP rather than linking out to the web.** Apple's 0% commission on US
external links makes link-out look free, but the conversion cost exceeds the
commission. RevenueCat's A/B testing puts native IAP trial starts at about 27%
against 18% for a web link-out, and found web subscriptions returned roughly
$0.93 for every $1.00 through IAP *after* the full fee saving. On Android the
trade is worse still: Google charges a service fee on external purchases anyway,
so link-out saves roughly the 5% billing fee while paying the same friction
penalty. Link-out is also a bet on a live Supreme Court question.

**Why RevenueCat rather than the store SDKs directly.** StoreKit 2 and Play
Billing are free and both stop at the transaction. Everything after the buy
button — receipt validation, renewals, grace periods, billing retry, refunds,
upgrades, proration — is ours to build twice, against two state machines that
disagree. RevenueCat is free under $2,500 monthly tracked revenue and 1% after,
and maintains an Expo SDK, which matters in a project that cannot currently ship
`expo-file-system` without a native rebuild.

**RevenueCat is a feed, not the source of truth.** It validates receipts and
reports lifecycle; a webhook writes that into the household entitlement record;
the app asks our server. That follows the rule below and is what keeps a second
rail from becoming a second source of truth.

The mismatch to design around: an App Store subscription belongs to an Apple ID
and a Play subscription to a Google account. Neither knows what a household is,
so the mapping from a per-person receipt to a household entitlement is ours to
write. No vendor does this part.

This slice is blocked on the store submission in *Parity finishers*, which means
**there is no way to charge anyone until the apps are published**. That is a
deliberate trade for a better first purchase experience, and it is the main cost
of choosing IAP-only.

## P12.3 — Web billing, deferred

Not in the first release. Recorded here so the shape is settled when it is
wanted, and because the entitlement boundary in P12.1 must not assume a single
rail.

- **Planned** — Stripe Billing with Stripe Tax, checkout, plan change,
  cancellation and dunning
- **Planned** — the same idempotent webhook path into the entitlement record

**Stripe Billing directly, not RevenueCat Web and not Stripe Managed Payments.**
An earlier draft of this package specified both, and both were wrong. Stripe
Managed Payments charges 3.5% on top of standard processing — about 6.4% + 30¢
domestically, which makes it a *more* expensive merchant of record than Paddle or
Lemon Squeezy at 5% + 50¢. And RevenueCat Web adds a 1% fee to a rail we would
already be integrating, buying a unified entitlement we get for free by owning
the entitlement table ourselves. Stripe Billing also includes Customer Portal,
which supplies a hosted billing screen, invoice downloads, payment-method updates
and cancellation — a large part of [P13](P13-subscription-experience.md) at no
build cost.

Merchant of record is not needed yet. US sales tax on SaaS has economic nexus
thresholds around $100k or 200 transactions per state, so at early revenue the
obligation is the home state only, and Stripe Tax calculates and collects it.
Revisit when either several states are crossed or there are real international
customers; at that point compare Paddle and Lemon Squeezy against Stripe Managed
Payments, and the switch is contained because the entitlement record does not
change.

Web is the right home for desktop-origin purchases — a meaningful share for this
product, given CSV import and export are web-only — but it is not worth
splitting effort across two rails before either works.

## P12.4 — Lifecycle mechanics

The mechanics live here; the screens that expose them are
[P13.4](P13-subscription-experience.md) and P13.5.

- **Planned** — the seven billing states a household can occupy, as server-side
  truth: free, trialing, active, cancelling, past due, lapsed, refunded
- **Planned** — grace-period length and retry schedule on a failed payment, and
  the transition that ends it
- **Planned** — proration on plan change, computed by the provider and surfaced
  rather than recalculated
- **Planned** — plans configured in one App Store subscription group, since
  Apple treats a change between groups as two unrelated subscriptions rather
  than an upgrade, and [P13.3](P13-subscription-experience.md)'s change-plan flow
  does not work without it
- **Planned** — transfer of billing ownership between members, so a household
  does not drop when the payer leaves
- **Planned** — reconciliation when a household somehow holds two live
  subscriptions, including which survives and how the other is refunded
- **Planned** — price changes: what an existing subscriber pays when the price
  moves, given Apple and Google both require consent for an increase
- **Planned** — trial eligibility, which the stores track per Apple ID or Google
  account rather than per household, so a household can contain a member who has
  already used one
- **Planned** — account deletion while subscribed. Deleting a Mintea account
  cannot cancel an App Store or Play subscription — only the subscriber can, in
  their own store account — so today a user could delete everything and keep
  being charged. `delete-account` has no billing awareness at all and must gain
  one, at minimum a clear warning naming what to cancel and where
- **Planned** — billing observability through [P11](P11-notifications.md): a
  failed webhook, or an entitlement that has drifted from the provider's view,
  should reach someone rather than sit silently

Leaving a family is [P6.3](P6-family-accounts.md) and is not built, so the case
where the payer walks out has no handling at all today. This slice should not
ship before it.

## Rules

- Entitlement is evaluated server-side. A client may render from it but must
  never assert it.
- A lapsed household never loses data, and **export keeps working**. Getting your
  data out is a trust guarantee, not a paid feature, and an app holding a decade
  of financial history behind a lapsed card is asking for trust it has not
  earned.
- Subscription price is billed in one currency and is not the household's display
  currency from P10. A member reading their balances in CAD is not thereby billed
  in CAD.

## Non-goals

- Per-seat pricing. Deferred, and reachable later from this model.
- A seat limit in the first release. The column ships as `null`; only the two
  membership functions read it, so turning one on later is a value change rather
  than a migration.
- Linking out to a web checkout from the apps. Apple's 0% on US external links is
  a live legal question before the Supreme Court, Google charges a service fee on
  external purchases regardless, and the conversion cost exceeds the commission
  saved — see P12.2.
- Web billing in the first release. Deferred to P12.3, with the shape settled.
- Merchant of record. Not needed at current scale, and Stripe Managed Payments is
  the most expensive way to buy it.
- More than one active subscription per household.
- Any user-facing flow. Paywalls, checkout screens, the billing screen, invoice
  downloads and cancellation are [P13](P13-subscription-experience.md).

## Success measures

- No feature checks entitlement anywhere except through the single helper.
- A household that lapses can still read and export everything it had.
- A billing webhook replayed twice changes nothing the second time, and an
  unsigned one changes nothing at all.
- Adding a second rail later requires no change to the entitlement record or to
  any feature that reads it.
- Setting a seat limit on a plan requires no schema change, and no household
  already over that limit loses a member.

## Sequencing

P12 sits behind finishing P11 and P6, and behind the product being worth paying
for — at 27 of 67 compared capabilities, with no scheduler and family joining
still refused for existing users, charging would be premature.

Choosing IAP-only adds a hard dependency: **P12.2 cannot ship until the apps are
in the stores**, so the store submission in *Parity finishers* moves from a
polish item to a prerequisite for any revenue at all. If that submission slips,
P12.3 is the escape hatch — web billing needs no rework to add later, because
P12.1's entitlement record is deliberately provider-agnostic.

P12.1 is the exception. The entitlement boundary should exist before more
features are built across it, and it costs almost nothing to add while nothing
depends on it.

[P13](P13-subscription-experience.md) follows this package slice for slice, with
one thing worth agreeing up front rather than after: the state table at the top
of P13, since it defines what P12.4 has to make true.
