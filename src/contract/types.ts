/**
 * ## Firmware requirements
 *
 * What a board has to guarantee to work with this app. All of it was
 * previously implicit — true of the mock, relied on by the app, written down
 * nowhere. If you are implementing the ESP32 side, this section is the
 * contract; the types below are only its shape.
 *
 * ### The live feed
 *
 * A WebSocket at `/live` streaming one JSON `Reading` per frame, target
 * **10 Hz**. Two thresholds in the app are measured against that cadence, and
 * they are what set the real floor:
 *
 *  - The stability window (`guidance/stability.ts`) discards any sample older
 *    than **800 ms**. A feed that ever goes longer than that between *good*
 *    frames on an axis empties that axis's window, and guidance falls back to
 *    unfiltered single readings until it refills.
 *  - Staleness fires at **2 s** (`STALE_AFTER_MS`). An axis with no good frame
 *    for 2 s is greyed out and reported as no reading at all.
 *
 * So: at least one frame carrying a usable value per axis every 800 ms to keep
 * guidance smooth, and every 2 s to keep it on screen at all. Slower is not a
 * degraded experience, it is a blank one. Faster than 10 Hz is harmless — the
 * window is bounded by count as well as age.
 *
 * A frame is cheap and a missing frame is not: **send a frame even when every
 * channel failed**. `null` is the app's word for "this sensor did not read",
 * and it can only act on a null it actually receives.
 *
 * ### `seq` and `ts` must be unique per frame
 *
 * `stabilise()` uses the `(seq, ts)` pair as a frame's identity, to make
 * folding the same frame in twice a no-op — the UI re-renders on a 500 ms
 * heartbeat and would otherwise re-enter the newest frame into the smoothing
 * window on every render, weighting it several times over.
 *
 * The consequence for firmware is sharp: **never restart `seq` from 0**, not
 * on reconnect, not on a client subscribing, not on a soft reset. A frame that
 * repeats the `(seq, ts)` of the previous one is silently dropped — no error,
 * no gap, just a reading that never reaches the window. Use a monotonic
 * counter that survives reconnects for the life of the boot, and a millisecond
 * `ts` from a clock that never goes backwards. If `seq` must wrap, wrap it at
 * a width where `ts` has certainly moved on.
 *
 * ### `ambient` is an estimate the device maintains, not a raw reading
 *
 * `ambient` is what the light sensor would read with the guided light off,
 * 0..1. The device is expected to **track it continuously** — not to sample it
 * once at capture time, and not to send raw brightness in this field.
 *
 * It is the shared zero for both ends of the brightness axis: capture stores
 * `brightness - ambient`, and live guidance compares `brightness - ambient`
 * against that stored value. Both ends use this same field, so a device that
 * let it drift, froze it, or defined it differently in the two situations
 * would make a light reference captured last week compare against a different
 * zero today — and the error is invisible, because both numbers look
 * perfectly plausible. Send `null` when there is no usable estimate.
 *
 * ### HTTP surface
 *
 * Five routes, and no others are used:
 *
 *  - `GET /api/setups` → `200` with a JSON array of active setups.
 *    **Tombstones must not appear here.** This is the list every screen shows.
 *  - `GET /api/setups?include_deleted=1` → `200` with *every* record,
 *    tombstones included. This is the backup read.
 *    The flag is **strict**: `include_deleted` present with any value other
 *    than exactly `1` must be refused with `400`, never treated as absent. A
 *    client that typos the flag would otherwise receive a tombstone-free list,
 *    write it to a backup file, and silently resurrect every deletion on the
 *    next import — which is the precise failure the flag exists to prevent.
 *  - `PUT /api/setups/{id}` → `200` with the stored setup as JSON body.
 *    Store the body **verbatim**, `updated_at` and `deleted` included. Do not
 *    stamp your own clock: last-write-wins is ordered by the timestamp the
 *    *writer* chose, and a device that re-stamped would make every imported
 *    backup look newer than what is already on the board. Refuse with `400` a
 *    body carrying no string `updated_at` and no boolean `deleted` — there is
 *    nothing to order such a record by. A body with `deleted: true` is a
 *    legitimate write: it is how an import carries a deletion forward.
 *  - `DELETE /api/setups/{id}` → `204` **with no body**. Tombstone the record
 *    (`deleted: true`) rather than removing it, and stamp `updated_at` from
 *    the device clock — there is no body here to take one from, and a
 *    tombstone that kept the live copy's timestamp could never win a merge.
 *    Deleting an id you do not hold is still `204`.
 *  - `GET /api/active` → `200` with `{"target": Target | null}`. Note the
 *    wrapper object, and that `null` is a real answer meaning "guiding to
 *    nothing" — as distinct from a malformed one, which the client rejects
 *    rather than reading as "not guiding".
 *  - `POST /api/active` → `204`, body a complete `Target`. Refuse with `400`
 *    anything that is not one, an empty body included, and set nothing as a
 *    side effect of refusing.
 *  - `DELETE /api/active` → `204`. This is the *only* way to clear the target.
 *    Clearing is its own verb precisely so that a truncated body — a real
 *    outcome on a flaky access point — can never be read as "stop guiding".
 *
 * `204` means no body at all; `200` means a JSON body is required. The client
 * distinguishes them and will treat a `200` with an empty body as an error.
 *
 * The active target is **device state that outlives the app**: keep guiding to
 * it across a client disconnect, and report it on `GET /api/active` when a
 * client comes back. The app reconciles against it on connect, which is what
 * lets a photographer reload the page mid-shoot without stranding the board.
 *
 * There is deliberately **no remote wipe** and no reset endpoint. A clean
 * device means a device that has never been written to.
 */
