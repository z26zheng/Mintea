type ListableAccount = {
  current_balance_cents: number;
  is_hidden: boolean;
};

/** Accounts shown in the list, with an optional reversible zero-balance filter. */
export function filterAccountsForList<T extends ListableAccount>(
  accounts: T[],
  hideZeroBalances = false,
): T[] {
  return accounts.filter(
    (account) =>
      !account.is_hidden &&
      (!hideZeroBalances || account.current_balance_cents !== 0),
  );
}
