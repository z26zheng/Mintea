import type {
  AccountRow,
  AccountType,
  PlaidItemStatus,
} from '../types/database';
import { sumCents, type Cents } from './money';

/**
 * An account joined to the Plaid Item it came from. Institution name, logo and
 * connection health live on the Item, not the account, so the list query pulls
 * them across.
 */
export type AccountWithInstitution = AccountRow & {
  institution: {
    name: string | null;
    logo: string | null;
    phoneNumber: string | null;
    status: PlaidItemStatus;
    errorMessage: string | null;
  } | null;
};

/**
 * How accounts are bucketed in the UI. Plaid's `type` is close but doesn't
 * distinguish a house (asset) from a mortgage (liability) inside "other".
 */
export type AccountGroupKey =
  | 'cash'
  | 'credit'
  | 'investments'
  | 'loans'
  | 'otherAssets'
  | 'otherLiabilities';

export const ACCOUNT_GROUP_ORDER: AccountGroupKey[] = [
  'cash',
  'credit',
  'investments',
  'loans',
  'otherAssets',
  'otherLiabilities',
];

export const ACCOUNT_GROUP_LABELS: Record<AccountGroupKey, string> = {
  cash: 'Cash',
  credit: 'Credit Cards',
  investments: 'Investments',
  loans: 'Loans',
  otherAssets: 'Other Assets',
  otherLiabilities: 'Other Liabilities',
};

export function accountGroupKey(account: AccountRow): AccountGroupKey {
  switch (account.type) {
    case 'depository':
      return 'cash';
    case 'credit':
      return 'credit';
    case 'investment':
      return 'investments';
    case 'loan':
      return 'loans';
    case 'other':
      return account.is_asset ? 'otherAssets' : 'otherLiabilities';
  }
}

/** Whether a Plaid account type represents something you own or something you owe. */
export const isAssetType = (type: AccountType): boolean =>
  type !== 'credit' && type !== 'loan';

export type AccountGroup<T extends AccountRow = AccountRow> = {
  key: AccountGroupKey;
  label: string;
  accounts: T[];
  /** Signed total — liabilities contribute negatively. */
  totalCents: Cents;
};

export function groupAccounts<T extends AccountRow>(
  accounts: T[],
): AccountGroup<T>[] {
  const buckets = new Map<AccountGroupKey, T[]>();

  for (const account of accounts) {
    const key = accountGroupKey(account);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(account);
    else buckets.set(key, [account]);
  }

  return ACCOUNT_GROUP_ORDER.flatMap((key) => {
    const bucket = buckets.get(key);
    if (!bucket || bucket.length === 0) return [];

    const sorted = [...bucket].sort(
      (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
    );

    return [
      {
        key,
        label: ACCOUNT_GROUP_LABELS[key],
        accounts: sorted,
        totalCents: sumCents(sorted.map((a) => a.current_balance_cents)),
      },
    ];
  });
}

export type NetWorthSummary = {
  assetsCents: Cents;
  liabilitiesCents: Cents;
  netCents: Cents;
};

/**
 * Live net worth from current balances. Hidden accounts still count — only
 * `include_in_net_worth` and soft-deletion remove an account from the total.
 */
export function summarizeNetWorth(accounts: AccountRow[]): NetWorthSummary {
  let assetsCents = 0;
  let liabilitiesCents = 0;

  for (const account of accounts) {
    if (account.deleted_at !== null || !account.include_in_net_worth) continue;

    if (account.is_asset) assetsCents += account.current_balance_cents;
    else liabilitiesCents += account.current_balance_cents;
  }

  return {
    assetsCents,
    liabilitiesCents,
    netCents: assetsCents + liabilitiesCents,
  };
}

/**
 * What to show on an account row. Liabilities are stored negative so net worth
 * is a plain sum, but a credit card should read "$412.50" owed rather than
 * "-$412.50".
 */
export function accountDisplayBalance(account: AccountRow): {
  cents: Cents;
  isOwed: boolean;
} {
  return {
    cents: account.is_asset
      ? account.current_balance_cents
      : Math.abs(account.current_balance_cents),
    isOwed: !account.is_asset && account.current_balance_cents !== 0,
  };
}

/** Percentage of a credit line used, or `null` when there's no limit on file. */
export function creditUtilization(account: AccountRow): number | null {
  if (account.type !== 'credit' || !account.limit_cents) return null;

  const used = Math.abs(account.current_balance_cents);
  return Math.min(used / account.limit_cents, 1);
}

export const accountSubtitle = (account: AccountWithInstitution): string => {
  const parts: string[] = [];

  if (account.institution?.name) {
    parts.push(account.institution.name);
  } else if (account.is_manual) {
    parts.push('Manual');
  }

  if (account.mask) parts.push(`••${account.mask}`);

  return parts.join(' · ');
};

/** True when the connection is broken and the user needs to re-authenticate. */
export const needsReconnect = (account: AccountWithInstitution): boolean =>
  account.institution?.status === 'login_required' ||
  account.institution?.status === 'error' ||
  account.institution?.status === 'revoked';
