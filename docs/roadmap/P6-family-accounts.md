[← Roadmap index](../PRODUCT_ROADMAP.md)

# P6 — Family accounts and household collaboration

Status: P6.1 shipped. P6.2 is the blocker — a household with existing data is
still refused with *"Use the family migration flow instead"*, so only new
signups can join a family. P6.3 and P6.4 have not been started.

"Family" is the customer-facing name for the existing `household` data boundary.
A solo user already has a family of one. Enabling Family Sharing adds members to
that household, while each bank or manual account keeps an individual owner and
one of two visibility settings:

- **Family** — every active family member may see the account and its dependent
  balances, transactions, properties, reports, budgets, and totals
- **Private** — only the account owner may see it; it is excluded from every
  family-facing list, total, report, export, search result, notification, rule
  preview, and duplicate detail

The product therefore has two explicit financial views. **Family view** includes
only Family-visible accounts. **My view** includes Family-visible accounts plus
the signed-in person's Private accounts. Members can have different My-view
totals without the product implying that one of them is the family total.

The initial product promise is: **share the accounts you choose, keep the rest
private, and count each known real account once.** Privacy is enforced by the
database and inherited from the account; it is not a client-side filter.

| Situation | Family-account behavior |
|---|---|
| A current solo user | Their existing household is their family of one. |
| A user enables Family Sharing | Onboarding offers **Share all current accounts** or **Choose one by one**. Nothing becomes visible to another person until the user confirms. |
| An invited new or empty user | They join the target family, make the same account-visibility choice, and their automatically created empty household is removed so it cannot become an orphan. |
| An invited user with financial data | They preview the migration, choose each account's visibility, and explicitly move their solo household into the target family. |
| The same real account exists twice | Mintea proactively runs P0 duplicate detection during joining and requires every high-confidence candidate to be resolved before onboarding finishes. |
| A member quits | Mintea creates a new family of one, moves the accounts and history they take with them, and immediately removes their access to the former family. |

## P6.1 — Family sharing and account privacy

- **Shipped** — family setup and renaming in Settings, backed by the existing
  `households` row rather than a new parallel account type
- **Shipped** — secure, expiring, revocable email invitations that work whether
  the recipient signs up first or signs in first
- **Shipped** — owner and member roles: owners manage membership and ownership;
  members can use and edit Family-visible financial data; neither role can read
  another member's Private accounts
- **Shipped** — an account owner and `family` or `private` visibility setting on
  every linked, manual, property and debt account, enforced by
  `current_visible_account_ids()`
- **Shipped** — a visibility choice whenever an account is created, defaulting to
  Private so nothing is published by accident
- **Shipped** — owner-controlled visibility changes later from account settings
- **Shipped** — an empty-household join that atomically moves the recipient's
  membership and profile to the target family and disposes of the bootstrap
  household created at sign-up
- **Shipped** — a Family settings screen showing members, pending invitations and
  roles
- **Shipped** — member attribution for Plaid connections and manual accounts;
  only the connection owner can reconnect, disconnect, or change the visibility
  of accounts from their bank authorization
- **Planned** — an enablement flow offering **Share all current accounts** or
  **Choose one by one**, with account name, institution, type, last four digits,
  and balance shown before confirmation
- **Planned** — the same visibility step for a joining member; accounts not
  selected for sharing remain Private inside the joined family
- **Planned** — an impact preview before a Family account becomes Private
- **Planned** — distinct Family and My views across dashboard, accounts,
  transactions, reports, budgets, net worth, search, export, and notifications

P6.1 is a family-invite beta for new or empty members. It is not yet a public
claim that two established Mintea users can combine their financial histories.

**Join UX decision** — an empty-household join is one explicit consent action:
**Leave current family and join [Family]**. The user does not perform a
separate removal step and is never intentionally left without a family. The
server-side operation removes the old membership before adding the new one,
updates the profile, asserts that exactly one active membership remains, and
rolls back the whole move if any step fails. A populated household uses the
P6.2 migration preview instead, and leaving a multi-member family uses P6.3's
separation flow.

## P6.2 — Join and proactively deduplicate

- **Planned** — a pre-join preview showing the source household's accounts,
  connections, transactions, properties, rules, categories, plans, and history
  that will move, plus the Family or Private visibility selected for each account
- **Planned** — an explicit, server-side migration of all household-scoped
  records to the target family while preserving each account's owner and chosen
  visibility, with an auditable result and no client access to Plaid tokens
- **Planned** — deterministic migration mapping: match system categories by
  system key, coalesce unambiguous case-insensitive merchants and tags, and show
  category, rule, and budget-plan conflicts for review instead of copying a
  second default tree or silently overwriting a plan
- **Planned** — an automatic duplicate scan as soon as both account sets are
  available, before the joined family dashboard is activated; no separate trip
  to Settings is required to discover known duplicate accounts
