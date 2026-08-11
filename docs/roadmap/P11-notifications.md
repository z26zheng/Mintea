[← Roadmap index](../PRODUCT_ROADMAP.md)

# P11 — Notifications

Status: **Partial** — the in-app foundation and first server-owned alert pipeline
are implemented. The migration/integration suite and local mock browser E2E are
verified; hosted deployment and scheduling remain. **Build first** remains
correct for the work that depends on this substrate.

> **P11 checkpoint — what remains:** the current slice covers the in-app centre,
> durable recipient-scoped notification records, a database email outbox,
> connection-health and budget evaluators, automatic resolution for those
> condition families, family join/leave events, read-state suppression,
> database/provider deduplication, and log-only browser E2E for all three
> requested email paths. Remaining work is deployment and scheduling of the
> evaluators/dispatcher, a preferences UI, event retention, provider bounce and
> complaint webhooks, per-recipient currency rendering, and push. Real-time
> transport is still intentionally out of scope.

Mintea already works out several things worth telling someone and has nowhere to
say them. Connection health computes plain-language Plaid errors, a fourteen-day
consent-expiry warning and five-day staleness detection. Duplicate detection
finds accounts counted twice. Budgets know a category is over. None of it
reaches a person who is not already looking at the right screen.

It has also grown three competing surfaces that each say *something needs your
attention*: `ConnectionsBanner` and `DuplicateAccountsBanner`, both on Accounts,
and the over-budget bar on Budget. A fourth would be worse than a first. P11
replaces them with one place.

## Model

**The in-app store is the source of truth. Email and push are delivery channels
for the same records, not parallel systems.** One generator, one set of
notifications, several ways to reach someone. Otherwise three systems disagree
about what happened, and Mintea emails a user about something they read and
dismissed an hour earlier.

**Notifications come in two classes, and conflating them is the failure mode.**

| Class | Example | Truth is | Clears when |
|---|---|---|---|
| **Derived condition** | A connection needs reauthentication; a category is over budget | Computed from current state | The condition itself resolves |
| **Discrete event** | An import finished; a merge completed; a member joined | A thing that happened at a time | The user dismisses it |

A derived condition must never be stored as a fact and left there. Writing a row
when a connection breaks produces a notification centre full of problems the user
already fixed — which is precisely the stale-data failure the connection-health
work exists to prevent, reintroduced one layer up. Derived conditions are
evaluated against current state and disappear on their own. Only discrete events
are recorded as history.

## P11.1 — The notification centre

- **Shipped** — a per-recipient notification surface with an unread count,
  reachable from its own tab rather than a banner that only speaks on one screen
- **Shipped** — severity that distinguishes *your data is wrong* from *something
  finished*, and orders accordingly
- **Shipped** — a deep link from every notification to the thing it is about
- **Shipped** — read and unread state per recipient, and dismissal
- **Shipped** — retirement of the Accounts and Budget banners into this surface;
  `ConnectionsBanner` and `DuplicateAccountsBanner` now survive only in the dev
  preview route
- **Shipped** — an empty state that affirms health rather than showing nothing;
  for a product whose claim is that its numbers are right, *everything is
  current* is information
- **Planned** — grouping, so five stale accounts are one row rather than five

## P11.2 — Derived conditions, connection health first

- **Shipped** — connection health as the first source: reauthentication
  required, consent expiring within fourteen days, and a connection reporting
  success but producing nothing for five days
- **Shipped** — over-budget and unallocated-income conditions with stable
  month and category keys
- **Shipped** — automatic resolution: a condition that no longer holds is marked
  resolved and its pending email suppressed
- **Partial** — duplicate accounts awaiting review; surfaced in the centre, but
  without a durable evaluator behind it
- **Planned** — billing conditions from [P12](P12-subscriptions.md): payment
  failed, card expiring, trial ending. Each is derived rather than an event — a
  failed payment resolves itself when the card is fixed — so they fit this
  slice's model exactly, and [P13.4](P13-subscription-experience.md)'s dunning
  has no delivery path without them

