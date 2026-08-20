import { signal } from '@preact/signals';
import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';
import { cacheSetups, readCachedSetups } from '../cache/idb';
import { isFeedStale, STALE_AFTER_MS } from '../guidance/liveness';
import { createStabilityState, stabilise, type StabilityState } from '../guidance/stability';

export type Screen = 'library' | 'new' | 'live' | 'quick';

export const setups = signal<Setup[]>([]);
export const reading = signal<Reading | null>(null);
export const status = signal<ConnectionStatus>('disconnected');
export const screen = signal<Screen>('library');
/** Setup being edited on the 'new' screen, or null when creating a fresh one. */
export const editingSetupId = signal<string | null>(null);
/** Distance to prefill the 'new' screen with — set when saving a quick guide. */
export const prefillDistanceCm = signal<number | null>(null);
export const activeTarget = signal<Target | null>(null);
export const activeSetupId = signal<string | null>(null);
/**
 * Wall-clock ms of the last reading with a usable *distance*. Drives the stale
 * banner and the distance axis. Named without an axis suffix for history; it
 * has always been the distance axis's timestamp and `lastGoodLightAt` is its
 * counterpart. Staleness is per axis (spec §8: "the affected axis greys out;
 * the other keeps working") — never test one axis against the other's stamp.
 */
export const lastGoodAt = signal<number | null>(null);
/**
 * Wall-clock ms of the last reading the light axis could actually be computed
 * from. Both `brightness` and `ambient` are required: `verdict` compares
 * `brightness - ambient` against the target, so a frame carrying only one of
 * them is no more usable than a frame carrying neither.
 */
export const lastGoodLightAt = signal<number | null>(null);
/**
 * The live reading after stability filtering (see `guidance/stability.ts`) —
 * what the guidance screen should render. Null channels stay null: this is
 * never a fabricated value bridging a dropout. Null until the first frame.
 */
export const stableReading = signal<Reading | null>(null);
/**
 * `activeTarget` with tolerances widened while a channel is latched in-band —
 * the hysteresis half of stability handling. Pass this to `verdict()`, but
 * keep showing the user the real `activeTarget`: only the classification
 * threshold moves, never the target itself.
 */
export const stableTarget = signal<Target | null>(null);
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

/**
 * The current reading, but only when it's trustworthy: the connection is
 * `'connected'` and the feed isn't stale per `isFeedStale`. Otherwise null.
 * `reading` itself is never cleared — it holds the last frame received
 * indefinitely, even across disconnects — so any screen that would act on a
 * reading (capture a reference value, offer "use current reading") must go
 * through this instead of reading the raw signal, or it risks treating a
 * stale frame as live. Reads `tick.value` so callers re-render on the
 * heartbeat even when no new frame arrives.
 */
export function liveReading(): Reading | null {
  void tick.value;
  if (status.value !== 'connected') return null;
  if (isFeedStale(lastGoodAt.value, Date.now(), STALE_AFTER_MS)) return null;
  return reading.value;
}

/**
 * All screen changes go through here so the browser Back gesture works — on a
 * phone in a studio that is the navigation people actually reach for. Never
 * assign `screen.value` directly from a component; a screen reached without a
 * history entry becomes a dead end that Back exits the whole app from.
 */
export function navigate(next: Screen, options: { replace?: boolean } = {}): void {
  screen.value = next;
  try {
    const entry = { lgScreen: next };
    if (options.replace) history.replaceState(entry, '');
    else history.pushState(entry, '');
  } catch {
    // Non-browser environment (tests): navigation still works, just no history.
  }
}

/** Applies a screen from a popstate event without pushing another entry. */
export function applyHistoryScreen(next: Screen): void {
  screen.value = next;
}

/**
 * Best-effort clear of the device's active target. Used by stopGuiding and by
 * the page-teardown handler: if the tab closes mid-guide the device would
 * otherwise keep guiding to a target no app is showing.
 */
export async function clearDeviceTarget(): Promise<void> {
  await device?.setActiveTarget(null);
}

/** Opens the 'new' screen as an editor for an existing setup. */
export function editSetup(id: string): void {
  editingSetupId.value = id;
  prefillDistanceCm.value = null;
  navigate('new');
}

/** Opens the 'new' screen fresh, optionally prefilled with a distance. */
export function createSetup(distanceCm?: number): void {
  editingSetupId.value = null;
  prefillDistanceCm.value = distanceCm ?? null;
  navigate('new');
}

let device: DeviceClient | null = null;
let unsubscribe: (() => void) | null = null;
/** Bumped on every connect() so a stale, out-of-order response can recognize it's been superseded. */
let generation = 0;
/** True once the current generation's device has answered listSetups(), authoritatively or not. */
let deviceAnswered = false;
/** Heartbeat interval id, module-scoped so connect()/disconnect() can always find and clear it. */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
/**
 * Rolling window + hysteresis latches for the stability filter. Lives here,
 * in the caller, precisely so `guidance/stability.ts` can stay pure: it is
 * threaded through `stabilise()` on each frame and never mutated in place.
 */
let stability: StabilityState = createStabilityState();

/**
 * Throws away the smoothing window and the hysteresis latches. Called whenever
 * the thing being measured changes identity — a new connection, a teardown, or
 * a new target — so samples taken against one setup can never smooth into the
 * verdict for another.
 */
export function resetStability(): void {
  stability = createStabilityState();
  stableReading.value = null;
  stableTarget.value = null;
}

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
  resetStability();
  unsubscribe = client.subscribeLive((r) => {
    reading.value = r;
    const at = Date.now();
    // Per-axis staleness: each axis stamps only on a frame it could actually
    // be read from, so a missed ultrasonic ping ages out the distance axis
    // while the light axis keeps reporting, and vice versa.
    if (r.distance_cm !== null) lastGoodAt.value = at;
    if (r.brightness !== null && r.ambient !== null) lastGoodLightAt.value = at;
    // Stability filtering happens here, once per frame — not in the component,
    // which also re-renders on the 500ms heartbeat and would otherwise fold
    // the same frame into the window repeatedly.
    const step = stabilise(stability, r, activeTarget.value, at);
    stability = step.state;
    stableReading.value = step.reading;
    stableTarget.value = step.target;
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
  resetStability();
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
  // New target, new band: never carry a hysteresis latch earned against a
  // different distance into the first frames of this one.
  resetStability();
  navigate('live');
}

export async function stopGuiding(): Promise<void> {
  // Deliberately no "no device connected" guard here (unlike persistSetup/
  // removeSetup/startGuiding): the user must always be able to leave the
  // live screen, even if the device dropped or was never connected.
  // Clearing the active target on the device is best-effort only: if it
  // rejects (device unreachable), that failure must not prevent the local
  // state reset and screen change below — those are what actually let the
  // user leave the screen.
  try {
    await clearDeviceTarget();
  } catch {
    // Ignored — best-effort. The device just won't hear that guidance stopped.
  }
  activeTarget.value = null;
  activeSetupId.value = null;
  navigate('library');
}

/**
 * Leaves the live screen WITHOUT stopping guidance — the device keeps its
 * active target and the app bar shows a chip to come back. This is what makes
 * "browse the library while the stand is still being placed" possible.
 */
export function leaveGuidanceScreen(): void {
  navigate('library');
}
