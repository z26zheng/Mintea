[← Roadmap index](../PRODUCT_ROADMAP.md)

# P13 — Subscription experience

Status: scoped, not started. Depends on [P12](P12-subscriptions.md), which makes
payment possible; P13 is what makes it comprehensible.

Billing is the part of a product where a bad experience costs trust rather than
just conversion. A user who cannot find how to cancel, cannot tell what they are
paying, or cannot get an invoice for their accountant will not conclude that the
billing screen is bad — they will conclude the company is. For a product whose
entire claim is that it handles your money carefully, that inference is fatal.

Everything here assumes the entitlement model P12 settles: **entitlement belongs
to the household, seats are unlimited, and a lapsed household never loses data.**

The division between the two packages is one line: **[P12](P12-subscriptions.md)
owns what the server can do and know; P13 owns what a person sees and chooses.**
Where a capability and a flow are two halves of the same feature — restoring a
purchase, transferring billing, crediting a merged subscription — each package
names the other rather than restating it.

## The state model

Subscription UX is a state machine, and most implementations are wrong in the
states nobody demoed. Every screen below must be defined for all seven, from
both an owner's and a non-owner member's point of view.

| State | How it is reached | What the household can do | What it must be told |
|---|---|---|---|
| **Free** | Never subscribed | Everything not gated | What paying would add, without nagging |
| **Trialing** | Started a trial | Everything | Days left, and the exact date and amount of the first charge |
| **Active** | Paying | Everything | Next renewal date and amount |
| **Cancelling** | Cancelled, still inside the paid period | Everything | The date access ends, and how to undo |
| **Past due** | A payment failed, retries pending | Everything | That payment failed, what to fix, and when access ends if it is not |
| **Lapsed** | Grace expired, or trial ended unpaid | Read and export only | What is gated now, and that nothing was deleted |
| **Refunded** | Refund or chargeback | Read and export only | Plainly, without accusation |

Two rules cut across the table. **A gate is never a dead end** — a gated feature
explains what it is and offers the upgrade, rather than vanishing or erroring.
And **a lapsed household keeps read access and export forever**, because getting
your data out is a trust guarantee rather than a paid feature.

## P13.1 — What paid buys, and the paywall

**The free-versus-paid list is the blocking decision for both packages.** Nothing
in P13 can be drawn and nothing in P12 can be gated until it exists. It belongs
here rather than in P12 because it is a product judgement about what a person
gets, not a property of the mechanism — P12's helper answers only whether a
household is entitled.

Three constraints on whatever the list becomes:

- **Export is never gated.** It is stated as a rule in
  [P12](P12-subscriptions.md) and repeated here because it is the one line that
  must survive contact with a pricing discussion.
- **Nothing already shipped and free should move behind the paywall** without a
  deliberate decision and a grandfathering plan. Taking away is far more costly
  than never having given.
- **A gate must be visible before it is hit**, or the product reads as broken
  rather than as having a paid tier.

- **Planned** — the free-versus-paid list itself, written down and agreed
- **Planned** — a plan comparison showing monthly and annual with the annual
  saving stated in money, not just a percentage
- **Planned** — gated features that explain themselves in place rather than
  disappearing, so the product never appears broken to a free household
- **Planned** — a trial with the first charge date and amount stated before it
  starts, not buried in a confirmation email
- **Planned** — the auto-renewal disclosure Apple requires adjacent to the
  purchase control, with price, period, and how to cancel
- **Planned** — no upgrade prompt anywhere for a member of an already-entitled
  household; the household's entitlement is resolved before a paywall renders

That last item is the one most likely to be got wrong, and it produces the worst
outcome: a second member of a paying family buying a second subscription for a
household that is already covered.

## P13.2 — Subscribing

- **Planned** — plan selection, then checkout: Stripe on web, native purchase in
  the apps
- **Planned** — a confirmation that names what changed and what the household now
  has, rather than a bare success toast
