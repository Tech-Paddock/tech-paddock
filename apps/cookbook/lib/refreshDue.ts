/**
 * Whether opening the list tab should start a refresh (2026-10-20).
 *
 * **No imports**, because the browser runs it: the list tab asks this once per
 * open and, when it says yes, starts a refresh in the background without
 * waiting on it. No cron, so this is the only thing that makes a refresh
 * happen on its own — and it only happens when the list is opened.
 */

export const REFRESH_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

export type RefreshInputs = {
  configured: boolean;
  connected: boolean;
  /** When the last refresh finished, or null for never. */
  refreshedAt: string | null;
};

export function refreshDue(status: RefreshInputs, now: number = Date.now()): boolean {
  if (!status.configured || !status.connected) return false;
  if (!status.refreshedAt) return true;
  const at = Date.parse(status.refreshedAt);
  // An unreadable date is treated as stale: refreshing once too often is cheap,
  // and a connection left to expire is not.
  return Number.isNaN(at) || now - at > REFRESH_EVERY_MS;
}

/**
 * Whether opening the list tab should start a deal scan (TEC-121). **The same
 * rule as the refresh** — over seven days since the last, or never — and it
 * also needs a chosen store, since prices are per store. `lastScanAt` is the
 * latest appended scan's `ran_at`.
 */
export function scanDue(status: RefreshInputs & { hasStore: boolean }, lastScanAt: string | null, now: number = Date.now()): boolean {
  if (!status.hasStore) return false;
  return refreshDue({ configured: status.configured, connected: status.connected, refreshedAt: lastScanAt }, now);
}
