import { signal } from '@preact/signals';
import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';
import { cacheSetups, readCachedSetups } from '../cache/idb';

export type Screen = 'library' | 'new' | 'live' | 'quick';

export const setups = signal<Setup[]>([]);
export const reading = signal<Reading | null>(null);
export const status = signal<ConnectionStatus>('disconnected');
export const screen = signal<Screen>('library');
export const activeTarget = signal<Target | null>(null);
export const activeSetupId = signal<string | null>(null);
/** Wall-clock ms of the last reading with a usable distance. Drives the stale banner. */
export const lastGoodAt = signal<number | null>(null);

let device: DeviceClient | null = null;
let unsubscribe: (() => void) | null = null;

export function connect(client: DeviceClient): void {
  device = client;
  unsubscribe?.();
  unsubscribe = client.subscribeLive((r) => {
    reading.value = r;
    if (r.distance_cm !== null) lastGoodAt.value = Date.now();
    status.value = client.status();
  });
  // Cached setups render immediately; the device is still the authority.
  void readCachedSetups().then((cached) => {
    if (setups.value.length === 0) setups.value = cached;
  });
  void refreshSetups();
}

export async function refreshSetups(): Promise<void> {
  if (!device) return;
  const list = await device.listSetups();
  setups.value = list;
  status.value = device.status();
  void cacheSetups(list);
}

export async function persistSetup(setup: Setup): Promise<void> {
  if (!device) throw new Error('no device connected');
  // Confirmed by the device before it reaches the UI — never optimistic.
  await device.saveSetup(setup);
  await refreshSetups();
}

export async function removeSetup(id: string): Promise<void> {
  if (!device) throw new Error('no device connected');
  await device.deleteSetup(id);
  await refreshSetups();
}

export async function startGuiding(target: Target, setupId?: string): Promise<void> {
  if (!device) throw new Error('no device connected');
  await device.setActiveTarget(target);
  activeTarget.value = target;
  activeSetupId.value = setupId ?? null;
  screen.value = 'live';
}

export async function stopGuiding(): Promise<void> {
  await device?.setActiveTarget(null);
  activeTarget.value = null;
  activeSetupId.value = null;
  screen.value = 'library';
}