- **Planned** — entitlement visible to every other member without them
  re-authenticating or force-quitting
- **Planned** — failure states written as recoverable: card declined,
  authentication required, network interrupted, purchase already owned, store
  account mismatched
- **Planned** — price displayed with tax handled per region, since the merchant
  of record collects it

An interrupted purchase must never leave a household ambiguous. If the payment
succeeded and the app closed before confirmation, reopening shows the
subscription active — the entitlement follows the webhook, not the screen.

## P13.3 — Managing the subscription

- **Planned** — a billing screen showing plan, price, billing period, next
  renewal date, payment method, and member count
- **Planned** — change plan, with a proration preview stating the amount and date
  before it is confirmed
- **Planned** — update the payment method
- **Planned** — billing history: every charge with date, amount, status
- **Planned** — invoice download for web purchases
- **Planned** — receipt email on every successful charge, delivered through
  [P11](P11-notifications.md) rather than a second mail path

**Invoice downloads are only possible for web purchases, and while the first
release is IAP-only there are none.** Apple and Google are the merchant of record
for store purchases: they issue the receipt, and Mintea cannot produce a tax
invoice for a transaction it was not party to. So until [P12.3](P12-subscriptions.md)
web billing exists, the billing screen links to the platform's purchase history
rather than pretending to hold documents it cannot have. When web billing does
arrive, Stripe Billing's Customer Portal supplies real downloadable invoices and
the screen gains a second shape — it does not replace the first.

## P13.4 — Cancelling, lapsing and returning

- **Planned** — cancellation reachable from the billing screen in one step, never
  hidden behind support
- **Planned** — a cancellation preview stating exactly what is lost, what is
  kept, and the date access actually ends
- **Planned** — cancellation effective at period end rather than immediately,
  with the paid remainder honoured and an obvious way to undo
- **Planned** — a deep link to Apple or Google subscription management for
  store-purchased subscriptions, clearly explained
- **Planned** — dunning: a failed payment surfaces in-app and by notification,
  with the grace period and end date stated
- **Planned** — a lapsed household that reads as paused rather than punished, with
  export prominent and nothing deleted
- **Planned** — resubscribe from any of those states, restoring the same household
- **Planned** — a lapse or failure that reads as **paused, never suspended**.
  Freemium means the end state is the free tier with data intact, so the wording
  should say what is waiting rather than what was taken. A finance app that looks
  punitive about money is arguing against its own thesis
- **Planned** — deleting an account while subscribed: name the platform and the
  amount, deep link to the exact store subscription page, and require an explicit
  acknowledgement rather than blocking, which would be paternalistic
- **Planned** — a final email carrying the cancellation link on the way out of
  deletion. After the account is gone there is nothing left to sign into, and
  that message is the last one it is legitimate to send. Monarch's answer to this
  case is that its own staff cannot help with App Store subscriptions
- **Planned** — the Apple Family Sharing explanation, for a subscriber who cannot
  find the subscription because a family organiser bought it

**A store-purchased subscription cannot be cancelled inside the app.** Apple and
Google require the user to manage it through their own account. The honest flow
is to say so and deep-link there, rather than showing a cancel button that fails
or a support address. This is why the cancel flow has two shapes for the same
household depending on where the purchase was made. Which store a purchase came
from is recorded on the entitlement record in
[P12.1](P12-subscriptions.md), not derived here.

## P13.5 — Family flows

- **Planned** — a non-owner in an entitled household sees the household's status,
  never a purchase option
- **Planned** — a member joining an entitled family sees immediately that they
  are covered and by whom
- **Planned** — billing managed by owners, with the current billing owner named
  so it is never ambiguous who is paying
- **Planned** — when the billing owner leaves, the takeover offered **before**
  they go rather than discovered after, so no household finds out by losing
  features. [P12.4](P12-subscriptions.md) provides the transfer; this decides
  when it is offered and how it reads
