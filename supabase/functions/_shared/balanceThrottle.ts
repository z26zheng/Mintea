/**
 * Real-time Plaid Balance calls are billed per successful request in paid
 * Production. Keep the policy here so the API response, tests, and claim logic
 * all agree on the same server-enforced window.
 */
export const BALANCE_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
export const BALANCE_REFRESH_COOLDOWN_SECONDS =
  BALANCE_REFRESH_COOLDOWN_MS / 1000;
export const CACHED_BALANCE_REALTIME_PROTECTION_MS = 24 * 60 * 60 * 1000;

export type BalanceRefreshWindow = {
  due: boolean;
  nextRefreshAt: string | null;
};

export function balanceRefreshWindow(
  lastRefreshedAt: string | null,
  now: Date = new Date(),
  cooldownMs = BALANCE_REFRESH_COOLDOWN_MS,
): BalanceRefreshWindow {
  if (!lastRefreshedAt) {
    return { due: true, nextRefreshAt: null };
  }

  const lastRefreshedMs = Date.parse(lastRefreshedAt);

  // A malformed legacy value should not permanently block refreshes.
  if (!Number.isFinite(lastRefreshedMs)) {
    return { due: true, nextRefreshAt: null };
  }

  const nextRefreshMs = lastRefreshedMs + cooldownMs;

  return {
    due: now.getTime() >= nextRefreshMs,
    nextRefreshAt: new Date(nextRefreshMs).toISOString(),
  };
}

/**
 * Plaid's cached balance can lag a successful real-time extraction. Do not let
 * a later transaction webhook overwrite that fresher value for 24 hours.
 */
export function cachedBalanceSyncDue(
  lastRealtimeRefreshAt: string | null,
  now: Date = new Date(),
): boolean {
  return balanceRefreshWindow(
    lastRealtimeRefreshAt,
    now,
    CACHED_BALANCE_REALTIME_PROTECTION_MS,
  ).due;
}
