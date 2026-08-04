-- Put the end-to-end test household on Plaid Sandbox.
--
-- The preceding migration defaults every household to 'production'. That is the
-- right default for real households and the wrong one for this household: it
-- exists so the Android emulator and iOS simulator can run the full Plaid
-- matrix, and on production a Link flow there would connect a real bank and
-- create a real, billable Item that uninstalling the app does not undo.
--
-- This is a migration rather than a note in a runbook because a manual step is
-- the one that gets forgotten, and forgetting this one costs money.
--
-- Scoped to a single id, so it is a harmless no-op anywhere that row does not
-- exist — a contributor's own Supabase project, or a fresh database.

update households
   set plaid_environment = 'sandbox'
 where id = 'ead3e9e9-37c9-4f09-9415-3ca62484b233';
