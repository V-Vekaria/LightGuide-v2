import { signal } from '@preact/signals';
import type {
  ConnectionStatus,
  DeviceClient,
  Reading,
  Setup,
  Target,
  Verdict,
} from '../contract/types';
import { targetFromSetup } from '../contract/types';
import { cacheSetups, readCachedSetups } from '../cache/idb';
import { shouldSuppressAxis, STALE_AFTER_MS } from '../guidance/liveness';
import { verdict as computeVerdict } from '../guidance/verdict';
import { createStabilityState, stabilise, type StabilityState } from '../guidance/stability';

export type Screen = 'library' | 'new' | 'live' | 'quick';

/**
 * The setups every screen renders: active only, never a tombstone. Derived
 * from `allSetups` — nothing writes this without writing that.
 */
export const setups = signal<Setup[]>([]);
/**
 * Everything the device holds, tombstones included. Backup only: export writes
 * this, and import merges against it. Two reasons it is not just `setups`:
 *
 *  - An export built from the active list physically cannot contain a
 *    deletion, so re-importing it resurrects every setup deleted since.
 *  - The *local* side of the merge needs tombstones too. Merging an old file
 *    against the active list makes a setup deleted last Tuesday look like one
 *    the device has never heard of, and it comes back as an addition.
 *
 * Holding the full record here (rather than fetching it when Export is
 * pressed) keeps export synchronous and available while the device is gone —
 * which is exactly when a backup matters.
 */
export const allSetups = signal<Setup[]>([]);
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
 * Whether the window behind the published reading was deep enough to have
 * actually rejected an outlier — `StabilityStep.filtered`, mirrored here.
 *
 * False for the first frames after every `resetStability()` (connect,
 * retarget, reconnect) and after any stall long enough to age the window out.
 * Gates arrival, never display: a reading that has not yet earned the median's
 * protection is still the honest best estimate and is worth showing, but it is
 * not worth buzzing about.
 */
export const stableFiltered = signal(false);

/** Which sensor axis a reading is being asked for. Each has its own clock. */
type Axis = 'distance' | 'light';

/**
 * One frame, narrowed to a single axis and withheld unless that axis is live.
 *
 * Staleness is per axis (spec §8, and see `lastGoodAt`/`lastGoodLightAt`
 * above): an ultrasonic miss against a soft backdrop must not blank a
 * photodiode that is working perfectly, and vice versa. So the caller names
 * the axis it needs and is answered about that axis alone.
 *
 * Two things make this safe to hand to a screen:
 *
 *  - **The axis is gated on its own timestamp.** `shouldSuppressAxis` also
 *    keeps the connection check, so a dead link still withholds everything.
 *  - **The channels belonging to the other axis are nulled out**, rather than
 *    passed through. `reading` is never cleared — it holds the last frame
 *    received indefinitely, across disconnects — so a caller that reached for
 *    the wrong field on a whole frame would be reading something this
 *    accessor never vouched for. There is nothing there to reach for.
 *
 * Reads `tick.value` so callers re-render on the 500 ms heartbeat and see an
 * axis go stale even when no new frame ever arrives.
 */
function axisView(source: Reading | null, axis: Axis): Reading | null {
  void tick.value;
  const lastAt = axis === 'distance' ? lastGoodAt.value : lastGoodLightAt.value;
  if (shouldSuppressAxis(status.value, lastAt, Date.now(), STALE_AFTER_MS)) return null;
  if (source === null) return null;
  return axis === 'distance'
    ? { ...source, brightness: null, ambient: null }
    : { ...source, distance_cm: null };
}

/**
 * The live distance, or null if the distance axis is stale or the device is
 * gone. Light channels are always null here — ask `liveLightReading()` for
 * those. Raw rather than stabilised: the callers are the ones capturing an
 * instantaneous value into a saved setup, and a setup should record what the
 * sensor said, not what a smoothing window inferred.
 */
export function liveDistanceReading(): Reading | null {
  return axisView(reading.value, 'distance');
}

/**
 * The live brightness and ambient, or null if the light axis is stale or the
 * device is gone. `distance_cm` is always null here.
 *
 * Both light channels share one clock because a light *verdict* needs both:
 * `verdict()` compares `brightness - ambient`, so a frame carrying one without
 * the other is no more usable than a frame carrying neither.
 */
export function liveLightReading(): Reading | null {
  return axisView(reading.value, 'light');
}

/** As `liveDistanceReading`, over the stability-filtered feed. */
export function stableDistanceReading(): Reading | null {
  return axisView(stableReading.value, 'distance');
}

/** As `liveLightReading`, over the stability-filtered feed. */
export function stableLightReading(): Reading | null {
  return axisView(stableReading.value, 'light');
}

/** Everything the guidance screen renders, derived once so nothing can disagree. */
export interface GuidanceView {
  /** This axis is stale or the link is down: it must not be rendered as live. */
  distanceDown: boolean;
  lightDown: boolean;
  /** Both axes down — there is no guidance to give at all. */
  suppressed: boolean;
  /** The stabilised reading with every suppressed axis nulled out. */
  gated: Reading;
  verdict: Verdict;
  /** True when the target guides on light as well as distance. */
  guidingOnLight: boolean;
  /**
   * On target on every axis this setup guides on — the condition the arrival
   * buzz fires on. Requires `stableFiltered`: a wild ping that happens to land
   * inside tolerance one frame after a reset is not an arrival, and buzzing
   * for it would send a photographer to a stand that is in the wrong place.
   */
  settled: boolean;
}

