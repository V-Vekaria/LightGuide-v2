import { describe, it, expect } from 'vitest';
import { exportSetups, importSetups } from './transfer';
import { newSetup } from '../contract/types';

describe('export / import', () => {
  it('round-trips setups through JSON', () => {
    const list = [newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' })];
    const restored = importSetups(exportSetups(list), []);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.name).toBe('Key');
  });

  it('writes a versioned envelope', () => {
    const parsed = JSON.parse(exportSetups([]));
    expect(parsed.version).toBe(1);
    expect(parsed.exported_at).toBeTruthy();
    expect(Array.isArray(parsed.setups)).toBe(true);
  });

  it('keeps the newer copy when a setup exists on both sides', () => {
    const base = newSetup({ name: 'Old', distance_cm: 50, distance_source: 'typed' });
    const newer = { ...base, name: 'New', updated_at: '2099-01-01T00:00:00.000Z' };
    const merged = importSetups(exportSetups([newer]), [base]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe('New');
  });

  it('keeps the existing copy when the imported one is older', () => {
    const base = newSetup({ name: 'Current', distance_cm: 50, distance_source: 'typed' });
    const older = { ...base, name: 'Stale', updated_at: '2000-01-01T00:00:00.000Z' };
    const merged = importSetups(exportSetups([older]), [base]);
    expect(merged[0]!.name).toBe('Current');
  });

  it('adds setups that are not present locally', () => {
    const mine = newSetup({ name: 'Mine', distance_cm: 50, distance_source: 'typed' });
    const theirs = newSetup({ name: 'Theirs', distance_cm: 90, distance_source: 'typed' });
    const merged = importSetups(exportSetups([theirs]), [mine]);
    expect(merged).toHaveLength(2);
  });

  it('rejects a file that is not a LightGuide export', () => {
    expect(() => importSetups('{"hello":"world"}', [])).toThrow(/not a LightGuide export/i);
  });

  it('rejects malformed JSON with a readable message', () => {
    expect(() => importSetups('not json', [])).toThrow(/could not be read/i);
  });
});
