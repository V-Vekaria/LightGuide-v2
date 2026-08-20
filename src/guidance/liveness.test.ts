import { describe, it, expect } from 'vitest';
import { isFeedStale, shouldSuppressAxis, shouldSuppressGuidance } from './liveness';

describe('isFeedStale', () => {
  it('is stale when there has never been a good reading', () => {
    expect(isFeedStale(null, 10_000, 2000)).toBe(true);
  });

  it('is not stale when exactly staleAfterMs has elapsed', () => {
    expect(isFeedStale(1000, 3000, 2000)).toBe(false);
  });

  it('is stale one millisecond beyond staleAfterMs', () => {
    expect(isFeedStale(1000, 3001, 2000)).toBe(true);
  });

  it('is not stale for a fresh timestamp', () => {
    expect(isFeedStale(1000, 1000, 2000)).toBe(false);
    expect(isFeedStale(1000, 1500, 2000)).toBe(false);
  });
});

describe('shouldSuppressGuidance', () => {
  it('suppresses when disconnected, even with a fresh feed', () => {
    expect(shouldSuppressGuidance('disconnected', false)).toBe(true);
  });

  it('suppresses when connecting, even with a fresh feed', () => {
    expect(shouldSuppressGuidance('connecting', false)).toBe(true);
  });

  it('suppresses when connected but the feed is stale', () => {
    expect(shouldSuppressGuidance('connected', true)).toBe(true);
  });

  it('does not suppress only when connected and fresh', () => {
    expect(shouldSuppressGuidance('connected', false)).toBe(false);
  });
});

describe('shouldSuppressAxis', () => {
  const STALE = 2000;

  it('judges each axis on its own last-good timestamp', () => {
    // Distance last read well 3s ago, light 200ms ago: only distance is out.
    const now = 10_000;
    expect(shouldSuppressAxis('connected', 7000, now, STALE)).toBe(true);
    expect(shouldSuppressAxis('connected', 9800, now, STALE)).toBe(false);
  });

  it('suppresses an axis that has never read well', () => {
    expect(shouldSuppressAxis('connected', null, 10_000, STALE)).toBe(true);
  });

  it('suppresses every axis when the connection is down, however fresh', () => {
    // This is the guarantee per-axis staleness must not weaken: a dead link
    // means no guidance at all, no matter what either axis last reported.
    expect(shouldSuppressAxis('disconnected', 10_000, 10_000, STALE)).toBe(true);
    expect(shouldSuppressAxis('connecting', 10_000, 10_000, STALE)).toBe(true);
  });

  it('agrees with shouldSuppressGuidance for a single-axis feed', () => {
    for (const at of [null, 0, 8000, 9999, 10_000]) {
      const now = 10_000;
      expect(shouldSuppressAxis('connected', at, now, STALE)).toBe(
        shouldSuppressGuidance('connected', isFeedStale(at, now, STALE)),
      );
    }
  });
});
