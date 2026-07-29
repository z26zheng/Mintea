/**
 * How healthy a bank connection is, and what the user should do about it.
 *
 * A stale balance that looks current is the worst failure this app can have —
 * every total, chart and budget downstream inherits it silently. So staleness
 * is treated as a first-class state rather than something the user infers from
 * a date, and every unhealthy state names an action.
 *
 * Free of relative runtime imports so it stays unit-testable under Node's type
 * stripping; the row type below is type-only and erases away.
 */
import type { PlaidItemRow } from '../types/database';

export type ConnectionSeverity = 'ok' | 'info' | 'warning' | 'critical';

export type ConnectionHealth = {
  severity: ConnectionSeverity;
  /** Short status for a badge. */
  label: string;
  /** One sentence on what is wrong, in the user's terms. */
  detail: string;
  /** Present when the user can fix it by re-authenticating with the bank. */
  action: 'reconnect' | null;
};

/** Past this, a connection that reports success is still not trustworthy. */
export const STALE_AFTER_DAYS = 5;

/** Plaid consent expiry becomes worth warning about this far ahead. */
export const CONSENT_WARNING_DAYS = 14;

const DAY_MS = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Plaid's error codes are precise but not for humans. These cover the states a
 * user can act on; anything else falls back to the message Plaid supplied so a
 * new code is never swallowed silently.
 */
const ERROR_COPY: Record<string, string> = {
  ITEM_LOGIN_REQUIRED:
    'Your bank needs you to sign in again before it will share new data.',
  PENDING_EXPIRATION:
    'Your bank is about to withdraw access. Reconnect to keep this account updating.',
  ITEM_LOCKED:
    'Your bank has locked the account, usually after too many sign-in attempts. Unlock it with the bank, then reconnect.',
  INVALID_CREDENTIALS:
    'The saved sign-in details no longer work. Reconnect to enter them again.',
  INVALID_MFA:
    'The two-factor response was not accepted. Reconnect to try again.',
  INSUFFICIENT_CREDENTIALS:
    'Your bank asked for more information than was provided. Reconnect to finish.',
  USER_PERMISSION_REVOKED:
    'Access was revoked at the bank. Reconnect to restore it.',
  ITEM_NOT_SUPPORTED:
    'Your bank no longer supports this connection. Reconnecting may not help.',
};

/** Which statuses the user can resolve by re-authenticating. */
const RECONNECTABLE = new Set([
  'login_required',
  'pending_expiration',
  'revoked',
  'error',
]);

export function assessConnection(
  item: Pick<
    PlaidItemRow,
    'status' | 'error_code' | 'error_message' | 'last_synced_at' | 'consent_expires_at'
  >,
  now: Date,
): ConnectionHealth {
  const reconnect = RECONNECTABLE.has(item.status) ? ('reconnect' as const) : null;

  if (item.status !== 'good') {
    const copy =
      (item.error_code ? ERROR_COPY[item.error_code] : undefined) ??
      item.error_message ??
      'This connection stopped working. Reconnect to restore it.';

    return {
      severity: item.status === 'pending_expiration' ? 'warning' : 'critical',
      label:
        item.status === 'login_required'
          ? 'Needs sign-in'
          : item.status === 'pending_expiration'
            ? 'Expiring soon'
            : item.status === 'revoked'
              ? 'Revoked'
              : 'Error',
      detail: copy,
      action: reconnect,
    };
  }

  // Consent expiry is checked before staleness: a connection can be syncing
  // perfectly today and still be days from going dark.
  if (item.consent_expires_at) {
    const expires = new Date(item.consent_expires_at);
    const days = daysBetween(now, expires);

    if (days <= 0) {
      return {
        severity: 'critical',
        label: 'Access expired',
        detail:
          'Your bank has withdrawn access. Reconnect to start updating again.',
        action: 'reconnect',
      };
    }

    if (days <= CONSENT_WARNING_DAYS) {
      return {
        severity: 'warning',
        label: 'Expiring soon',
        detail: `Your bank withdraws access in ${days} day${
          days === 1 ? '' : 's'
        }. Reconnect to avoid a gap.`,
        action: 'reconnect',
      };
    }
  }

  if (!item.last_synced_at) {
    return {
      severity: 'info',
      label: 'Not synced yet',
      detail: 'Waiting for the first sync from your bank.',
      action: null,
    };
  }

  const age = daysBetween(new Date(item.last_synced_at), now);
  if (age >= STALE_AFTER_DAYS) {
    return {
      severity: 'warning',
      label: 'Out of date',
      // No reconnect offered: the connection reports healthy, so re-auth is
      // unlikely to be the fix and would send the user through Link for nothing.
      detail: `No new data for ${age} days. Balances and totals may be behind.`,
      action: null,
    };
  }

  return {
    severity: 'ok',
    label: 'Connected',
    detail:
      age <= 0
        ? 'Synced today.'
        : `Synced ${age} day${age === 1 ? '' : 's'} ago.`,
    action: null,
  };
}

const RANK: Record<ConnectionSeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  critical: 3,
};

export type ConnectionSummary = {
  severity: ConnectionSeverity;
  /** How many connections are not fully healthy. */
  needingAttention: number;
  /** Banner copy, or null when everything is fine. */
  message: string | null;
};

/**
 * One line for the whole household, for a banner somewhere the user already
 * looks — finding out that a balance is stale should not require a trip to
 * Settings.
 */
export function summarizeConnections(
  items: Array<
    Pick<
      PlaidItemRow,
      | 'status'
      | 'error_code'
      | 'error_message'
      | 'last_synced_at'
      | 'consent_expires_at'
      | 'institution_name'
    >
  >,
  now: Date,
): ConnectionSummary {
  const unhealthy = items
    .map((item) => ({ item, health: assessConnection(item, now) }))
    .filter(({ health }) => health.severity === 'warning' || health.severity === 'critical')
    .sort((a, b) => RANK[b.health.severity] - RANK[a.health.severity]);

  if (unhealthy.length === 0) {
    return { severity: 'ok', needingAttention: 0, message: null };
  }

  const worst = unhealthy[0]!;
  const name = worst.item.institution_name ?? 'One of your banks';
  const others = unhealthy.length - 1;

  return {
    severity: worst.health.severity,
    needingAttention: unhealthy.length,
    message:
      others === 0
        ? `${name}: ${worst.health.detail}`
        : `${name}: ${worst.health.detail} ${others} other connection${
            others === 1 ? ' also needs' : 's also need'
          } attention.`,
  };
}