- **Planned** — an in-onboarding duplicate review spanning both members'
  accounts and reusing P0's conservative candidate rules, dry-run summary, and
  one-to-one transaction reconciliation; every high-confidence candidate must be
  classified as distinct or merged before joining finishes
- **Planned** — privacy-preserving duplicate handling: trusted server code may
  compare all candidate accounts, but a Private account's identity, balance, and
  transactions are never disclosed to another member; a confirmed merge adopts
  the more restrictive visibility unless the account owner explicitly shares it
- **Planned** — two-owner consent when a candidate spans accounts owned by
  different people; each person sees their own account plus only non-sensitive
  context about the match, and either person may classify it as distinct
- **Planned** — idempotent retry and recovery behavior so an expired invite,
  repeated tap, or interrupted migration cannot produce two memberships,
  orphaned households, or double-counted history
- **Planned** — the case where **both households are already paying**: two live
  subscriptions arrive at one household, on two different store accounts. The
  preview must say which survives and what happens to the other, and the join
  must not complete leaving both billing. See
  [P12.4](P12-subscriptions.md) for the reconciliation mechanics — this slice
  owns the moment that creates the situation
- **Planned** — an application-level single-membership guard: the join moves a
  `household_members` row inside one server-side transaction rather than adding
  a second, asserts the invariant before returning, and is covered by a check
  that reports any user holding two memberships
- **Planned** — refusal of a join whose two households disagree on
  `plaid_environment`, checked before any preview is offered and stated in plain
  language rather than as a validation error
- **Planned** — a transfer-candidate scan across the combined account set once
  migration completes, reusing P0's exact-opposite, same-currency,
  seven-day-window rules, so transfers between two members' accounts stop
  counting as income and spending
- **Planned** — visibility-aware transfer suggestions: a candidate is offered
  only to a person who can see both sides, so a pair spanning a Private and a
  Family account is never surfaced to anyone but the private account's owner

Deduplication is proactive, but destructive merging is not blind. Mintea starts
the scan automatically, recommends the surviving connection, and requires an
explicit distinct-or-merge decision for every high-confidence candidate. P0
then preserves unique history and archives only confirmed overlap. The family
dashboard does not open with a known duplicate silently inflating its totals.

Transfer pairing is the quieter half of the same reconciliation. Candidates are
scoped to one household today, so a transfer from one partner's checking to the
other's savings is invisible while they are separate and pairable the moment
they are not — money moving between two members currently reads as one of them
earning and the other spending. Joining a family is therefore the point at which
that whole class of miscount becomes fixable, and the same joined data makes it
more visible: shared budgets and reports inherit every unpaired transfer.

The environment guard is a smaller rule with a worse failure mode. Because
`plaid_environment` sits on both `households` and `plaid_items`, a join across
environments would migrate sandbox Items into a production family and quietly
break the invariant that environment is a property of the household. Refusing
the join is the only safe answer; there is no partial migration worth offering.

## P6.3 — Quit a family safely

- **Planned** — a **Leave family** action independent of signing out or deleting
  the Mintea account
- **Planned** — refusal to let the **billing owner** leave until the subscription
  is transferred to a remaining member or cancelled. Otherwise the payer walks
  out and the whole family silently drops to free, including members who
  contributed the data. This mirrors the existing refusal to let the last owner
  delete a shared household; see [P12.4](P12-subscriptions.md)
- **Planned** — a departure preview showing which owned accounts, connections,
  transactions, properties, and history will move or stay before confirmation
- **Planned** — Private accounts always move with their owner into a newly
  created family of one, together with their balances, transactions, splits,
  properties, and directly dependent history
- **Planned** — for each Family-visible account owned by the departing member,
  a choice to **Take with me** or transfer stewardship to a consenting remaining
  member; take is the default, and no live bank connection is copied
- **Planned** — deterministic remapping of categories, merchants, tags, rules,
  and plans needed by moved records without exposing financial data belonging to
  members who remain in the former family
- **Planned** — safe repair of cross-boundary relationships such as transfer
  pairs, splits, review assignments, and duplicate metadata when one account
  moves and its counterpart stays
- **Planned** — immediate revocation of former-family access after the atomic
  departure succeeds; the departing user lands in their new My view with their
  selected data intact
- **Planned** — owner transfer before an owner can leave a multi-member family;
  a sole remaining member simply returns to a family of one
- **Planned** — owner-initiated member removal through the same separation path:
  the removed member's owned accounts move to their new family of one by default,
  and the family administrator never receives access to their Private details

Leaving moves data; it does not duplicate it. Accounts that move disappear from
the former family's current and historical views. An account transferred to a
remaining member stays in the family and does not appear in the departing
member's new household.

## P6.4 — Coordinate across shared accounts

- **Planned** — account and transaction attribution plus owner filters within
  Family-visible data; filters change the view, not authorization
- **Planned** — review assignment so one member can take responsibility for a
  shared transaction without hiding it from the other members
- **Planned** — an activity log for membership, budget-plan, and high-impact
  shared-account changes, with actor and time and no Private-account leakage
