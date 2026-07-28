-- Associate every Plaid Item with the returning-user phone Mintea supplied to
-- Link. Accounts inherit the label through plaid_item_id.
--
-- Plaid does not return the verified returning-user number from Link success
-- or /item/get, so Items created before this migration remain nullable and can
-- be labelled by their household in Settings.

alter table public.plaid_items
  add column plaid_phone_number text
  check (
    plaid_phone_number is null
    or plaid_phone_number ~ '^\+[1-9][0-9]{7,14}$'
  );

-- Clients still cannot change connection status, Plaid ids, error state, or
-- credentials. The only client-writable Item column is this household label.
create policy plaid_items_phone_update on public.plaid_items
  for update to authenticated
  using (household_id in (select public.current_household_ids()))
  with check (household_id in (select public.current_household_ids()));

grant update (plaid_phone_number) on public.plaid_items to authenticated;

