import type { ConnectionStatus } from '../contract/types';

/** How long a feed can go without a good reading before it's treated as stale. */
export const STALE_AFTER_MS = 2000;

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

/**
 * The same rule as `shouldSuppressGuidance`, but for a single axis, given that
 * axis's own last-good timestamp. Spec §8: on a sensor dropout "the affected
 * axis greys out; the other keeps working" — so distance and light each carry
 * their own `lastGoodAt` (see `store.ts`) and each is judged on it alone. An
 * ultrasonic miss on a soft or angled surface must not take a perfectly good
 * brightness reading down with it.
 *
 * The connection check is deliberately still in here rather than being
 * hoisted out: when the whole link is down, every axis is suppressed no
 * matter how recently it last read well. Per-axis staleness only ever makes
 * suppression *more* granular, never weaker.
 */
export function shouldSuppressAxis(
  connectionStatus: ConnectionStatus,
  lastGoodAxisAt: number | null,
  now: number,
  staleAfterMs: number,
): boolean {
  return shouldSuppressGuidance(connectionStatus, isFeedStale(lastGoodAxisAt, now, staleAfterMs));
}