/**
 * Derives the whole guidance view from the stabilised feed.
 *
 * It lives here rather than in the component because two callers need the
 * *same* answer: the live screen, which draws it, and the guidance session
 * (see `GuidanceSession` in ui/LiveGuidance.tsx), which buzzes on it and
 * outlives the screen. Two copies of this arithmetic would eventually
 * disagree, and the way they would disagree is the screen saying one thing
 * while the phone in your pocket says another.
 */
export function guidanceView(target: Target): GuidanceView {
  void tick.value;
  const now = Date.now();
  const live = stableReading.value;

  const distanceDown = shouldSuppressAxis(status.value, lastGoodAt.value, now, STALE_AFTER_MS);
  const lightDown = shouldSuppressAxis(status.value, lastGoodLightAt.value, now, STALE_AFTER_MS);

  // A stale axis is nulled out independently, so the verdict reports 'unknown'
  // for that channel alone rather than blanking a good reading on the other.
  const gated: Reading = {
    distance_cm: distanceDown ? null : live?.distance_cm ?? null,
    brightness: lightDown ? null : live?.brightness ?? null,
    ambient: lightDown ? null : live?.ambient ?? null,
    seq: live?.seq ?? 0,
    ts: live?.ts ?? 0,
  };

  // Classified against the hysteresis-widened target so the in-band boundary
  // doesn't oscillate; the real `target` is what the screen displays.
  const verdict = computeVerdict(gated, stableTarget.value ?? target);
  const guidingOnLight = target.brightness_above_ambient !== null;

  const settled =
    stableFiltered.value &&
    verdict.distance_state === 'in_band' &&
    verdict.brightness_state !== 'over' &&
    verdict.brightness_state !== 'under' &&
    !(guidingOnLight && verdict.brightness_state === 'unknown');

  return {
    distanceDown,
    lightDown,
    suppressed: distanceDown && lightDown,
    gated,
    verdict,
    guidingOnLight,
    settled,
  };
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
  // The window is empty again, so nothing in it has outvoted anything yet.
  // Until it refills, a reading inside tolerance is not an arrival.
  stableFiltered.value = false;
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
    stableFiltered.value = step.filtered;
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
      // The cache holds the full record, tombstones included, so an export
      // taken before the device answers still carries deletions. They are
      // filtered back out of `setups` here, same as a device response.
      applySnapshot(cached);
    }
  });
  // Generation-guarded like every other write above: a stale connect()'s
  // failure must not clobber the status of a newer, live connection.
  //
  // The setups have to land before the target can be restored: matching the
  // device's target back to the setup it came from is what puts a *name* on
  // the chip, and the list is where the names are.
  void refreshSetups()
    .then(() => restoreActiveTarget(myGeneration))
    .catch(() => {
      if (myGeneration === generation) status.value = 'disconnected';
    });
}

/** True when two targets would guide the stand to exactly the same place. */
function sameTarget(a: Target | null, b: Target | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.distance_cm === b.distance_cm &&
    a.distance_tol_cm === b.distance_tol_cm &&
    a.brightness_above_ambient === b.brightness_above_ambient &&
    a.brightness_tol === b.brightness_tol
  );
}

/**
 * Adopts whatever the device is already guiding to.
 *
 * The device owns the active target — it keeps guiding across a page reload,
 * a Wi-Fi blip, or the tab being closed and reopened. Without this the app
 * came up believing nothing was active, so the guiding chip never appeared
 * and the only control that stops the device (`stopGuiding`) was unreachable:
 * the board went on guiding to a target with no route back to it.
 *
 * Deliberately narrow:
 *
 *  - It never overwrites a target set locally in the meantime. The user
 *    tapping Guide during the round trip is newer information than the
 *    device's answer to a question asked before they did.
 *  - It never navigates. Reloading the page should not throw you onto the
 *    live screen; the chip is the invitation, and it is the user's to accept.
 *  - It never throws. A device that cannot answer this is a device with no
 *    target worth adopting, and failing here must not mark a working
 *    connection as broken.
 */
async function restoreActiveTarget(myGeneration: number): Promise<void> {
  const client = device;
  if (!client) return;
  let target: Target | null;
  try {
    target = await client.getActiveTarget();
  } catch {
    return; // Unreachable or malformed: adopt nothing rather than guess.
  }
  if (myGeneration !== generation) return; // superseded by a newer connect()
  if (target === null || activeTarget.value !== null) return;

  activeTarget.value = target;
  // Name it if one of the saved setups would produce exactly this target.
  // A quick guide matches nothing and correctly stays anonymous.
  activeSetupId.value = setups.value.find((s) => sameTarget(targetFromSetup(s), target))?.id ?? null;
  resetStability();
}

