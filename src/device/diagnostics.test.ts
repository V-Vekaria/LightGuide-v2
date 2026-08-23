import { describe, it, expect } from 'vitest';
import { shouldSuppressAxis, STALE_AFTER_MS } from '../guidance/liveness';
import { axisHealth, formatAge, formatBytes, formatUptime, frameRate } from './diagnostics';

describe('frameRate', () => {
  /** `count` frames ending at `end`, one every `intervalMs`. */
  function feed(count: number, intervalMs: number, end: number): number[] {
    return Array.from({ length: count }, (_, i) => end - (count - 1 - i) * intervalMs);
  }

  it('reports 10 Hz for frames 100 ms apart', () => {
    const now = 10_000;
    expect(frameRate(feed(30, 100, now), now, 3000)).toBeCloseTo(10, 5);
  });

  it('reports 5 Hz for frames 200 ms apart', () => {
    const now = 10_000;
    expect(frameRate(feed(15, 200, now), now, 3000)).toBeCloseTo(5, 5);
  });

  it('is null, not zero, when too few frames have arrived to measure', () => {
    // 0 Hz is a measurement; this is the absence of one. Same reason a sensor
    // dropout is null rather than 0 — a number nobody measured is a lie.
    const now = 10_000;
    expect(frameRate([], now, 3000)).toBeNull();
    expect(frameRate([now], now, 3000)).toBeNull();
  });

  it('reports the real rate from the first moments of a feed', () => {
    // The bug this rules out: dividing by the window rather than by the span
    // between the frames actually in it. Three frames 100 ms apart is 10 Hz
    // even though they only cover 200 ms of a 3000 ms window; count/window
    // would call that 1 Hz and make a healthy device look broken for the
    // first three seconds of every session.
    const now = 10_000;
    expect(frameRate([now - 200, now - 100, now], now, 3000)).toBeCloseTo(10, 5);
  });

  it('ignores frames older than the window', () => {
    const now = 10_000;
    const stale = [0, 100, 200];
    const recent = [now - 200, now - 100, now];
    expect(frameRate([...stale, ...recent], now, 3000)).toBeCloseTo(10, 5);
  });

  it('is null once every frame has aged out of the window', () => {
    // A feed that stopped four seconds ago has no current rate at all, and
    // must not go on reporting the last one it had like a stopped clock.
    const now = 10_000;
    expect(frameRate([now - 5000, now - 4900, now - 4800], now, 3000)).toBeNull();
  });

  it('is null rather than infinite when every frame shares a timestamp', () => {
    const now = 10_000;
    expect(frameRate([now, now, now], now, 3000)).toBeNull();
  });

  it('ignores a frame timestamped in the future', () => {
    const now = 10_000;
    expect(frameRate([now + 500], now, 3000)).toBeNull();
  });
});

describe('axisHealth', () => {
  const now = 100_000;

  it('is offline whenever the link is not connected, however fresh the axis', () => {
    expect(axisHealth('disconnected', now, now, STALE_AFTER_MS)).toBe('offline');
    expect(axisHealth('connecting', now, now, STALE_AFTER_MS)).toBe('offline');
  });

  it('distinguishes "never read" from "read, but not recently"', () => {
    // Different sentences for the user: one is a device that has never
    // produced this measurement, the other is one that has stopped.
    expect(axisHealth('connected', null, now, STALE_AFTER_MS)).toBe('never');
    expect(axisHealth('connected', now - STALE_AFTER_MS - 1, now, STALE_AFTER_MS)).toBe('stale');
  });

  it('is live for a fresh axis, boundary included', () => {
    expect(axisHealth('connected', now, now, STALE_AFTER_MS)).toBe('live');
    // Exactly at the threshold is not stale — same boundary as isFeedStale.
    expect(axisHealth('connected', now - STALE_AFTER_MS, now, STALE_AFTER_MS)).toBe('live');
  });

  it('says "live" for exactly the cases the guide screen would render', () => {
    // The diagnostics must describe the same feed the rest of the app draws.
    // If these two ever disagreed, this screen would be reporting on a
    // different device from the one on the guide screen — or worse, offering
    // a reading the guide screen had deliberately withheld.
    const cases: Array<[Parameters<typeof axisHealth>[0], number | null]> = [
      ['connected', now],
      ['connected', now - STALE_AFTER_MS],
      ['connected', now - STALE_AFTER_MS - 1],
      ['connected', null],
      ['connecting', now],
      ['disconnected', now],
      ['disconnected', null],
    ];
    for (const [status, lastAt] of cases) {
      const health = axisHealth(status, lastAt, now, STALE_AFTER_MS);
      const suppressed = shouldSuppressAxis(status, lastAt, now, STALE_AFTER_MS);
      expect(health === 'live').toBe(!suppressed);
    }
  });
});

describe('formatAge', () => {
  it('keeps millisecond precision below a second', () => {
    // The whole point of watching frame age on a 10 Hz feed is seeing it sit
    // at 40–120 ms. "0.1 s ago" hides exactly the digit being watched.
    expect(formatAge(42)).toBe('42 ms ago');
    expect(formatAge(999)).toBe('999 ms ago');
  });

  it('switches to seconds, then minutes, then hours', () => {
    expect(formatAge(1000)).toBe('1.0 s ago');
    expect(formatAge(4500)).toBe('4.5 s ago');
    expect(formatAge(90_000)).toBe('2 min ago');
    expect(formatAge(7_200_000)).toBe('2 h ago');
  });

  it('treats a backwards clock as "just now" rather than as the future', () => {
    expect(formatAge(-50)).toBe('0 ms ago');
  });

  it('has a dash for nothing to measure', () => {
    expect(formatAge(null)).toBe('—');
    expect(formatAge(Number.NaN)).toBe('—');
  });
});

describe('formatUptime', () => {
  it('passes null through — a device that does not report uptime says nothing', () => {
    expect(formatUptime(null)).toBeNull();
    expect(formatUptime(-1)).toBeNull();
  });

  it('uses the largest two units that say anything', () => {
    expect(formatUptime(45)).toBe('45 s');
    expect(formatUptime(600)).toBe('10 min');
    expect(formatUptime(5400)).toBe('1 h 30 min');
    expect(formatUptime(180_000)).toBe('2 d 2 h');
  });
});

describe('formatBytes', () => {
  it('passes null through', () => {
    expect(formatBytes(null)).toBeNull();
  });

  it('uses decimal units, matching how the flash is sold', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(48_000)).toBe('48 kB');
    expect(formatBytes(9_830_400)).toBe('9.8 MB');
  });
});
