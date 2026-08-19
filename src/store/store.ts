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
/**
 * Bumped every 500ms while connected — the heartbeat. Preact signals only
 * re-render on a *write*, and nothing writes a signal when time merely
 * passes, so without this a UI computing staleness from `Date.now() -
 * lastGoodAt.value` during render would never re-render once frames stop
 * arriving (e.g. a Wi-Fi stall that never formally closes the socket). Any
 * component that needs to detect staleness must read `tick.value` during
 * render to subscribe to this heartbeat.
 */
export const tick = signal(0);

let device: DeviceClient | null = null;
let unsubscribe: (() => void) | null = null;
/** Bumped on every connect() so a stale, out-of-order response can recognize it's been superseded. */
let generation = 0;
/** True once the current generation's device has answered listSetups(), authoritatively or not. */
let deviceAnswered = false;
/** Heartbeat interval id, module-scoped so connect()/disconnect() can always find and clear it. */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function connect(client: DeviceClient): void {
  // Clear any previous heartbeat first so repeated connect() calls never stack intervals.
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  generation += 1;
  const myGeneration = generation;
  deviceAnswered = false;

  device = client;
  unsubscribe?.();
  unsubscribe = client.subscribeLive((r) => {
    reading.value = r;
    if (r.distance_cm !== null) lastGoodAt.value = Date.now();
    status.value = client.status();
  });
  // The heartbeat: refreshes status even when no frame arrives, and — critically —
  // increments `tick` unconditionally on every tick. Writing the *same* value to a
  // signal does not trigger a re-render, so refreshing `status` alone would not be
  // enough to invalidate a view that only depends on elapsed time.
  heartbeatTimer = setInterval(() => {
    tick.value += 1;
    status.value = client.status();
  }, 500);
  // Cached setups render immediately, but the device is the sole authority.
  // Apply the cache only if this is still the current connect(), the device
  // hasn't answered yet, and setups is still empty — otherwise the cache
  // (a disposable placeholder) could overwrite a real device response,
  // including an authoritative empty one (e.g. the user deleted their last
  // setup and the device correctly reports zero).
  void readCachedSetups().then((cached) => {
    if (myGeneration === generation && !deviceAnswered && setups.value.length === 0) {
      setups.value = cached;
    }
  });
  // Generation-guarded like every other write above: a stale connect()'s
  // failure must not clobber the status of a newer, live connection.
  void refreshSetups().catch(() => {
    if (myGeneration === generation) status.value = 'disconnected';
  });
}

export async function refreshSetups(): Promise<void> {
  const myGeneration = generation;
  const client = device;
  if (!client) return;
  const list = await client.listSetups();
  if (myGeneration !== generation) return; // superseded by a newer connect()
  deviceAnswered = true;
  setups.value = list;
  status.value = client.status();
  void cacheSetups(list);
}

/** Tears down the live connection: heartbeat, live subscription, and device reference. */
export function disconnect(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  unsubscribe?.();
  unsubscribe = null;
  status.value = 'disconnected';
  device = null;
}

export async function persistSetup(setup: Setup): Promise<void> {
  if (!device) throw new Error('no device connected');
  // Confirmed by the device before it reaches the UI — never optimistic.
  await device.saveSetup(setup);
  await refreshSetups();
}

/** Thrown by persistSetups when a write fails partway; carries how many setups were saved before it did. */
export class PartialPersistError extends Error {
  constructor(message: string, public readonly written: number) {
    super(message);
    this.name = 'PartialPersistError';
  }
}

/**
 * Writes only the given setups, confirming each with the device before it
 * reaches the UI (never optimistic) — same discipline as persistSetup, but
 * batched: a single refreshSetups() after the loop instead of one per
 * setup, so callers that already know which setups changed (e.g. import)
 * don't pay for a full-list round-trip and flash write per unchanged entry.
 */
export async function persistSetups(list: Setup[]): Promise<number> {
  let written = 0;
  try {
    if (!device) throw new Error('no device connected');
    for (const setup of list) {
      await device.saveSetup(setup);
      written += 1;
    }
  } catch (error) {
    await refreshSetups();
    throw new PartialPersistError((error as Error).message, written);
  }
  await refreshSetups();
  return written;
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
  // Deliberately no "no device connected" guard here (unlike persistSetup/
  // removeSetup/startGuiding): the user must always be able to leave the
  // live screen, even if the device dropped or was never connected.
  await device?.setActiveTarget(null);
  activeTarget.value = null;
  activeSetupId.value = null;
  screen.value = 'library';
}
