[← Roadmap index](../PRODUCT_ROADMAP.md)

# P1 — Smart transaction workflow

Status: three vertical slices shipped (merchant cleanup rules, tags, then
category-group management); the remaining rule-expansion and split work is
still planned.

Scope:

- **Shipped** — merchant editing and consolidation
- **Shipped** — tag creation, assignment, removal, and filtering
- **Partial** — category-group management; create, rename, retype, reorder and
  delete are shipped, deactivation is not
- **Partial** — deterministic transaction rules; exact bank-description matching
  with preview and historical application is shipped, retroactive runs launched
  from rule management are not
- **Partial** — bulk editing; applying a tag to a selection is shipped, and bulk
  tag removal, merchant, review and visibility are not
- **Partial** — smart splits; fixed amounts are shipped, percentages are not
- **Planned** — additional rule conditions and actions with explicit previews
- **Planned** — quick-rule suggestions after repeated corrections

Rules should be deterministic before Mintea claims personalized or AI
categorization.


---

## Product requirements: Smart transaction workflow

### First vertical slice: merchant cleanup rules — shipped

The first P1 slice makes a repeated transaction correction reusable without
pretending that Mintea can safely infer a broad rule from one edit.

Users can:

- **Shipped** — choose an existing canonical merchant or create one while
  editing a transaction
- **Shipped** — preview how many active transactions share the exact bank
  description
- **Shipped** — apply the selected merchant and category to those historical
  matches
- **Shipped** — remember the cleanup for future Plaid imports
- **Shipped** — review, pause, resume, and delete saved rules from Settings

The initial matcher normalizes only capitalization, leading/trailing spaces,
and repeated spaces. It does not use substring, similarity, amount, or merchant
logo matching. `BLUE BOTTLE COFFEE #1842` can match a differently-cased copy of
the same string, but it cannot match `BLUE BOTTLE COFFEE #1843`.

Historical application and rule creation run together in Postgres. The rule
cannot reference a merchant or category from another household. Existing
split-category allocations are preserved, and user-selected merchants survive
the Plaid pending-to-post transition.

Deleting a rule does not undo past corrections. It only stops future automatic
cleanup. This makes rule lifecycle behavior predictable and avoids silently
rewriting reviewed history.

### Second vertical slice: tags — shipped

Tags cut across categories: a transaction has exactly one category but any
number of tags, so "reimbursable", "tax deductible", and a trip name can coexist
on the same row without competing with categorization.

Users can:

- **Shipped** — create, rename, recolour, and delete tags from Settings → Tags,
  with usage counts and a delete confirmation that names how many transactions
  are affected and states that the transactions themselves are kept
- **Shipped** — create a tag inline while assigning one, so tagging does not
  require a detour into Settings first
- **Shipped** — assign and unassign tags on a transaction
- **Shipped** — see tags on transaction rows
- **Shipped** — filter the transaction list by one or more tags
- **Shipped** — apply a tag to a multi-transaction selection in one action

Tag names are normalized in Postgres (trimmed, internal whitespace collapsed)
and are unique per household case-insensitively, so "Tax Deductible" and "tax
deductible" cannot both exist. The name rules live in a database trigger and a
unique index rather than only in the client, so a second device or a direct API
call cannot create a duplicate.

Assignment and bulk tagging run through SQL functions. Replacing a
transaction's tags is atomic, bulk tagging reports how many rows it actually
changed rather than how many were selected, and neither can reference a tag or
transaction from another household. Deleting a tag removes its assignments and
leaves the transactions intact.

Tag filtering uses a PostgREST inner-joined embed rather than looking up
matching transaction ids and passing them back in an `id=in.(…)` list, so the
request size does not grow with how heavily a tag is used.

### Follow-on slices

- **Planned** — more rule conditions and actions with explicit previews
- **Planned** — retroactive rule runs initiated from rule management
- **Planned** — percentage splits and broader bulk transaction actions
- **Planned** — removing a tag from a whole selection (bulk tagging currently
  only adds)
- **Planned** — tag-based reporting and budgets

### Third vertical slice: category groups — shipped

Categories could be renamed and moved since the first release, but the groups
holding them were fixed: `createCategoryGroup` existed in the data layer and
nothing in the app called it, and there was no way to rename, reorder or remove
one at all.

Users can now create a group, rename it, change what it counts as, move it up
and down the list, and delete it.

Deleting is where the care went. The schema already cascades:

    category_groups --on delete cascade--> categories
    categories      --on delete set null--> transactions.category_id
    categories      --on delete cascade--> transaction_rules

A plain delete would therefore destroy every category in the group, silently
uncategorise every transaction that used them, and remove any cleanup rules
that referenced them. The money survives; years of categorisation do not.

So deletion goes through a SQL function that refuses to run unless the group is
empty or its categories have somewhere to go, and the screen asks where they
should move before offering the button. A group is a container, and removing a
container should not destroy its contents. Verified on a copy of the production
household: deleting a five-category group relocated all five and left all 53
transactions categorised exactly as before.

Reordering is applied in a single statement rather than a write per row, since
partial ordering shows as groups jumping around; the same function renormalises
the gaps that deleting a group leaves behind.

### Verification

- Migration tests execute the full schema and prove exact normalization,
  historical application, household authorization, and safe rejection paths.
- TypeScript checks and the production web build must pass.
- Browser verification covers merchant search/creation, rule preview,
  enable/pause/delete, success/error/loading states, responsive presentation,
  accessibility semantics, and light/dark themes.
- For tags, migration tests cover name normalization, case-insensitive
  uniqueness per household, usage counts that exclude removed rows and split
  children, atomic set-replacement with rollback, bulk tagging change counts,
  cross-household rejection, and delete cascade. Unit tests cover the shared
  name-validation and display-ordering rules. Browser verification covers
  create/rename/recolour/delete, inline creation, the duplicate-name message,
  assignment, row display, filtering, bulk tagging, and the destructive delete
  confirmation, at phone/tablet/desktop widths in both themes, including the
  empty and error states.
