import { describe, it, expect } from 'vitest';
import type { DeviceClient } from '../contract/types';
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
 */
export function describeDeviceClient(name: string, make: () => DeviceClient): void {
  describe(`DeviceClient conformance: ${name}`, () => {
    it('starts with no setups', async () => {
      const client = make();
      expect(await client.listSetups()).toEqual([]);
      client.close();
    });

    it('round-trips a saved setup', async () => {
      const client = make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      const saved = await client.saveSetup(setup);
      expect(saved.id).toBe(setup.id);
      const list = await client.listSetups();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Key');
      client.close();
    });

    it('updates in place rather than duplicating', async () => {
      const client = make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      await client.saveSetup(setup);
      await client.saveSetup({ ...setup, name: 'Renamed', updated_at: new Date().toISOString() });
      const list = await client.listSetups();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Renamed');
      client.close();
    });

    it('hides deleted setups from the list', async () => {
      const client = make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      await client.saveSetup(setup);
      await client.deleteSetup(setup.id);
      expect(await client.listSetups()).toEqual([]);
      client.close();
    });

    it('accepts setActiveTarget calls and resolves to undefined', async () => {
      const client = make();
      const setResult = await client.setActiveTarget({
        distance_cm: 50, distance_tol_cm: 5,
        brightness_above_ambient: null, brightness_tol: 0.08,
      });
      expect(setResult).toBeUndefined();
      const clearResult = await client.setActiveTarget(null);
      expect(clearResult).toBeUndefined();
      client.close();
    });

    it('subscribeLive returns a callable unsubscribe function', () => {
      const client = make();
      const off = client.subscribeLive(() => {});
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
      client.close();
    });
  });
}
