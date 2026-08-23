import { describe, it, expect } from 'vitest';
import type { DeviceClient, Setup } from '../contract/types';
import { newSetup } from '../contract/types';

/**
 * Every DeviceClient implementation must pass this, mock and firmware alike.
 *
 * This suite is implementation-agnostic by design, so it cannot make an
 * arbitrary device emit a reading on demand: InMemoryDeviceClient.emit() is a
 * test-only helper not on the DeviceClient interface, and real firmware
 * streams readings on its own schedule. Delivery semantics (does a reading
 * actually reach a subscriber, does unsubscribing actually stop it) are
 * therefore covered per-implementation, not here.
 *
 * **Clean state is the caller's job.** Several tests assert on an empty
 * device, so `make()` must hand back a client to a device with no setups —
 * a fresh instance, not a shared one that previous tests left behind. `make()`
 * may be async precisely so an implementation can stand up that instance
 * (see conformance.http.test.ts, which starts one mock device per test on its
 * own port). Against a real board that means starting from an empty board;
 * the contract deliberately has no remote wipe (see the report).
 */
export function describeDeviceClient(
  name: string,
  make: () => DeviceClient | Promise<DeviceClient>,
): void {
  /** A setup with a fixed, deliberately old timestamp — LWW assertions need a stable one. */
  function agedSetup(fields: { name: string; updated_at: string }): Setup {
    return {
      ...newSetup({ name: fields.name, distance_cm: 50, distance_source: 'typed' }),
      updated_at: fields.updated_at,
    };
  }

  describe(`DeviceClient conformance: ${name}`, () => {
    /* ---------- identity, version and health ---------- */

    it('says who it is, in fields a person could tell two devices apart by', async () => {
      const client = await make();
      const info = await client.getInfo();

      // Non-empty, because both of these end up on screen. A blank name is a
      // device screen that identifies nothing, which is the one job it has.
      expect(info.device_id.trim()).not.toBe('');
      expect(info.name.trim()).not.toBe('');
      expect(info.firmware.trim()).not.toBe('');
      client.close();
    });

    it('reports the same device id every time — an id that changes identifies nothing', async () => {
      // A board that generated an id per request, or per boot, would make "the
      // same device came back" indistinguishable from "a different device
      // answered". This is the assertion a firmware that seeds from a random
      // number instead of the MAC fails.
      const client = await make();
      const first = await client.getInfo();
      const second = await client.getInfo();
      expect(second.device_id).toBe(first.device_id);
      expect(second.name).toBe(first.name);
      client.close();
    });

    it('reports a protocol version the app can compare numerically', async () => {
      const client = await make();
      const info = await client.getInfo();
      expect(Number.isInteger(info.protocol)).toBe(true);
      expect(info.protocol).toBeGreaterThanOrEqual(1);
      client.close();
    });

    it('keeps the protocol version and the firmware version separate', async () => {
      // The app refuses to guide a device whose protocol it does not support,
      // and displays the firmware without ever parsing it. A device that put a
      // build string in `protocol`, or a contract number in `firmware`, breaks
      // that in a way nothing else here would catch.
      const client = await make();
      const info = await client.getInfo();
      expect(typeof info.protocol).toBe('number');
      expect(typeof info.firmware).toBe('string');
      client.close();
    });

    it('reports a health state for both sensors', async () => {
      // Without this, "the ultrasonic has stopped answering" and "the stand is
      // simply out of range" are the same dash on screen, and they need
      // opposite things from the person holding the stand.
      const client = await make();
      const info = await client.getInfo();
      for (const axis of ['distance', 'light'] as const) {
        expect(['ok', 'fault', 'unknown']).toContain(info.sensors[axis].state);
      }
      client.close();
    });

    it('answers getInfo on a device with nothing saved and nothing guiding', async () => {
      // It is the app's fallback for "the device is there, and here is what is
      // wrong with it", so it must not depend on any other part of the device
      // being in a working or populated state.
      const client = await make();
      const info = await client.getInfo();
      expect(info.protocol).toBeGreaterThanOrEqual(1);
      expect(await client.listSetups()).toEqual([]);
      client.close();
    });

    it('reports uptime and free storage as numbers or null, never as a guess', async () => {
      const client = await make();
      const info = await client.getInfo();
      for (const value of [info.uptime_s, info.free_storage_bytes]) {
        expect(value === null || (typeof value === 'number' && Number.isFinite(value))).toBe(true);
      }
      if (info.uptime_s !== null) expect(info.uptime_s).toBeGreaterThanOrEqual(0);
      if (info.free_storage_bytes !== null) expect(info.free_storage_bytes).toBeGreaterThanOrEqual(0);
      client.close();
    });

    /* ---------- the setup library ---------- */

    it('starts with no setups', async () => {
      const client = await make();
      expect(await client.listSetups()).toEqual([]);
      expect(await client.listSetupsIncludingDeleted()).toEqual([]);
      client.close();
    });

    it('round-trips a saved setup', async () => {
      const client = await make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      const saved = await client.saveSetup(setup);
      expect(saved.id).toBe(setup.id);
      const list = await client.listSetups();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Key');
      client.close();
    });

    it('preserves every field of a saved setup, units and nulls included', async () => {
      const client = await make();
      const setup = newSetup({
        name: 'Portrait key',
        distance_cm: 120.4,
        distance_source: 'captured',
        distance_tol_cm: 3,
        brightness_above_ambient: 0.566,
        brightness_tol: 0.05,
      });
      await client.saveSetup(setup);
      const [stored] = await client.listSetups();
      expect(stored).toEqual(setup);

      // A distance-only setup keeps its nulls: null is "no light reference",
      // and a device that turned it into 0 would claim a pitch-black target.
      const dark = newSetup({ name: 'Distance only', distance_cm: 40, distance_source: 'typed' });
      await client.saveSetup(dark);
      const all = await client.listSetups();
      const found = all.find((s) => s.id === dark.id);
      expect(found!.brightness_above_ambient).toBeNull();
      expect(found!.brightness_captured_at).toBeNull();
      client.close();
    });

    it('updates in place rather than duplicating', async () => {
      const client = await make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      await client.saveSetup(setup);
      await client.saveSetup({ ...setup, name: 'Renamed', updated_at: new Date().toISOString() });
      const list = await client.listSetups();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Renamed');
      client.close();
    });

    it('stores updated_at verbatim — the device never re-stamps a save', async () => {
      // Last-write-wins is decided by the writer's updated_at. A device that
      // stamped its own clock on every PUT would make any imported backup
      // look newer than what is already saved, and the merge would always
      // pick the file.
      const client = await make();
      const setup = agedSetup({ name: 'Key', updated_at: '2020-05-04T00:00:00.000Z' });
      const returned = await client.saveSetup(setup);
      expect(returned.updated_at).toBe('2020-05-04T00:00:00.000Z');
      const [stored] = await client.listSetups();
      expect(stored!.updated_at).toBe('2020-05-04T00:00:00.000Z');
      client.close();
    });

    it('hides deleted setups from the list', async () => {
      const client = await make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      await client.saveSetup(setup);
      await client.deleteSetup(setup.id);
      expect(await client.listSetups()).toEqual([]);
      client.close();
    });

    it('keeps a deleted setup as a tombstone, readable for backup', async () => {
      // Without this, an export physically cannot contain a deletion, and
      // re-importing yesterday's file resurrects everything deleted since.
      const client = await make();
      const setup = agedSetup({ name: 'Key', updated_at: '2020-05-04T00:00:00.000Z' });
      await client.saveSetup(setup);
      await client.deleteSetup(setup.id);

      const all = await client.listSetupsIncludingDeleted();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(setup.id);
      expect(all[0]!.deleted).toBe(true);
      // The delete is a write, so it moves updated_at: a tombstone that kept
      // the live copy's timestamp could never win a last-write-wins merge.
      expect(all[0]!.updated_at > '2020-05-04T00:00:00.000Z').toBe(true);
      client.close();
    });

    it('accepts a tombstone write, so an import can carry a deletion forward', async () => {
      const client = await make();
      const setup = agedSetup({ name: 'Key', updated_at: '2020-05-04T00:00:00.000Z' });
      await client.saveSetup(setup);

      // Exactly what importing a file containing a newer tombstone does.
      const tombstone: Setup = { ...setup, deleted: true, updated_at: '2021-01-01T00:00:00.000Z' };
      await client.saveSetup(tombstone);

      expect(await client.listSetups()).toEqual([]);
      const all = await client.listSetupsIncludingDeleted();
      expect(all).toHaveLength(1);
      expect(all[0]!.deleted).toBe(true);
      expect(all[0]!.updated_at).toBe('2021-01-01T00:00:00.000Z');
      client.close();
    });

    it('lets an active setup and a tombstone coexist without leaking the tombstone', async () => {
      const client = await make();
      const live = newSetup({ name: 'Live', distance_cm: 50, distance_source: 'typed' });
      const doomed = newSetup({ name: 'Doomed', distance_cm: 90, distance_source: 'typed' });
      await client.saveSetup(live);
      await client.saveSetup(doomed);
      await client.deleteSetup(doomed.id);

      const visible = await client.listSetups();
      expect(visible.map((s) => s.name)).toEqual(['Live']);
      const all = await client.listSetupsIncludingDeleted();
      expect(all).toHaveLength(2);
      expect(all.filter((s) => s.deleted).map((s) => s.name)).toEqual(['Doomed']);
      client.close();
    });

    it('reports no active target on a device that has just started', async () => {
      const client = await make();
      expect(await client.getActiveTarget()).toBeNull();
      client.close();
    });

    it('sets an active target and reads the same one back', async () => {
      const client = await make();
      const target = {
        distance_cm: 50, distance_tol_cm: 5,
        brightness_above_ambient: 0.4, brightness_tol: 0.08,
      };
      const setResult = await client.setActiveTarget(target);
      expect(setResult).toBeUndefined();
      expect(await client.getActiveTarget()).toEqual(target);
      client.close();
    });

    it('keeps a null brightness target null — a distance-only guide', async () => {
      const client = await make();
      const target = {
        distance_cm: 50, distance_tol_cm: 5,
        brightness_above_ambient: null, brightness_tol: 0.08,
      };
      await client.setActiveTarget(target);
      expect(await client.getActiveTarget()).toEqual(target);
      client.close();
    });

    it('clears the active target explicitly, and the device says so', async () => {
      // setActiveTarget(null) used to be a POST with an empty body that the
      // mock happened to read as "clear". This asserts the effect, not the
      // absence of a throw: a device that no-ops the clear now fails here.
      const client = await make();
      await client.setActiveTarget({
        distance_cm: 50, distance_tol_cm: 5,
        brightness_above_ambient: null, brightness_tol: 0.08,
      });
      expect(await client.getActiveTarget()).not.toBeNull();

      const clearResult = await client.setActiveTarget(null);
      expect(clearResult).toBeUndefined();
      expect(await client.getActiveTarget()).toBeNull();
      client.close();
    });

    it('subscribeLive returns a callable unsubscribe function', async () => {
      const client = await make();
      const off = client.subscribeLive(() => {});
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
      client.close();
    });
  });
}