export type ChannelState = 'in_band' | 'under' | 'over' | 'unknown';

export interface Setup {
  id: string;
  name: string;
  distance_cm: number;
  distance_source: 'typed' | 'captured';
  distance_tol_cm: number;
  /** Dimensionless fraction of sensor range, ambient already subtracted. Null = distance-only setup. */
  brightness_above_ambient: number | null;
  brightness_tol: number;
  brightness_captured_at: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface Reading {
  /** Null when the sensor missed — never 0. */
  distance_cm: number | null;
  /** Raw normalised brightness 0..1, ambient NOT subtracted. */
  brightness: number | null;
  /**
   * The device's own ambient estimate, 0..1: what the sensor reads with the
   * guided light switched off. The device maintains this value continuously
   * (not just during capture), and it is the shared zero for both ends of
   * the brightness axis — capture (CaptureLight) and live guidance
   * (verdict.ts) both compute `brightness - ambient` against this same
   * field, never a client-side snapshot of raw brightness.
   */
  ambient: number | null;
  seq: number;
  ts: number;
}

export interface Target {
  distance_cm: number;
  distance_tol_cm: number;
  brightness_above_ambient: number | null;
  brightness_tol: number;
}

export interface Verdict {
  distance_delta_cm: number | null;
  distance_state: ChannelState;
  brightness_delta: number | null;
  brightness_state: ChannelState;
  instruction: string;
  trustworthy: boolean;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface DeviceClient {
  /**
   * The setups a screen may show: tombstones (`deleted: true`) are never
   * included.
   *
   * The app itself no longer calls this — every screen now renders a filtered
   * view of `listSetupsIncludingDeleted()`, because one read has to serve both
   * the screens and backup. It stays on the contract anyway, deliberately:
   * `GET /api/setups` without the flag is a distinct semantic a board must
   * implement correctly regardless (it is the default, and refusing a bad
   * `include_deleted` value only means something if the unflagged form has a
   * defined answer), and it is the only read through which the conformance
   * suite can prove that a delete actually *hides* a setup. Asserting that
   * through `listSetupsIncludingDeleted()` is impossible — tombstones are
   * supposed to be there.
   */
  listSetups(): Promise<Setup[]>;
  /**
   * Everything the device holds, tombstones included — the backup read.
   *
   * A deletion is a record, not an absence: `deleted: true` with a newer
   * `updated_at` is how "I deleted this" survives a round trip through an
   * export file. `listSetups()` cannot express that, so an export built from
   * it silently resurrects every setup the user ever deleted the moment it is
   * re-imported. This is deliberately a separate method rather than a flag on
   * `listSetups()`: the set of callers allowed to see tombstones is small
   * (export, and the merge that import runs against), and keeping them
   * greppable is worth one extra method.
   */
  listSetupsIncludingDeleted(): Promise<Setup[]>;
  /**
   * Stores the setup exactly as given, `updated_at` and `deleted` included —
   * the device never re-stamps either. Last-write-wins ordering is decided by
   * the `updated_at` the *writer* chose, so a device that overwrote it would
   * make an imported backup always look newer than what is already there.
   *
   * Writing a setup with `deleted: true` is a legitimate call: it is how an
   * import carries a deletion forward.
   */
  saveSetup(setup: Setup): Promise<Setup>;
  /**
   * Tombstones the setup: `deleted: true`, `updated_at` stamped from the
   * device clock. The record itself is kept, and stays visible to
   * `listSetupsIncludingDeleted()`.
   */
  deleteSetup(id: string): Promise<void>;
  /** `null` clears the target — an explicit erase, not an empty write. */
  setActiveTarget(target: Target | null): Promise<void>;
  /** What the device is currently guiding to, or null if it is guiding to nothing. */
  getActiveTarget(): Promise<Target | null>;
  subscribeLive(cb: (reading: Reading) => void): () => void;
  status(): ConnectionStatus;
  close(): void;
}

export const DEFAULT_DISTANCE_TOL_CM = 5;
export const DEFAULT_BRIGHTNESS_TOL = 0.08;

export function newSetup(fields: {
  name: string;
  distance_cm: number;
  distance_source: 'typed' | 'captured';
  distance_tol_cm?: number;
  brightness_above_ambient?: number | null;
  brightness_tol?: number;
}): Setup {
  const now = new Date().toISOString();
  const hasLight = fields.brightness_above_ambient != null;
  return {
    id: crypto.randomUUID(),
    name: fields.name,
    distance_cm: fields.distance_cm,
    distance_source: fields.distance_source,
    distance_tol_cm: fields.distance_tol_cm ?? DEFAULT_DISTANCE_TOL_CM,
    brightness_above_ambient: fields.brightness_above_ambient ?? null,
    brightness_tol: fields.brightness_tol ?? DEFAULT_BRIGHTNESS_TOL,
    brightness_captured_at: hasLight ? now : null,
    created_at: now,
    updated_at: now,
    deleted: false,
  };
}

export function targetFromSetup(setup: Setup): Target {
  return {
    distance_cm: setup.distance_cm,
    distance_tol_cm: setup.distance_tol_cm,
    brightness_above_ambient: setup.brightness_above_ambient,
    brightness_tol: setup.brightness_tol,
  };
}
