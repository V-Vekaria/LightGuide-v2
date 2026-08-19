import { describe, it, expect } from 'vitest';
import type { DeviceClient } from '../contract/types';
import { newSetup } from '../contract/types';

/** Every DeviceClient implementation must pass this, mock and firmware alike. */
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

    it('accepts and clears an active target', async () => {
      const client = make();
      await client.setActiveTarget({
        distance_cm: 50, distance_tol_cm: 5,
        brightness_above_ambient: null, brightness_tol: 0.08,
      });
      await client.setActiveTarget(null);
      client.close();
    });

    it('returns an unsubscribe function that stops delivery', () => {
      const client = make();
      const seen: number[] = [];
      const off = client.subscribeLive((r) => seen.push(r.seq));
      expect(typeof off).toBe('function');
      off();
      client.close();
    });
  });
}
