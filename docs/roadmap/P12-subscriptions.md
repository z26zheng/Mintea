[← Roadmap index](../PRODUCT_ROADMAP.md)

# P12 — Subscriptions and entitlement

Status: scoped, not started. Not in the current top five, with one exception
called out under sequencing.

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
- **Planned** — a written list of what free and paid actually gate. This needs a
  product decision before P12.2 and is the one blocking item in the package
- **Planned** — grandfathering for households that predate billing

## P12.2 — Web billing first

- **Planned** — RevenueCat Web with Stripe Managed Payments, so Stripe is
  merchant of record and sales tax, VAT and GST are collected and remitted for us
- **Planned** — checkout, upgrade, downgrade, cancellation, grace period and
  dunning
- **Planned** — an idempotent webhook path from billing state to the entitlement
  record, since a replayed or out-of-order event must not grant or revoke twice

Web ships before store IAP because the native apps are not in a store yet and
web billing keeps roughly $96 of a $100 subscription against about $84 through
IAP. Revenue does not have to wait for store submission.

## P12.3 — Store purchases at submission

- **Planned** — RevenueCat's SDK with products configured in App Store Connect
  and Play Console
- **Planned** — household entitlement resolved *before* any paywall renders; a
  member of an already-entitled household is shown their membership status, never
  a purchase option
- **Planned** — restore purchases, and a reconciliation path for the case where
  one household ends up with two live subscriptions

The mismatch to design around: an App Store subscription belongs to an Apple ID
and a Play subscription to a Google account. Neither knows what a household is,
so the mapping from a per-person receipt to a household entitlement is ours to
write. No vendor does this part.

This slice is blocked on the store submission in *Parity finishers*.

## P12.4 — Lifecycle across a family

- **Planned** — who may manage billing, and whether that is owners only
- **Planned** — what happens when the paying member cancels or leaves: a grace
  period, and a path for another member to take billing over rather than the
  household silently dropping to free
- **Planned** — what a lapsed household sees

Leaving a family is [P6.3](P6-family-accounts.md) and is not built, so the case where the payer walks out
has no handling at all today. P12.4 should not ship before it.

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
- A link-out-only strategy that avoids store commission entirely. Apple's 0% on
  US external links is a live legal question before the Supreme Court, and Google
  charges a service fee on external purchases regardless.
- More than one active subscription per household.

## Success measures

- No feature checks entitlement anywhere except through the single helper.
- A member of an entitled household is never shown a purchase option.
- A household that lapses can still read and export everything it had.
- A billing webhook replayed twice changes nothing the second time.
- Setting a seat limit on a plan requires no schema change, and no household
  already over that limit loses a member.

## Sequencing

P12 sits behind finishing P11 and P6, and behind the product being worth paying
for — at 27 of 67 compared capabilities, with no scheduler and family joining
still refused for existing users, charging would be premature.

P12.1 is the exception. The entitlement boundary should exist before more
features are built across it, and it costs almost nothing to add while nothing
depends on it.
