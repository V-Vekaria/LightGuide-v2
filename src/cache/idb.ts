import { get, set } from 'idb-keyval';
import type { Setup } from '../contract/types';

const KEY = 'lightguide.setups';

/** Cache only — never the system of record. Safe to lose entirely. */
export async function cacheSetups(list: Setup[]): Promise<void> {
  try {
    await set(KEY, list);
  } catch {
    // A failed cache write must never break the app.
  }
}

export async function readCachedSetups(): Promise<Setup[]> {
  try {
    return (await get<Setup[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}