export async function refreshSetups(): Promise<void> {
  const myGeneration = generation;
  const client = device;
  if (!client) return;
  // One read of the whole record, split into the two views. The screens get
  // the active list they have always had; backup gets the tombstones it
  // cannot work without.
  const list = await client.listSetupsIncludingDeleted();
  if (myGeneration !== generation) return; // superseded by a newer connect()
  deviceAnswered = true;
  applySnapshot(list);
  status.value = client.status();
  void cacheSetups(list);
}

/**
 * The single place tombstones are filtered out of what screens see. Every
 * write to `setups` goes through here, so a deleted setup cannot reach a
 * screen by some path that forgot to filter.
 */
function applySnapshot(list: Setup[]): void {
  allSetups.value = list;
  setups.value = list.filter((s) => !s.deleted);
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

/**
 * Re-derives the active target from the setup it came from, after that setup
 * has been written or deleted.
 *
 * The bug this closes: guiding "Portrait key" at 50 cm, the photographer edits
 * it to 60 and saves. The list refreshes, but `activeTarget` is a *snapshot*
 * taken when Guide was tapped — so the header kept saying 50, the device kept
 * guiding to 50, and walking the stand to where the app said "on target" put
 * it 10 cm wrong. Editing the setup you are standing in front of is not an
 * exotic case; it is the main reason to edit one at all.
 *
 * Called after every path that can write or remove a setup — a single save, a
 * delete, and an import batch, which can do either to the guided setup without
 * the user ever naming it.
 *
 * The rule it enforces is the one the whole app is built on: **what the header
 * says must be what the device is guiding to.** Where that cannot be
 * established, guidance stops rather than being shown at a value nobody has
 * confirmed.
 */
async function reconcileActiveSetup(): Promise<void> {
  const id = activeSetupId.value;
  if (id === null) return; // a quick guide, or not guiding: nothing to track

  const current = allSetups.value.find((s) => s.id === id) ?? null;

  // Deleted (or deleted by an import). Guidance stops. The alternative —
  // carrying on untethered against a target whose setup is gone — leaves a
  // chip naming a setup that is no longer in the library and a Return button
  // going to a screen headed by a deleted name. Stopping is the only outcome
  // the store and the UI can both state honestly.
  if (current === null || current.deleted) {
    await releaseGuidance();
    return;
  }

  const next = targetFromSetup(current);
  if (sameTarget(next, activeTarget.value)) return; // edited, but not in a way that moves the stand

  try {
    // Device first: it is the thing actually guiding. Only once it has
    // accepted the new target does the app start claiming it.
    await device?.setActiveTarget(next);
  } catch {
    // The save landed but the device would not take the new target, so it is
    // still guiding to the old one. Showing either number would be a claim we
    // cannot support, so the app stops claiming anything and the chip
    // disappears — a visible gap, which is always the safe side here.
    await releaseGuidance();
    return;
  }
  activeTarget.value = next;
  // New band, new geometry: never carry a hysteresis latch earned against the
  // old distance into the first frames of the new one.
  resetStability();
}

/**
 * Drops guidance without the user having asked to stop: the setup behind it
 * was deleted, or the device would not accept its new target. Unlike
 * `stopGuiding` this leaves no history entry behind — the live screen it
 * replaces has nothing left to render, so Back must not return to it.
 */
async function releaseGuidance(): Promise<void> {
  activeTarget.value = null;
  activeSetupId.value = null;
  resetStability();
  if (screen.value === 'live') navigate('library', { replace: true });
  try {
    await clearDeviceTarget();
  } catch {
    // Best-effort, exactly as in stopGuiding: the device just won't hear it.
  }
}

export async function persistSetup(setup: Setup): Promise<void> {
  if (!device) throw new Error('no device connected');
  // Confirmed by the device before it reaches the UI — never optimistic.
  await device.saveSetup(setup);
  await refreshSetups();
  await reconcileActiveSetup();
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
    // Some writes did land before the failure, possibly to the guided setup.
    await reconcileActiveSetup();
    throw new PartialPersistError((error as Error).message, written);
  }
  await refreshSetups();
  await reconcileActiveSetup();
  return written;
}

export async function removeSetup(id: string): Promise<void> {
  if (!device) throw new Error('no device connected');
  await device.deleteSetup(id);
  await refreshSetups();
  // Deleting the setup you are guiding to used to leave activeSetupId pointing
  // at a tombstone: a chip naming a setup no longer in the library.
  await reconcileActiveSetup();
}

export async function startGuiding(target: Target, setupId?: string): Promise<void> {
  if (!device) throw new Error('no device connected');
  await device.setActiveTarget(target);
  activeTarget.value = target;
  activeSetupId.value = setupId ?? null;
  // New target, new band: never carry a hysteresis latch earned against a
  // different distance into the first frames of this one.
  resetStability();
  // Retargeting from the live screen is a change of target, not a change of
  // screen. Pushing an entry for it meant four preset taps mid-shoot cost four
  // Back presses that each appeared to do nothing — the screen never changes,
  // only the number does. Replace, so Back still means "leave the live screen".
  navigate('live', { replace: screen.value === 'live' });
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
