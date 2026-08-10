type ConnectionStatus = 'good' | 'login_required' | 'pending_expiration' | 'error' | 'revoked';

export type ConnectionHealth = {
  severity: 'ok' | 'warning' | 'critical';
  label: string;
  detail: string;
  action: 'reconnect' | null;
};

const DAY_MS = 86_400_000;
const RECONNECTABLE = new Set<ConnectionStatus>([
  'login_required',
  'pending_expiration',
  'revoked',
  'error',
]);
const ERROR_COPY: Record<string, string> = {
  ITEM_LOGIN_REQUIRED:
    'Your bank needs you to sign in again before it will share new data.',
  PENDING_EXPIRATION:
    'Your bank is about to withdraw access. Reconnect to keep this account updating.',
  ITEM_LOCKED:
    'Your bank has locked the account. Unlock it with the bank, then reconnect.',
  INVALID_CREDENTIALS:
    'The saved sign-in details no longer work. Reconnect to enter them again.',
  INVALID_MFA:
    'The two-factor response was not accepted. Reconnect to try again.',
  USER_PERMISSION_REVOKED:
    'Access was revoked at the bank. Reconnect to restore it.',
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function assessConnection(
  item: {
    status: ConnectionStatus;
    error_code: string | null;
    error_message: string | null;
    last_synced_at: string | null;
    consent_expires_at: string | null;
  },
  now: Date,
): ConnectionHealth {
  const action = RECONNECTABLE.has(item.status) ? 'reconnect' : null;

  if (item.status !== 'good') {
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
      detail:
        (item.error_code ? ERROR_COPY[item.error_code] : undefined) ??
        item.error_message ??
        'This connection stopped working. Reconnect to restore it.',
      action,
    };
  }

  if (item.consent_expires_at) {
    const days = daysBetween(now, new Date(item.consent_expires_at));
    if (days <= 0) {
      return {
        severity: 'critical',
        label: 'Access expired',
        detail: 'Your bank has withdrawn access. Reconnect to start updating again.',
        action: 'reconnect',
      };
    }
    if (days <= 14) {
      return {
        severity: 'warning',
        label: 'Expiring soon',
        detail: `Your bank withdraws access in ${days} day${days === 1 ? '' : 's'}. Reconnect to avoid a gap.`,
        action: 'reconnect',
      };
    }
  }

  if (!item.last_synced_at) {
    return {
      severity: 'ok',
      label: 'Not synced yet',
      detail: 'Waiting for the first sync from your bank.',
      action: null,
    };
  }

  const age = daysBetween(new Date(item.last_synced_at), now);
  if (age >= 5) {
    return {
      severity: 'warning',
      label: 'Out of date',
      detail: `No new data for ${age} days. Balances and totals may be behind.`,
      action: null,
    };
  }

  return {
    severity: 'ok',
    label: 'Connected',
    detail: age <= 0 ? 'Synced today.' : `Synced ${age} day${age === 1 ? '' : 's'} ago.`,
    action: null,
  };
}

