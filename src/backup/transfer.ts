import type { Setup } from '../contract/types';

const VERSION = 1;

interface Envelope {
  version: number;
  exported_at: string;
  setups: Setup[];
}

/**
 * Serialises the full record, tombstones included — `list` must come from
 * `DeviceClient.listSetupsIncludingDeleted()` (via the store's `allSetups`),
 * never from `listSetups()`. A file built from the active list has no way to
 * express a deletion, so re-importing it silently brings back every setup the
 * user has deleted since it was written.
 */
export function exportSetups(list: Setup[]): string {
  const envelope: Envelope = {
    version: VERSION,
    exported_at: new Date().toISOString(),
    setups: list,
  };
  return JSON.stringify(envelope, null, 2);
}

/** True if `value` has every field required to safely merge it as a Setup. */
function isValidSetup(value: unknown): value is Setup {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.name === 'string' &&
    typeof s.distance_cm === 'number' &&
    Number.isFinite(s.distance_cm) &&
    typeof s.distance_tol_cm === 'number' &&
    Number.isFinite(s.distance_tol_cm) &&
    typeof s.updated_at === 'string' &&
    typeof s.deleted === 'boolean' &&
    (s.brightness_above_ambient === null ||
      (typeof s.brightness_above_ambient === 'number' && Number.isFinite(s.brightness_above_ambient)))
  );
}

/**
 * Last-write-wins per setup, by updated_at. Enough for one user.
 *
 * `existing` must also be the full record including tombstones. A deletion is
 * only expressible as a tombstone that is *newer*, so filtering either side
 * of the merge turns "deleted on Tuesday" into "unknown to the device" and
 * an older file adds it back.
 *
 * Consequence, deliberately: a file whose tombstone is newer than the saved
 * copy deletes that setup. Import is a merge, not a snapshot restore — the
 * argument is in .superpowers/sdd/device-contract-report.md.
 */
export function importSetups(json: string, existing: Setup[]): Setup[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file could not be read as JSON.');
  }

  const envelope = parsed as Partial<Envelope>;
  if (!envelope || typeof envelope.version !== 'number' || !Array.isArray(envelope.setups)) {
    throw new Error('That file is not a LightGuide export.');
  }

  if (envelope.version !== VERSION) {
    throw new Error(
      `That file was made by a different version of LightGuide (version ${envelope.version}) and cannot be read.`
    );
  }

  for (let i = 0; i < envelope.setups.length; i++) {
    if (!isValidSetup(envelope.setups[i])) {
      throw new Error(
        `That file could not be imported: entry ${i} is not a valid setup. Nothing was changed.`
      );
    }
  }

  const merged = new Map<string, Setup>();
  for (const setup of existing) merged.set(setup.id, setup);
  for (const incoming of envelope.setups) {
    const current = merged.get(incoming.id);
    if (!current || incoming.updated_at > current.updated_at) {
      merged.set(incoming.id, incoming);
    }
  }
  return [...merged.values()];
}
