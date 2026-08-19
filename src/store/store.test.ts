import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Reading, Setup } from '../contract/types';

vi.mock('../cache/idb', () => ({
  cacheSetups: vi.fn(async () => {}),
  readCachedSetups: vi.fn(async () => []),
}));

import { readCachedSetups, cacheSetups } from '../cache/idb';
import { InMemoryDeviceClient } from '../device/in-memory-client';
import { setups, reading, lastGoodAt, connect, persistSetup } from './store';

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
});
