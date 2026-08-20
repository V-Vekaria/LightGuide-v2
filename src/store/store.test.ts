import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Reading, Setup } from '../contract/types';

vi.mock('../cache/idb', () => ({
  cacheSetups: vi.fn(async () => {}),
  readCachedSetups: vi.fn(async () => []),
}));

import { readCachedSetups, cacheSetups } from '../cache/idb';
import { InMemoryDeviceClient } from '../device/in-memory-client';
import { shouldSuppressAxis, STALE_AFTER_MS } from '../guidance/liveness';
import {
  setups,
  allSetups,
  reading,
  removeSetup,
  lastGoodAt,
  lastGoodLightAt,
  stableReading,
  status,
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
    allSetups.value = [];
    reading.value = null;
    lastGoodAt.value = null;
    lastGoodLightAt.value = null;

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
    // refreshSetups reads the full record (tombstones included) and derives
    // the visible list from it, so that is the call to hold open here.
    client.listSetupsIncludingDeleted = () =>
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

  it('keeps a deleted setup out of the visible list but inside the backup record', async () => {
    const doomed = makeSetup('doomed');
    const client = new InMemoryDeviceClient([makeSetup('live'), doomed]);
    connect(client);
    await flush();
    expect(setups.value.map((s) => s.id)).toEqual(['live', 'doomed']);

    await removeSetup('doomed');

    // The screens must not start showing deleted setups...
    expect(setups.value.map((s) => s.id)).toEqual(['live']);
    // ...but export must still be able to say it was deleted, or restoring
    // an older file brings it back.
    expect(allSetups.value.map((s) => s.id).sort()).toEqual(['doomed', 'live']);
    expect(allSetups.value.find((s) => s.id === 'doomed')!.deleted).toBe(true);
  });

  it('caches the full record, tombstones included', async () => {
    const doomed = makeSetup('doomed');
    const client = new InMemoryDeviceClient([doomed]);
    connect(client);
    await flush();
    await removeSetup('doomed');

    // An export taken from a cold start with no device reachable reads this
    // cache. Caching the visible list would drop the deletion.
    const lastCall = vi.mocked(cacheSetups).mock.calls.at(-1);
    expect(lastCall?.[0].map((s) => s.id)).toEqual(['doomed']);
    expect(lastCall?.[0][0]!.deleted).toBe(true);
  });

  it('filters tombstones out of a cache seed before any screen sees them', async () => {
    const tombstone = { ...makeSetup('gone'), deleted: true };
    vi.mocked(readCachedSetups).mockResolvedValue([makeSetup('kept'), tombstone]);

    const client = new InMemoryDeviceClient([]);
    // Hold the device off so the cache is what lands.
    client.listSetupsIncludingDeleted = () => new Promise<Setup[]>(() => {});
    connect(client);
    await flush();

    expect(setups.value.map((s) => s.id)).toEqual(['kept']);
    expect(allSetups.value.map((s) => s.id)).toEqual(['kept', 'gone']);

    disconnect();
  });

  it('stamps the light axis only when both brightness and ambient are usable', () => {
    const client = new InMemoryDeviceClient();
    connect(client);

    // verdict compares brightness - ambient, so half a light reading is no
    // light reading at all.
    client.emit({ distance_cm: 40, brightness: 0.4, ambient: null, seq: 1, ts: 100 });
    expect(lastGoodLightAt.value).toBeNull();
    client.emit({ distance_cm: 40, brightness: null, ambient: 0.05, seq: 2, ts: 200 });
    expect(lastGoodLightAt.value).toBeNull();

    client.emit({ distance_cm: 40, brightness: 0.4, ambient: 0.05, seq: 3, ts: 300 });
    expect(lastGoodLightAt.value).not.toBeNull();

    disconnect();
  });

  it('greys only the distance axis when the ultrasonic drops out', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const client = new InMemoryDeviceClient();
      connect(client);
      client.emit({ distance_cm: 40, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 });

      // Three seconds of soft/angled surface: no distance, but the photodiode
      // is perfectly happy the whole time.
      vi.setSystemTime(3000);
      client.emit({ distance_cm: null, brightness: 0.42, ambient: 0.05, seq: 30, ts: 3000 });

      const now = 3100;
      expect(shouldSuppressAxis('connected', lastGoodAt.value, now, STALE_AFTER_MS)).toBe(true);
      expect(shouldSuppressAxis('connected', lastGoodLightAt.value, now, STALE_AFTER_MS)).toBe(
        false,
      );
      // And the light reading itself survived — it is not nulled out wholesale.
      expect(stableReading.value?.brightness).toBe(0.42);
      expect(stableReading.value?.distance_cm).toBeNull();

      disconnect();
    } finally {
      vi.useRealTimers();
    }
  });

  it('greys only the light axis when the light sensor drops out', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const client = new InMemoryDeviceClient();
      connect(client);
      client.emit({ distance_cm: 40, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 });

      vi.setSystemTime(3000);
      client.emit({ distance_cm: 41, brightness: null, ambient: null, seq: 30, ts: 3000 });

      const now = 3100;
      expect(shouldSuppressAxis('connected', lastGoodAt.value, now, STALE_AFTER_MS)).toBe(false);
      expect(shouldSuppressAxis('connected', lastGoodLightAt.value, now, STALE_AFTER_MS)).toBe(true);
      expect(stableReading.value?.distance_cm).toBe(41);
      expect(stableReading.value?.brightness).toBeNull();

      disconnect();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses both axes when the connection is down, however fresh they were', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const client = new InMemoryDeviceClient();
      connect(client);
      client.emit({ distance_cm: 40, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 });
      expect(lastGoodAt.value).toBe(0);
      expect(lastGoodLightAt.value).toBe(0);

      disconnect();
      expect(status.value).toBe('disconnected');

      // Both stamps are as fresh as they can be, and both axes are still off.
      const now = 0;
      expect(shouldSuppressAxis(status.value, lastGoodAt.value, now, STALE_AFTER_MS)).toBe(true);
      expect(shouldSuppressAxis(status.value, lastGoodLightAt.value, now, STALE_AFTER_MS)).toBe(
        true,
      );
      // Teardown drops the smoothing window too — nothing survives to be
      // re-rendered as live on the next connect.
      expect(stableReading.value).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
