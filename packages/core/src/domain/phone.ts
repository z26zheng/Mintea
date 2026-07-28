/**
 * Phone normalization.
 *
 * Lives in `domain` rather than beside the Plaid wrapper so it can be unit
 * tested: the test runner strips types but cannot resolve extensionless
 * runtime imports, so a tested module must have no relative runtime deps.
 */

/**
 * Normalizes user-entered phone numbers for Plaid's E.164-only API.
 *
 * Ten-digit numbers are treated as US/Canada. International numbers must
 * include a leading `+`, which prevents us from guessing the country code.
 */
export function normalizePlaidPhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;

  return null;
}

/** Human-readable display for the North American numbers Mintea commonly uses. */
export function formatPlaidPhoneNumber(phoneNumber: string): string {
  const match = phoneNumber.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return match ? `+1 (${match[1]}) ${match[2]}-${match[3]}` : phoneNumber;
}
