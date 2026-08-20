import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Reading, Setup, Target } from '../contract/types';
import { targetFromSetup } from '../contract/types';

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
  activeSetupId,
  activeTarget,
  guidanceView,
  liveDistanceReading,
  liveLightReading,
  reading,
  removeSetup,
  lastGoodAt,
  lastGoodLightAt,
  screen,
  stableDistanceReading,
  stableFiltered,
  stableLightReading,
  stableReading,
  startGuiding,
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

/** A distance-only target, unless a caller says otherwise. */
function makeTarget(overrides: Partial<Target> = {}): Target {
  return {
    distance_cm: 50,
    distance_tol_cm: 5,
    brightness_above_ambient: null,
    brightness_tol: 0.08,
    ...overrides,
  };
}

describe('store', () => {
  beforeEach(() => {
    // The store is module state, so a test that leaves a device connected or a
    // target active would hand it to the next one.
    disconnect();
    setups.value = [];
    allSetups.value = [];
    reading.value = null;
    lastGoodAt.value = null;
    lastGoodLightAt.value = null;
    activeTarget.value = null;
    activeSetupId.value = null;
    screen.value = 'library';

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

  /**
   * The per-axis accessors: the single decision about whether a frame is safe
   * to show, made once and used by three screens.
   *
   * These replaced a `liveReading()` that gated every channel on the
   * *distance* timestamp, which meant an ultrasonic miss — an expected,
   * documented failure against a soft backdrop — blanked the ambient readout
   * on CaptureLight and disabled the only route to a light reference. The
   * property to hold onto is stated twice over here: a live axis reports, a
   * stale axis reports nothing, and neither accessor hands back a channel it
   * does not vouch for.
   */
  describe('per-axis live accessors', () => {
    /** Connects, emits one frame at t=0, and leaves the clock at `now`. */
    function feed(frame: Reading, now: number): InMemoryDeviceClient {
      vi.setSystemTime(0);
      const client = new InMemoryDeviceClient();
      connect(client);
      client.emit(frame);
      vi.setSystemTime(now);
      return client;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      disconnect();
      vi.useRealTimers();
    });

    it('reports each axis while that axis is fresh', () => {
      feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 100);

      expect(liveDistanceReading()?.distance_cm).toBe(42);
      expect(liveLightReading()?.brightness).toBe(0.4);
      expect(liveLightReading()?.ambient).toBe(0.05);
    });

    it('hands back only the axis it was asked for', () => {
      // A caller cannot reach the wrong field by accident: the channels this
      // accessor did not vouch for are not there to be read.
      feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 100);

      const distance = liveDistanceReading()!;
      expect(distance.brightness).toBeNull();
      expect(distance.ambient).toBeNull();

      expect(liveLightReading()!.distance_cm).toBeNull();
    });

    it('keeps the light axis alive through a stale distance axis', () => {
      // The CaptureLight failure exactly: light off, phone propped, and the
      // ultrasonic misses against a soft backdrop for more than STALE_AFTER_MS.
      // The photodiode is working perfectly and must go on saying so.
      const client = feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 3000);
      client.emit({ distance_cm: null, brightness: 0.41, ambient: 0.05, seq: 30, ts: 3000 });

      expect(liveDistanceReading()).toBeNull();
      expect(liveLightReading()?.ambient).toBe(0.05);
      expect(liveLightReading()?.brightness).toBe(0.41);
    });

    it('keeps the distance axis alive through a stale light axis', () => {
      const client = feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 3000);
      client.emit({ distance_cm: 41, brightness: null, ambient: null, seq: 30, ts: 3000 });

      expect(liveLightReading()).toBeNull();
      expect(liveDistanceReading()?.distance_cm).toBe(41);
    });

    it('withholds both axes once the whole feed has gone stale', () => {
      feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 2001);

      expect(liveDistanceReading()).toBeNull();
      expect(liveLightReading()).toBeNull();
    });

    it('withholds both axes when the device is gone, however fresh the stamps', () => {
      feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 0);
      disconnect();

      // `reading` is never cleared — it still holds that frame — so an accessor
      // that only checked staleness would hand back a reading from a device
      // that is no longer there.
      expect(reading.value).not.toBeNull();
      expect(liveDistanceReading()).toBeNull();
      expect(liveLightReading()).toBeNull();
    });

    it('withholds both axes before any frame has ever arrived', () => {
      vi.setSystemTime(0);
      connect(new InMemoryDeviceClient());

      expect(liveDistanceReading()).toBeNull();
      expect(liveLightReading()).toBeNull();
    });

    it('reads the stabilised feed through the stable accessors', () => {
      // Same gate, different source. The strip in the app bar renders these so
      // it cannot disagree with the guidance screen.
      feed({ distance_cm: 42, brightness: 0.4, ambient: 0.05, seq: 1, ts: 0 }, 100);

      expect(stableDistanceReading()?.distance_cm).toBe(stableReading.value?.distance_cm);
      expect(stableLightReading()?.brightness).toBe(stableReading.value?.brightness);
      expect(stableLightReading()!.distance_cm).toBeNull();
    });
  });

  describe('arrival is gated on a filled smoothing window', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    });

    afterEach(() => {
      disconnect();
      vi.useRealTimers();
    });

    it('does not call the stand settled on the first frame after a reset', async () => {
      const client = new InMemoryDeviceClient([]);
      connect(client);
      await vi.advanceTimersByTimeAsync(0);

      const target = makeTarget();
      await startGuiding(target);

      // One frame, dead on target — but the window holds a single sample, so
      // the median has rejected nothing. A wild ping that happens to land in
      // tolerance must not buzz "arrived".
      client.emit({ distance_cm: 50, brightness: null, ambient: null, seq: 1, ts: 0 });
      expect(stableFiltered.value).toBe(false);
      expect(guidanceView(target).verdict.distance_state).toBe('in_band');
      expect(guidanceView(target).settled).toBe(false);

      vi.setSystemTime(100);
      client.emit({ distance_cm: 50, brightness: null, ambient: null, seq: 2, ts: 100 });
      expect(guidanceView(target).settled).toBe(false);

      // Third sample: now a strict majority of the window agrees, so the
      // median really is outlier-rejecting and the arrival is real.
      vi.setSystemTime(200);
      client.emit({ distance_cm: 50, brightness: null, ambient: null, seq: 3, ts: 200 });
      expect(stableFiltered.value).toBe(true);
      expect(guidanceView(target).settled).toBe(true);
    });

    it('rejects a single wild ping instead of publishing it as an arrival', async () => {
      const client = new InMemoryDeviceClient([]);
      connect(client);
      await vi.advanceTimersByTimeAsync(0);

      const target = makeTarget();
      await startGuiding(target);

      // Two honest frames well outside tolerance, then one wild ping that
      // lands dead on target. Median-of-3 outvotes it.
      client.emit({ distance_cm: 90, brightness: null, ambient: null, seq: 1, ts: 0 });
      vi.setSystemTime(100);
      client.emit({ distance_cm: 91, brightness: null, ambient: null, seq: 2, ts: 100 });
      vi.setSystemTime(200);
      client.emit({ distance_cm: 50, brightness: null, ambient: null, seq: 3, ts: 200 });

      expect(guidanceView(target).settled).toBe(false);
    });
  });

  /**
   * Editing or deleting the setup you are guiding to. The failure this closes:
   * guiding "Portrait key" at 50 cm, the photographer edits it to 60 and
   * saves; the header goes on saying 50, the device goes on guiding to 50, and
   * they walk the stand to where the app says on-target — 10 cm wrong.
   */
  describe('the active target follows the setup it came from', () => {
    async function guidingSetup(): Promise<{ client: InMemoryDeviceClient; setup: Setup }> {
      const setup = { ...makeSetup('portrait'), distance_cm: 50 };
      const client = new InMemoryDeviceClient([setup]);
      connect(client);
      await flush();
      await startGuiding(targetFromSetup(setup), setup.id);
      return { client, setup };
    }

    it('re-issues guidance when the guided setup is edited, and puts the device in step', async () => {
      const { client, setup } = await guidingSetup();
      expect(activeTarget.value?.distance_cm).toBe(50);

      await persistSetup({ ...setup, distance_cm: 60, updated_at: new Date().toISOString() });

      expect(activeTarget.value?.distance_cm).toBe(60);
      // Not just the app: the board has to be guiding to 60 too, or the header
      // is describing something that is not happening.
      expect((await client.getActiveTarget())?.distance_cm).toBe(60);
      expect(activeSetupId.value).toBe('portrait');
    });

    it('carries an edited tolerance through as well as an edited distance', async () => {
      const { setup } = await guidingSetup();

      await persistSetup({
        ...setup,
        distance_tol_cm: 2,
        updated_at: new Date().toISOString(),
      });

      expect(activeTarget.value?.distance_tol_cm).toBe(2);
    });

    it('leaves the active target alone when some other setup is edited', async () => {
      const other = { ...makeSetup('other'), distance_cm: 80 };
      const setup = { ...makeSetup('portrait'), distance_cm: 50 };
      const client = new InMemoryDeviceClient([setup, other]);
      connect(client);
      await flush();
      await startGuiding(targetFromSetup(setup), setup.id);

      await persistSetup({ ...other, distance_cm: 95, updated_at: new Date().toISOString() });

      expect(activeTarget.value?.distance_cm).toBe(50);
      expect((await client.getActiveTarget())?.distance_cm).toBe(50);
    });

    it('stops guidance when the guided setup is deleted, and clears the device', async () => {
      const { client } = await guidingSetup();

      await removeSetup('portrait');

      // No dangling reference: the store believes it is not guiding, which is
      // what the app bar chip and the live screen both read.
      expect(activeTarget.value).toBeNull();
      expect(activeSetupId.value).toBeNull();
      expect(await client.getActiveTarget()).toBeNull();
    });

    it('leaves the live screen when the setup being guided to is deleted', async () => {
      await guidingSetup();
      expect(screen.value).toBe('live');

      await removeSetup('portrait');

      // The live screen has nothing left to render, so staying on it would be
      // a blank dead end.
      expect(screen.value).toBe('library');
    });

    it('stops guidance when an import deletes the guided setup', async () => {
      const { setup } = await guidingSetup();

      // Exactly what confirming an import carrying a newer tombstone does.
      await persistSetups([{ ...setup, deleted: true, updated_at: new Date().toISOString() }]);

      expect(activeTarget.value).toBeNull();
      expect(activeSetupId.value).toBeNull();
    });

    it('retargets when an import overwrites the guided setup with a newer copy', async () => {
      const { setup } = await guidingSetup();

      await persistSetups([
        { ...setup, distance_cm: 75, updated_at: new Date().toISOString() },
      ]);

      expect(activeTarget.value?.distance_cm).toBe(75);
    });

    it('shows nothing rather than an unconfirmed target when the device refuses the new one', async () => {
      const { client, setup } = await guidingSetup();
      client.setActiveTarget = async () => {
        throw new Error('device unreachable');
      };

      // The save itself lands — only putting the device in step fails.
      await persistSetup({ ...setup, distance_cm: 60, updated_at: new Date().toISOString() });

      // The device is still guiding to 50 and the app cannot confirm 60, so it
      // claims neither. A visible gap beats a wrong "you're on target".
      expect(activeTarget.value).toBeNull();
      expect(activeSetupId.value).toBeNull();
    });

    it('leaves a quick guide untouched — it has no setup to follow', async () => {
      const client = new InMemoryDeviceClient([]);
      connect(client);
      await flush();
      // No setupId: this is a quick guide.
      await startGuiding(makeTarget({ distance_cm: 120 }));

      await persistSetup(makeSetup('unrelated'));

      expect(activeTarget.value?.distance_cm).toBe(120);
      expect(activeSetupId.value).toBeNull();
    });
  });

  /**
   * Reconciling with the device on connect. The device owns the active target
   * and keeps guiding across a reload — so an app that assumed "fresh page,
   * nothing active" left the board guiding to a target with no chip, and no
   * route to the only control that stops it.
   */
  describe('adopting the active target the device already holds', () => {
    it('adopts the target the device is already guiding to and names it', async () => {
      const setup = { ...makeSetup('portrait'), distance_cm: 50 };
      const client = new InMemoryDeviceClient([setup]);
      await client.setActiveTarget(targetFromSetup(setup));

      connect(client);
      await flush();

      expect(activeTarget.value?.distance_cm).toBe(50);
      // Named, so the chip reads "Guiding: Setup portrait" rather than just
      // "Guiding" — the list is where the names are, which is why this waits
      // for the setups to land.
      expect(activeSetupId.value).toBe('portrait');
    });

    it('adopts an unnamed target as a quick guide', async () => {
      const client = new InMemoryDeviceClient([makeSetup('portrait')]);
      // Matches no saved setup.
      await client.setActiveTarget(makeTarget({ distance_cm: 123 }));

      connect(client);
      await flush();

      expect(activeTarget.value?.distance_cm).toBe(123);
      expect(activeSetupId.value).toBeNull();
    });

    it('adopts nothing when the device is guiding to nothing', async () => {
      connect(new InMemoryDeviceClient([makeSetup('portrait')]));
      await flush();

      expect(activeTarget.value).toBeNull();
    });

    it('never overwrites a target the user set while the round trip was in flight', async () => {
      const client = new InMemoryDeviceClient([]);
      await client.setActiveTarget(makeTarget({ distance_cm: 50 }));
      // Hold the setups read open so the restore cannot run yet.
      let release!: (list: Setup[]) => void;
      client.listSetupsIncludingDeleted = () =>
        new Promise<Setup[]>((resolve) => {
          release = resolve;
        });

      connect(client);
      // The user taps Guide before the device has answered. That is newer
      // information than the answer to a question asked before they did.
      await startGuiding(makeTarget({ distance_cm: 99 }));

      release([]);
      await flush();

      expect(activeTarget.value?.distance_cm).toBe(99);
    });

    it('does not mark a working connection broken when the target read fails', async () => {
      const client = new InMemoryDeviceClient([]);
      client.getActiveTarget = async () => {
        throw new Error('malformed target');
      };

      connect(client);
      await flush();

      expect(status.value).toBe('connected');
      expect(activeTarget.value).toBeNull();
    });

    it('does not navigate — reloading the page must not throw you onto the live screen', async () => {
      const client = new InMemoryDeviceClient([]);
      await client.setActiveTarget(makeTarget());

      connect(client);
      await flush();

      expect(activeTarget.value).not.toBeNull();
      expect(screen.value).toBe('library');
    });
  });

  it('replaces rather than pushes when retargeting from the live screen', async () => {
    const client = new InMemoryDeviceClient([]);
    connect(client);
    await flush();

    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    try {
      // Arriving at the live screen is a screen change: it earns an entry.
      await startGuiding(makeTarget({ distance_cm: 50 }));
      expect(push).toHaveBeenCalledTimes(1);

      // Retargeting is not. Four preset taps mid-shoot used to mean four Back
      // presses that each appeared to do nothing.
      await startGuiding(makeTarget({ distance_cm: 80 }));
      await startGuiding(makeTarget({ distance_cm: 30 }));

      expect(push).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledTimes(2);
    } finally {
      push.mockRestore();
      replace.mockRestore();
    }
  });
});