- **Planned** — shared budget and goal collaboration, including transparent
  contribution history from Family-visible accounts, after the underlying P3
  and P5 capabilities exist

## Authorization, data, and exit rules

- A person has exactly one active family in P6. This preserves the current
  `profiles.household_id` contract and avoids an ambiguous family switcher;
  multi-family and advisor access are later products.
- That single-membership rule is enforced in the server-side join and departure
  operations, not by a unique constraint on `household_members.user_id`. A
  database constraint would be the stronger guard, and it is deliberately not
  used: it would foreclose the multi-family and advisor access named above, and
  removing it later is a migration on the table every RLS policy depends on.
  The rule is a product decision for P6, not a permanent property of the schema.
- Because that guard is not in the database, the join must **move** a membership
  row within one server-side transaction and never insert the new one before
  deleting the old. `current_household_ids()` returns every membership a user
  has, so a second row — even for the duration of a retry — makes every
  RLS-scoped read silently union two families across accounts, transactions,
  budgets and net worth. The failure is invisible rather than loud, so the join
  path also asserts single membership before it returns, and a periodic check
  reports any user holding two.
- One owner must always remain. Ownership transfer is explicit and confirmed;
  no role change, removal, or deletion may leave an active family ownerless.
- Every account has exactly one Mintea owner. Ownership records connection
  stewardship, not legal ownership at the financial institution; it can change
  only through an explicit transfer accepted by the new owner.
- Only the account owner may change Family or Private visibility. A family owner
  cannot override another member's privacy choice merely because they administer
  membership.
- Account privacy is inherited by balances, transactions, splits, properties,
  transfers, rules, reports, budgets, goals, search, export, notifications, and
  all aggregate SQL. A private account must not be inferable through totals,
  counts, institution lists, duplicate details, or error messages.
- Household membership is the first authorization gate and account visibility
  is the second. Existing household-only RLS is insufficient and must be replaced
  or extended with shared access helpers used consistently by tables, database
  functions, views, and Edge Functions.
- Plaid secrets remain in the server-only `plaid_item_secrets` table. A single
  Plaid Item may contain both Family and Private accounts, but only its owner can
  manage the connection and private account metadata cannot leak through it.
- A family has exactly one `plaid_environment`, and joining may never mix them.
  The column exists on both `households` and `plaid_items`, so a cross-environment
  join would leave sandbox Items inside a production family; the join is refused
  rather than partially applied.
- A transfer pair may only be suggested to someone who can see both of its
  accounts. Pairing is an account-visibility question before it is a matching
  question, and an unpairable transfer is preferable to a disclosed one.
- Joining and leaving both use explicit consent screens. Before joining, a user
  sees exactly which accounts become Family-visible; before leaving, they see
  which records move, stay, or require ownership transfer.
- Invitation acceptance, migration, role change, visibility change, deduplication,
  and departure run through server-authorized operations rather than directly
  client-writable ownership or membership rows.

## Explicit non-goals for the first family release

- Minor or dependent logins, custody workflows, and parental controls
- A financial-advisor portal or multi-family switching
- Merging two populated, already-shared families; P6.2 accepts only a
  single-member source household, so a person cannot unilaterally move another
  member's data
- Per-transaction privacy inside a Family-visible account; visibility is set at
  the account boundary so dependent data cannot disagree
- Automatic destructive account merges or transaction deletion without a
  reviewed candidate and explicit confirmation
- Copying household-global budgets, goals, or collaborative history into two
  households during departure; owned account data moves, shared planning stays
- Family billing, split payment responsibility, or separate premium entitlements

## Success measures and release gate

- Both the creator and joining member can choose **Share all** or account by
  account, and the resulting Family view matches that selection exactly.
- Direct queries, aggregates, reports, exports, search, and notifications expose
  zero metadata from another member's Private account.
- An established member can see exactly what will move before confirming, and a
  failed or repeated attempt cannot produce duplicate membership or history.
- Duplicate detection starts automatically during joining, and onboarding cannot
  complete while a known high-confidence candidate is unresolved.
- A member can leave without deleting their Mintea identity, arrives in a new
  family of one with all selected owned data intact, and immediately loses access
  to accounts left behind.
- Measure invitation acceptance, Share-all versus selective-sharing choice,
  private-to-Family visibility changes, duplicate candidates and decisions,
  time to first shared dashboard, successful departures, two-member day-30
  retention, and authorization failures.

The `households` and `household_members` tables and the household-scoped RLS
policies every feature already runs through are **Shipped**; none of the
family-account experiences above is reachable by a user yet.

This package said "move earlier if couples become Mintea's primary customer."
That decision is made: it moves ahead of P4 and P5. The schema already carries
`household_id` on every table and every RLS policy already gates on membership,
so the remaining work is account-level authorization, onboarding, safe family
migration and deduplication, and an exit flow that can separate owned data without
copying it — still far less foundational work than starting collaboration from a
user-only schema.
