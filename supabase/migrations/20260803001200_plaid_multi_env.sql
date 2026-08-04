-- Run Plaid Sandbox and Production side by side in one project.
--
-- Until now every Plaid call resolved its environment from a single global
-- PLAID_ENV secret at request time, so the whole deployment was in one mode or
-- the other. That made Sandbox testing impossible while real households were
-- syncing, and left a live correctness hazard: nothing recorded which
-- environment an Item had been created in, and the code defaulted to sandbox
-- whenever the secret was unset. Flipping or losing that one value would point
-- production access tokens at the sandbox host, turning every sync, balance
-- refresh and disconnect into INVALID_ACCESS_TOKEN — which delete-account then
-- read as "already gone", erasing local data while the bank connections stayed
-- live at Plaid.
--
-- The environment therefore becomes a property of the household and of each
-- stored Item, never of the deployment and never of a request.
--
-- Defaulting both columns to 'production' labels every existing row correctly,
-- which is what makes this migration safe to apply before the Edge Functions
-- that read it are deployed.

alter table households
  add column plaid_environment text not null default 'production'
    check (plaid_environment in ('sandbox', 'production'));

alter table plaid_items
  add column plaid_environment text not null default 'production'
    check (plaid_environment in ('sandbox', 'production'));

comment on column households.plaid_environment is
  'Which Plaid environment this household links against. Operator-set: not writable by clients.';

comment on column plaid_items.plaid_environment is
  'The environment this Item was created in. Every later call for it uses this value.';

-- The environment is chosen by the operator, never by the account holder.
--
-- The existing grant is table-wide:
--
--     grant update on households, profiles to authenticated;
--
-- and households_update admits any member of their own household. Together
-- those would let a signed-in user PATCH /households?id=eq.<their own> and set
-- plaid_environment themselves. That is not a cross-household breach — RLS
-- still confines them to their own row — which is precisely why a row policy
-- cannot express this restriction and a column-level grant must: a sandbox
-- household could otherwise promote itself to production and start creating
-- real, billable Items, and a production household could demote itself and
-- silently break its own syncing.
--
-- `name` stays writable so a future rename feature needs no further migration.
-- Nothing in the client writes to this table today: every reference in
-- packages/core and apps/mintea is a .select() of id, name or timezone. And
-- `timezone` is written only through set_reporting_timezone(), a SECURITY
-- DEFINER function that a table grant does not affect — so narrowing this
-- breaks nothing that exists.
revoke update on households from authenticated;
grant update (name) on households to authenticated;
