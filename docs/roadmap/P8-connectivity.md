[← Roadmap index](../PRODUCT_ROADMAP.md)

# P8 — Connectivity and specialty integrations

Status: not started.

Scope:

- **Planned** — a second aggregation provider, MX; scoped as P8.1 below
- **Planned** — Apple Card
- **Planned** — vehicle valuation
- **Planned** — bill sync

The direct integrations should follow measured demand. The second provider has
a stricter gate, described first.

## P8.1 — A second aggregation provider (MX)

**Do not start this until the data says to.** Mintea already records what is
needed to decide: `plaid_items` carries `plaid_institution_id`,
`institution_name`, status, error code and last sync, and connection health
already classifies the failures. Nothing reads any of it in aggregate.

- **Planned** — a connection-reliability report: failures and reconnect prompts
  by institution, so the question becomes *which institutions are failing and
  would MX cover them* rather than *should we add a provider*

MX's advantage is concentrated in credit unions and its transaction enrichment.
If failures are spread evenly across institutions both providers cover, a second
aggregator is a second vendor relationship and roughly six hundred lines of
Plaid-shaped code touched, for no user-visible gain.

**What adoption costs.** Evaluation is genuinely self-serve: MX's dashboard
grants a free developer tier immediately, with aggregation for up to one hundred
users, though only across a subset of institutions — which may exclude the
institution being evaluated. Production is requested from the same dashboard,
but published market pricing is contract-shaped rather than
card-on-file, so plan for a sales conversation and a commitment. This is the
main way MX is *less* self-serve than Plaid, whose production path is
pay-as-you-go.

### Provider-neutral schema, done first

This is worth doing while there is still one provider and the migration is
mechanical. Later it means rewriting live tables that budgets, family sharing
and notifications all read.

- **Planned** — `plaid_items` becomes a `connections` table carrying an explicit
  provider, and `plaid_item_secrets` becomes its provider-agnostic peer
- **Planned** — `accounts.plaid_account_id` and
  `transactions.plaid_transaction_id` become provider-scoped identifiers, with
  uniqueness per provider rather than global
- **Planned** — the `plaid_item_status` enum and `households.plaid_environment`
  generalize, environment becoming a property of each provider connection
- **Planned** — one provider interface behind the Edge Functions — link token,
  exchange, sync, webhook, remove — with Plaid and MX implementations. MX models
  a connection as a *member* belonging to a *user*, which does not map onto a
  Plaid Item one-to-one

### A canonical institution registry

- **Planned** — a canonical institution record mapping one institution to each
  provider's identifier for it, with a single name and logo
- **Planned** — one search result per institution, whichever providers reach it
- **Planned** — a routing policy stored as data rather than code: preferred
  provider per institution, changeable without a deploy as coverage and
  reliability move

Both providers can be enumerated on their free tiers — Plaid through
`/institutions/get`, MX through its Platform API institutions endpoints — so the
registry can be seeded from a real diff rather than from vendor coverage claims.

### Cross-provider duplicate detection, before MX goes live

- **Planned** — duplicate detection keyed on canonical institution rather than
  on a provider's institution identifier, and no longer gated on both accounts
  being Plaid Items

This is a correctness prerequisite, not a refinement. `institutionsMatch` in
`packages/core/src/domain/dataTrust.ts` compares provider institution
identifiers and returns false when both are present and differ, never reaching
its normalized-name fallback. Plaid's identifier for an institution will never
equal MX's. The same account connected through both providers would therefore
not be flagged as a duplicate at all, and would silently count twice in net
worth — the exact failure P0 exists to prevent, reintroduced by the feature
meant to improve connectivity.

### The connect experience

- **Planned** — institution-first connection: the user searches for their bank,
  and the provider is resolved behind it
- **Planned** — an alternate provider available through progressive disclosure,
  surfaced prominently only after a connection has actually failed
- **Planned** — the provider pinned to the connection at creation and used by
  every later sync, refresh, reconnect and disconnect, exactly as
  `plaid_environment` already is
- **Planned** — reconnect that never reroutes to the other provider; repairing a
  connection through a different provider does not repair it, it creates a
  second one and leaves the first broken
- **Planned** — a failed attempt offering one retry by another route, never
  switching silently mid-flow
- **Planned** — the provider name shown in connection details for support, and
  nowhere in the connect flow or on an account

The provider must never be a *required* decision and should always be an
*available* one. Monarch — which routes through Plaid, Finicity and MX — defaults
to a recommended provider and hides the alternates behind a `…` icon beside the
institution name. That escape hatch exists because when a bank will not connect,
*try another way* is the only self-service answer there is.

### What happens after a switch

- **Planned** — automatic detection of the duplicate a provider switch creates,
  with the existing dry-run merge offered directly from the connection that was
  replaced

This is where Mintea can be plainly better than the competition rather than at
parity. Monarch leaves the aftermath manual: connecting through a new provider
produces a duplicate, and the user is expected to notice, run a Transfer Tool to
move balance and transaction history across, then delete the leftover account.
Mintea already detects duplicates and merges them in one transaction with an
impact summary. Switching provider should end with an offer to merge, not with
homework.

### Operational cost

- **Planned** — per-provider webhook verification; Plaid's ES256
  `Plaid-Verification` JWT check does not generalize
- **Planned** — per-provider error translation in `connectionHealth.ts`, which
  today maps Plaid codes to plain language
- **Planned** — per-provider secrets, environments and sandbox fixtures, and a
  second set of failure modes to monitor

### Non-goals

- Exposing the provider as a required choice at connection time.
- Migrating existing connections to a new provider automatically. Moving one is
  disconnect, reconnect and merge, and only on explicit user action.
- Rerouting a connection to another provider during reconnect.
- A third provider. Two is already two vendor relationships.

### Success measures

- Connection failures at the institutions the reliability report identified drop
  measurably, and that report is the reason the provider was added.
- No user is asked to choose a provider in order to connect successfully.
- The same account reached through both providers is detected as a duplicate and
  offered a merge, with no manual history transfer.
- A repaired connection stays on the provider it was created with.
