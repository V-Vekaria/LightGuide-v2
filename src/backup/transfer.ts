import type { Setup } from '../contract/types';

const VERSION = 1;

interface Envelope {
  version: number;
  exported_at: string;
  setups: Setup[];
}

export function exportSetups(list: Setup[]): string {
  const envelope: Envelope = {
    version: VERSION,
    exported_at: new Date().toISOString(),
    setups: list,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Last-write-wins per setup, by updated_at. Enough for one user. */
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
