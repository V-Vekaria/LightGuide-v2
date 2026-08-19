import type { ConnectionStatus } from '../contract/types';

/**
 * True when the feed is stale and must not be rendered as live: either no
 * good reading has ever landed (`lastGoodAt` is null), or more than
 * `staleAfterMs` has elapsed since the last one. Pure and clock-free — `now`
 * is always supplied by the caller, never read internally, so this is
 * trivially testable without faking `Date.now()`.
 *
 * Boundary: exactly `staleAfterMs` elapsed is NOT stale; anything greater is.
 */
export function isFeedStale(lastGoodAt: number | null, now: number, staleAfterMs: number): boolean {
  if (lastGoodAt === null) return true;
  return now - lastGoodAt > staleAfterMs;
}

/**
 * True when live guidance must be suppressed (rendered as unknown/dimmed
 * rather than as a real verdict): the connection isn't `'connected'`, or the
 * feed is stale. Either condition alone is sufficient — a technically-open
 * connection with a stale feed is exactly the silent-Wi-Fi-stall case this
 * exists to catch.
 */
export function shouldSuppressGuidance(connectionStatus: ConnectionStatus, feedStale: boolean): boolean {
  return connectionStatus !== 'connected' || feedStale;
}