- **Planned** — how a credit is explained when two paying households merge or a
  subscription is handed over. The mechanism extends the period end rather than
  refunding, so the message is that the household gained time, not that money is
  owed back
- **Planned** — a lapsed family where every member sees the same state and the
  same explanation

Only the billing-owner departure depends on
[P6.3](P6-family-accounts.md), which does not exist. The rest of P13.5 does not,
and its counterpart capability is the single P6.3-dependent item in
[P12.4](P12-subscriptions.md) — the same rule from the other side.

## P13.6 — Cross-platform continuity

- **Planned** — a subscription bought on web recognised in both apps with no
  further action
- **Planned** — a subscription bought in an app recognised on web
- **Planned** — restore purchases, for reinstalls and new devices. The capability
  is [P12.2](P12-subscriptions.md); this is where and how it is offered
- **Planned** — one honest answer when a user tries to manage a store
  subscription from the web, which they cannot: name the store and what to do

## User stories

**Deciding**

- As someone evaluating Mintea, I can see what paying adds before I am asked for
  a card.
- As a free user who taps a paid feature, I learn what it does rather than
  finding a dead end.
- As a trial user, I know the exact date and amount of my first charge before the
  trial starts.

**Paying**

- As a household owner, I can subscribe on whichever platform I happen to be on.
- As someone whose card was declined, I am told what to fix rather than that
  something went wrong.
- As a partner in a paying family, I am never asked to pay again.

**Living with it**

- As a household owner, I can see what I pay, when it renews, and on which card.
- As someone doing their taxes, I can download an invoice for every web charge.
- As someone switching cards, I can update payment without cancelling first.
- As someone who wants to spend less, I can move from monthly to annual and see
  the proration before I confirm.

**Leaving**

- As a subscriber, I can cancel without contacting anyone, and I know exactly
  when access ends.
- As someone who cancelled by accident, I can undo it while the period is still
  running.
- As someone whose payment failed, I get told in time to fix it.
- As a lapsed user, I can still read my history and export everything.
- As someone returning after lapsing, my data is exactly as I left it.

**In a family**

- As a member, I can see who pays and when the household renews.
- As a household whose payer left, we have a way to keep the subscription alive.

## Rules

- Cancellation is never harder to find than subscribing.
- Every state in the table above has a defined screen for both an owner and a
  member. A state nobody designed is a state a user will find.
- No screen invents a document. Invoices exist for web purchases; store purchases
  link to the store.
- Money is always shown with its currency and, where the merchant of record
  collects it, with tax made explicit. Display currency from
  [P10](P10-multi-currency.md) does not change what a household is billed.
- Nothing in this package asserts entitlement client-side. Screens render from the
  server's answer.

## Non-goals

- Retention offers, discounts, or cancellation interstitials designed to obstruct.
  A cancel flow that argues is the fastest way to lose the trust the product is
  built on.
- Referral, affiliate, or gifting flows.
- In-app upsell of anything other than the subscription itself.
- Dunning by any channel P11 does not already provide.
- A self-service refund. Refunds are handled by the merchant of record, and the
  flow points there.

## Success measures

- Every state in the table renders correctly for both an owner and a non-owner,
  verified rather than assumed.
- A member of an entitled household never encounters a purchase control.
- Cancelling takes no more steps than subscribing did.
- A lapsed household can still export its full history.
- Every web charge has a downloadable invoice, and no store purchase pretends to.
- A purchase interrupted between payment and confirmation resolves correctly on
  next open.

## Sequencing

P13 follows P12 slice for slice — there is nothing to show until there is
something to bill. Two exceptions are worth building alongside rather than after:
the state table, which should be agreed before any screen is drawn, and the rule
that a member of an entitled household never sees a purchase option, which is a
P12.3 correctness concern as much as a P13 one.

P13.5 additionally waits on [P6.3](P6-family-accounts.md).
