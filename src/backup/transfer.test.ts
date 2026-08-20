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

  it('rejects a setup entry missing required fields, leaving existing setups untouched', () => {
    const existing = newSetup({ name: 'Legit', distance_cm: 50, distance_source: 'typed' });
    const malformed = JSON.stringify({
      version: 1,
      exported_at: 'x',
      setups: [{ id: existing.id, updated_at: '2099-01-01T00:00:00.000Z' }],
    });
    expect(() => importSetups(malformed, [existing])).toThrow(/entry 0/i);
    const result = importSetups(JSON.stringify({ version: 1, exported_at: 'x', setups: [] }), [existing]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(existing);
  });

  it('throws a readable error instead of crashing on a null setup entry', () => {
    const json = JSON.stringify({ version: 1, exported_at: 'x', setups: [null] });
    expect(() => importSetups(json, [])).toThrow(Error);
    expect(() => importSetups(json, [])).not.toThrow(TypeError);
    expect(() => importSetups(json, [])).toThrow(/entry 0/i);
  });

  it('throws a readable error when a setup entry is not an object', () => {
    const json = JSON.stringify({ version: 1, exported_at: 'x', setups: ['nope', 42] });
    expect(() => importSetups(json, [])).toThrow(/entry 0/i);
  });

  it('rejects a file written by a different version, distinctly from an unrecognised file', () => {
    const json = JSON.stringify({ version: 2, exported_at: 'x', setups: [] });
    expect(() => importSetups(json, [])).toThrow(/different version of LightGuide/i);
    expect(() => importSetups(json, [])).not.toThrow(/not a LightGuide export/i);
  });

  it('lets a newer tombstone win over an older live copy', () => {
    const base = newSetup({ name: 'Live', distance_cm: 50, distance_source: 'typed' });
    const tombstone = { ...base, deleted: true, updated_at: '2099-01-01T00:00:00.000Z' };
    const merged = importSetups(exportSetups([tombstone]), [base]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.deleted).toBe(true);
  });

  it('carries a deletion across an export/import round trip instead of resurrecting it', () => {
    // The reported failure, end to end: export Monday, delete on Tuesday,
    // re-import Monday's file on Wednesday.
    const keep = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
    const doomed = newSetup({ name: 'Fill', distance_cm: 90, distance_source: 'typed' });
    const mondayFile = exportSetups([keep, doomed]);

    const tombstone = { ...doomed, deleted: true, updated_at: '2099-01-01T00:00:00.000Z' };
    const recordAfterDelete = [keep, tombstone];

    const merged = importSetups(mondayFile, recordAfterDelete);
    expect(merged.find((s) => s.id === doomed.id)!.deleted).toBe(true);
    expect(merged.filter((s) => !s.deleted).map((s) => s.name)).toEqual(['Key']);
  });

  it('exports a tombstone, so a restore onto a fresh device stays deleted', () => {
    const keep = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
    const doomed = newSetup({ name: 'Fill', distance_cm: 90, distance_source: 'typed' });
    const tombstone = { ...doomed, deleted: true, updated_at: '2099-01-01T00:00:00.000Z' };

    const file = exportSetups([keep, tombstone]);
    expect(JSON.parse(file).setups).toHaveLength(2);

    const ontoEmptyDevice = importSetups(file, []);
    expect(ontoEmptyDevice).toHaveLength(2);
    expect(ontoEmptyDevice.filter((s) => !s.deleted).map((s) => s.name)).toEqual(['Key']);
  });

  it('does not let an older tombstone override a newer live copy', () => {
    const base = newSetup({ name: 'Live', distance_cm: 50, distance_source: 'typed' });
    const newerLive = { ...base, name: 'Live', updated_at: '2099-01-01T00:00:00.000Z', deleted: false };
    const olderTombstone = { ...base, deleted: true, updated_at: '2000-01-01T00:00:00.000Z' };
    const merged = importSetups(exportSetups([olderTombstone]), [newerLive]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.deleted).toBe(false);
  });
});
