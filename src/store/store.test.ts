import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Reading, Setup } from '../contract/types';

vi.mock('../cache/idb', () => ({
  cacheSetups: vi.fn(async () => {}),
  readCachedSetups: vi.fn(async () => []),
}));

import { readCachedSetups, cacheSetups } from '../cache/idb';
import { InMemoryDeviceClient } from '../device/in-memory-client';
import {
  setups,
  reading,
  lastGoodAt,
  tick,
  connect,
  disconnect,
  persistSetup,
  persistSetups,
  PartialPersistError,
} from './store';

/** Flushes microtasks (promise chains) so async signal updates have landed. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function makeSetup(id: string): Setup {
  const now = new Date().toISOString();
  return {
    id,
    name: `Setup ${id}`,
    distance_cm: 30,
    distance_source: 'typed',
    distance_tol_cm: 5,
    brightness_above_ambient: null,
    brightness_tol: 0.08,
    brightness_captured_at: null,
    created_at: now,
    updated_at: now,
    deleted: false,
  };
}

describe('store', () => {
  beforeEach(() => {
    setups.value = [];
    reading.value = null;
    lastGoodAt.value = null;

    vi.mocked(readCachedSetups).mockReset();
    vi.mocked(readCachedSetups).mockResolvedValue([]);
    vi.mocked(cacheSetups).mockReset();
    vi.mocked(cacheSetups).mockResolvedValue(undefined);
  });

  it('stamps lastGoodAt only on a usable distance', () => {
    const client = new InMemoryDeviceClient();
    connect(client);

    const dropout: Reading = { distance_cm: null, brightness: 0.2, ambient: 0.05, seq: 1, ts: 100 };
    client.emit(dropout);
    expect(lastGoodAt.value).toBeNull();

    const usable: Reading = { distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 2, ts: 200 };
    client.emit(usable);
    expect(lastGoodAt.value).not.toBeNull();
  });

  it('does not let a slow cache read overwrite an authoritative empty device response', async () => {
    let resolveCache!: (list: Setup[]) => void;
    vi.mocked(readCachedSetups).mockReturnValue(
      new Promise<Setup[]>((resolve) => {
        resolveCache = resolve;
      }),
    );

    // Device is seeded empty and answers immediately: an authoritative "zero setups".
    const client = new InMemoryDeviceClient([]);
    connect(client);

    await flush();
    expect(setups.value).toEqual([]);

    // The cache resolves late with a stale, non-empty list.
    resolveCache([makeSetup('stale-1')]);
    await flush();

    // The device's authoritative empty answer must not be overwritten.
    expect(setups.value).toEqual([]);
  });

  it('still populates from the cache when the device has not answered yet', async () => {
    const cached = [makeSetup('cached-1')];
    vi.mocked(readCachedSetups).mockResolvedValue(cached);

    let resolveDevice!: (list: Setup[]) => void;
    const client = new InMemoryDeviceClient([]);
    client.listSetups = () =>
      new Promise<Setup[]>((resolve) => {
        resolveDevice = resolve;
      });

    connect(client);
    await flush();

    // Cache landed while the device is still pending: it should be visible.
    expect(setups.value).toEqual(cached);

    // Let the slow device settle so nothing is left dangling.
    resolveDevice([]);
    await flush();
  });

  it('propagates a device failure from persistSetup without updating state optimistically', async () => {
    const client = new InMemoryDeviceClient([]);
    connect(client);
    await flush();
    expect(setups.value).toEqual([]);

    const failure = new Error('device rejected save');
    client.saveSetup = async () => {
      throw failure;
    };

    const setup = makeSetup('new-1');
    await expect(persistSetup(setup)).rejects.toThrow('device rejected save');
    expect(setups.value).toEqual([]);
  });

  it('persists a batch of setups in one call and refreshes once', async () => {
    const client = new InMemoryDeviceClient([]);
    connect(client);
    await flush();
    expect(setups.value).toEqual([]);

    const batch = [makeSetup('a'), makeSetup('b'), makeSetup('c')];
    const count = await persistSetups(batch);

    expect(count).toBe(3);
    expect(setups.value.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('reports a partial write count and reflects only what landed when persistSetups fails midway', async () => {
    const client = new InMemoryDeviceClient([]);
    connect(client);
    await flush();
    expect(setups.value).toEqual([]);

    let calls = 0;
    const originalSave = client.saveSetup.bind(client);
    client.saveSetup = async (setup) => {
      calls += 1;
      if (calls === 2) throw new Error('device rejected save');
      return originalSave(setup);
    };

    const batch = [makeSetup('first'), makeSetup('second'), makeSetup('third')];

    let caught: unknown;
    try {
      await persistSetups(batch);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PartialPersistError);
    expect((caught as PartialPersistError).written).toBe(1);
    expect(setups.value.map((s) => s.id)).toEqual(['first']);
  });

  it('starts a heartbeat on connect() and stops it on disconnect()', async () => {
    vi.useFakeTimers();
    try {
      const client = new InMemoryDeviceClient([]);
      connect(client);

      const afterConnect = tick.value;
      await vi.advanceTimersByTimeAsync(1500);
      expect(tick.value).toBeGreaterThan(afterConnect);

      disconnect();
      const afterDisconnect = tick.value;
      await vi.advanceTimersByTimeAsync(1500);
      // The interval must actually be cleared, not merely stop mattering —
      // otherwise it leaks across connects and keeps firing forever.
      expect(tick.value).toBe(afterDisconnect);
    } finally {
      vi.useRealTimers();
    }
  });
});
