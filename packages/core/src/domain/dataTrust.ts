import type { AccountWithInstitution } from './accounts';

export type DuplicateConfidence = 'high' | 'possible';

export type DuplicateAccountCandidate = {
  id: string;
  first: AccountWithInstitution;
  second: AccountWithInstitution;
  confidence: DuplicateConfidence;
  reasons: string[];
  recommendedKeepId: string;
};

const STATUS_RANK: Record<string, number> = {
  good: 5,
  pending_expiration: 4,
  login_required: 3,
  error: 2,
  revoked: 1,
};

/**
 * Normalises provider-controlled identity text without treating loose fuzzy
 * similarity as proof. "Chase Bank" and "Chase-Bank" match; "Chase" and
 * "Chase Bank" deliberately do not.
 */
export function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function sameInstitution(
  first: AccountWithInstitution,
  second: AccountWithInstitution,
): boolean {
  const firstProviderId = first.institution?.id;
  const secondProviderId = second.institution?.id;

  if (firstProviderId && secondProviderId) {
    return firstProviderId === secondProviderId;
  }

  const firstName = normalizeIdentityText(first.institution?.name);
  const secondName = normalizeIdentityText(second.institution?.name);
  return firstName.length > 0 && firstName === secondName;
}

function recommendedKeep(
  first: AccountWithInstitution,
  second: AccountWithInstitution,
): string {
  const firstStatus = STATUS_RANK[first.institution?.status ?? ''] ?? 0;
  const secondStatus = STATUS_RANK[second.institution?.status ?? ''] ?? 0;

  if (firstStatus !== secondStatus) {
    return firstStatus > secondStatus ? first.id : second.id;
  }

  const firstSynced = Date.parse(first.institution?.lastSyncedAt ?? '');
  const secondSynced = Date.parse(second.institution?.lastSyncedAt ?? '');
  const safeFirstSynced = Number.isNaN(firstSynced) ? 0 : firstSynced;
  const safeSecondSynced = Number.isNaN(secondSynced) ? 0 : secondSynced;

  if (safeFirstSynced !== safeSecondSynced) {
    return safeFirstSynced > safeSecondSynced ? first.id : second.id;
  }

  // Stable across refetches so the selected recommendation never flickers.
  return first.id.localeCompare(second.id) <= 0 ? first.id : second.id;
}

function compareAccounts(
  first: AccountWithInstitution,
  second: AccountWithInstitution,
): DuplicateAccountCandidate | null {
  if (
    first.deleted_at !== null ||
    second.deleted_at !== null ||
    first.is_manual ||
    second.is_manual ||
    !first.plaid_item_id ||
    !second.plaid_item_id ||
    first.plaid_item_id === second.plaid_item_id ||
    first.type !== second.type ||
    first.currency !== second.currency ||
    first.is_asset !== second.is_asset
  ) {
    return null;
  }

  const firstMask = normalizeIdentityText(first.mask);
  const secondMask = normalizeIdentityText(second.mask);

  // Last four is a necessary signal, never sufficient on its own.
  if (!firstMask || firstMask !== secondMask || !sameInstitution(first, second)) {
    return null;
  }

  const firstOfficial = normalizeIdentityText(first.official_name);
  const secondOfficial = normalizeIdentityText(second.official_name);
  const officialNameMatches =
    firstOfficial.length > 0 && firstOfficial === secondOfficial;

  const firstName = normalizeIdentityText(first.name);
  const secondName = normalizeIdentityText(second.name);
  const displayNameMatches = firstName.length > 0 && firstName === secondName;

  const subtypeMatches =
    Boolean(first.subtype && second.subtype) && first.subtype === second.subtype;
  const balanceMatches =
    first.current_balance_cents === second.current_balance_cents;

  const institutionLabel =
    first.institution?.name ?? second.institution?.name ?? 'institution';
  const reasons = [
    `Same ${institutionLabel} connection`,
    `Same last four ••${first.mask}`,
    ...(officialNameMatches
      ? [`Same official account name`]
      : displayNameMatches
        ? [`Same account name`]
        : []),
    ...(subtypeMatches ? [`Same account subtype`] : []),
    ...(balanceMatches ? [`Same current balance`] : []),
  ];

  return {
    id: [first.id, second.id].sort().join(':'),
    first,
    second,
    confidence:
      officialNameMatches || displayNameMatches || (subtypeMatches && balanceMatches)
        ? 'high'
        : 'possible',
    reasons,
    recommendedKeepId: recommendedKeep(first, second),
  };
}

/**
 * Finds conservative, review-only candidates. This function never changes
 * state and intentionally misses ambiguous duplicates rather than risking a
 * false positive.
 */
export function findDuplicateAccountCandidates(
  accounts: AccountWithInstitution[],
): DuplicateAccountCandidate[] {
  const candidates: DuplicateAccountCandidate[] = [];

  for (let firstIndex = 0; firstIndex < accounts.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < accounts.length;
      secondIndex += 1
    ) {
      const candidate = compareAccounts(
        accounts[firstIndex]!,
        accounts[secondIndex]!,
      );
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates.sort(
    (first, second) =>
      (first.confidence === second.confidence
        ? 0
        : first.confidence === 'high'
          ? -1
          : 1) ||
      first.first.name.localeCompare(second.first.name) ||
      first.id.localeCompare(second.id),
  );
}