A broken connection is the highest-value thing Mintea can say, and it is
currently the quietest. Every downstream number inherits a stale balance
silently, and the user has no reason to open the app to find out. It is also the
cheapest, because the logic already exists in `connectionHealth.ts` and only
needs somewhere to appear.

## P11.3 — Discrete events

- **Shipped** — family member joined and left records, queued when the
  membership row changes
- **Shipped** — a durable email outbox keyed by source notification and version,
  which is what makes the cross-channel dedup below possible
- **Planned** — completion records for imports, merges, retroactive rule runs,
  and bulk edits, each naming what actually changed
- **Planned** — billing events from [P12](P12-subscriptions.md): renewed,
  cancelled, refunded
- **Planned** — retention, so the table does not grow without bound; discrete
  events expire on a stated schedule and derived conditions are never stored at
  all

## P11.4 — Escalation to email and push

- **Shipped** — durable deduplication in the database. The provider's
  idempotency key suppresses retries for twenty-four hours, which does not cover
  a daily job that runs again tomorrow
- **Shipped** — suppression of an escalation for anything already read in-app,
  dismissed, resolved, or provider-suppressed
- **Shipped** — a log-only delivery mode for development and end-to-end
  verification, so testing never sends real mail; note the disposable fixture
  identity is `mintea-e2e@example.com`, undeliverable by design and therefore a
  guaranteed hard bounce against the suppression list below
- **Partial** — per-user, per-category email preferences and quiet hours;
  `notification_preferences` stores both, including `quiet_hours_start` and
  `quiet_hours_end`, and no preferences UI exists yet
- **Partial** — bounce and complaint handling. The
  `notification_email_suppressions` table exists and `notification-dispatch`
  checks it before sending, but nothing writes to it: there is no provider
  webhook, so a real bounce never reaches the list. Auth mail and product mail
  share one sending domain, so this is what eventually degrades password reset
- **Planned** — a separation between messages a user may switch off and messages
  they may not. Security, authentication and account-lifecycle mail always
  sends; alerts and digests are optional and carry `List-Unsubscribe`
- **Planned** — a scheduler, which still does not exist in any form: no
  `pg_cron`, no workflow cron. `notification-evaluate` and
  `notification-dispatch` exist but nothing invokes them on a schedule, so
  conditions are only evaluated when something calls them. It must run on the
  household's reporting time zone rather than UTC, and observe the quiet hours
  already stored
- **Planned** — push as the last channel, not the first: `expo-notifications`
  needs device-token storage and invalidation, APNs and FCM credentials through
  EAS, a permission prompt iOS grants one attempt at, and a real device build.
  It is blocked on the store submission in *Parity finishers*, so email and
  in-app must both ship without it

## Family, privacy, and rendering rules

- A notification has one recipient. Generation is household-aware, delivery is
  personal: a connection problem reaches the connection's owner, a shared
  over-budget category reaches every member who can see it.
- A notification may never reveal an account the recipient cannot see. P6 states
  this for private accounts; P11 ships first, so the constraint is written here
  and not inherited later. Titles, counts, grouping and empty states are all
  capable of leaking existence.
- Amounts render per recipient, in that person's display currency, at the rate
  for the date the amount describes. Dates render in the household's reporting
  time zone. Payloads therefore carry native amounts and a rate date, never a
  pre-formatted string — retrofitting this after alerts ship is the expensive
  order.

## Non-goals

- A real-time transport. Refreshing when the app regains focus is sufficient;
  websockets are not a first release.
- Marketing, onboarding drips, or product announcements. P11 carries statements
  about a household's own money.
- Per-notification snooze durations chosen by the user, beyond a single sensible
  default.
- In-app notifications as an audit log. P6.4's activity log answers *who changed
  what*; P11 answers *what needs your attention*.

## Success measures

- A connection that breaks is visible without opening the Accounts screen, and
  stops being visible once it is repaired, with no user action either way.
- Every *needs attention* condition in the product appears in exactly one place.
- No notification names an account, institution, amount or count the recipient
  is not entitled to see.
- A user who reads something in-app does not then receive it by email.
- A daily evaluation that runs twice does not notify twice.
