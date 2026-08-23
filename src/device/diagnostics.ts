import type { ConnectionStatus } from '../contract/types';
import { isFeedStale } from '../guidance/liveness';

/**
 * The arithmetic behind the device screen's link diagnostics.
 *
 * All pure and clock-free — `now` is always the caller's — so every number the
 * screen shows about the live link can be tested without a socket or a fake
 * timer.
 *
 * One rule governs the whole file: **these are facts about the link, not
 * readings.** Frame rate, frame age and axis health describe whether a value
 * may be shown; none of them is a way to show a value the rest of the app has
 * withheld. The screen reads sensor numbers through the store's per-axis
 * accessors exactly like every other screen does.
 */

/**
 * Frames per second over the trailing window, or null when there are not
 * enough frames in it to divide by anything.
 *
 * Measured across the span between the first and last frame *inside* the
 * window rather than as `count / windowMs`, which would report a feed that
 * started 200 ms ago at a fifteenth of its real rate and make a healthy device
 * look broken for the first three seconds of every session.
 *
 * Null rather than 0 for "not enough frames", for the same reason a dropout is
 * null: 0 Hz is a measurement, and this is the absence of one. A dead link and
 * a link that has delivered exactly one frame are both honestly "no rate yet".
 */
export function frameRate(times: number[], now: number, windowMs: number): number | null {
  const cutoff = now - windowMs;
  const recent = times.filter((t) => t >= cutoff && t <= now);
  if (recent.length < 2) return null;
  const span = recent[recent.length - 1]! - recent[0]!;
  if (span <= 0) return null;
  return ((recent.length - 1) * 1000) / span;
}

/**
 * What one sensor axis is doing, as four states the screen has words for.
 *
 *  - `offline` — the link is down; nothing can be said about the axis.
 *  - `never` — connected, but this axis has never produced a usable reading.
 *  - `stale` — it has, and not recently enough to trust.
 *  - `live` — good.
 *
 * `live` is exactly the case `shouldSuppressAxis` lets through, which is not a
 * coincidence and is asserted in the tests: if these two ever disagreed, the
 * diagnostics would be describing a different feed from the one on screen.
 */
export type AxisHealth = 'live' | 'stale' | 'never' | 'offline';

export function axisHealth(
  connectionStatus: ConnectionStatus,
  lastGoodAxisAt: number | null,
  now: number,
  staleAfterMs: number,
): AxisHealth {
  if (connectionStatus !== 'connected') return 'offline';
  if (lastGoodAxisAt === null) return 'never';
  return isFeedStale(lastGoodAxisAt, now, staleAfterMs) ? 'stale' : 'live';
}

/**
 * How long ago something happened, at the precision that matters for it.
 *
 * Milliseconds below a second because the whole point of showing frame age on
 * a 10 Hz feed is to see it sitting at 40–120 ms and to notice when it is not;
 * "0.1 s ago" hides exactly the digit being watched.
 */
export function formatAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  // A clock that has stepped backwards is not a reading from the future.
  const age = Math.max(0, ms);
  if (age < 1000) return `${Math.round(age)} ms ago`;
  if (age < 60_000) return `${(age / 1000).toFixed(1)} s ago`;
  if (age < 3_600_000) return `${Math.round(age / 60_000)} min ago`;
  return `${Math.round(age / 3_600_000)} h ago`;
}

/** Seconds since boot, in the largest two units that say anything. Null passes through. */
export function formatUptime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * Free storage in the unit a person would use for it. Decimal MB, not MiB —
 * the number this sits next to on a datasheet is "16 MB flash".
 */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1000) return `${Math.round(bytes)} bytes`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
