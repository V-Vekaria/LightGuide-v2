import { describe, it, expect } from 'vitest';
import { isFeedStale, shouldSuppressGuidance } from './liveness';

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
