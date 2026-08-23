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
 * ### `GET /api/info` — who is answering, and can we talk to it
 *
 * `200` with a JSON object. This is the only route the app calls *before* it
 * trusts anything else the device says, and the only one that answers the
 * question a photographer standing in front of two identical boxes actually
 * has: which one is this.
 *
 * ```json
 * {
 *   "protocol": 1,
 *   "device_id": "lg-3c71bf2a9d40",
 *   "name": "LightGuide 9D40",
 *   "model": "LightGuide ESP32-S3",
 *   "firmware": "0.4.2",
 *   "uptime_s": 5310,
 *   "free_storage_bytes": 9012345,
 *   "sensors": { "distance": { "state": "ok" }, "light": { "state": "ok" } }
 * }
 * ```
 *
 * **`protocol` and `firmware` are two different numbers and must never be
 * conflated.** `firmware` is a build of the board's software and changes
 * whenever anything on the board changes; the app only ever *displays* it and
 * must never make a decision from it. `protocol` is the version of *this
 * contract* and changes only when a board stops being able to talk to an app
 * that understood the previous one. The app compares it against
 * `PROTOCOL_MIN_SUPPORTED`..`PROTOCOL_MAX_SUPPORTED` and refuses to guide a
 * device outside that range, because the app can be cached (it is served from
 * the board and a PWA is coming) and a months-old cached app can therefore
 * meet firmware newer than itself.
 *
 * The rule that keeps `protocol` cheap: **adding a route, or adding a field to
 * an existing payload, is additive and does not bump it.** A client that has
 * never heard of a new field ignores it. Bump `protocol` only when an existing
 * field changes meaning, changes units, changes type, or disappears — because
 * only then does an older app get a *wrong* answer rather than a partial one.
 *
 * Field by field:
 *
 *  - `protocol` — integer ≥ 1. Not a string, not semver: the app compares it
 *    numerically and a range check on a dotted string is where this kind of
 *    thing goes wrong.
 *  - `device_id` — non-empty string, **stable for the life of the board**.
 *    Derive it from the MAC (e.g. `lg-` + the six-byte station MAC in lower
 *    hex) so two boards can never collide and one board never changes its
 *    mind. It must survive reboots and reflashes; a per-request or per-boot
 *    id makes it impossible to tell "the same device reconnected" from "a
 *    different device answered".
 *  - `name` — non-empty, human-readable, and *distinct between two boards out
 *    of the box*. Default it from the id (e.g. `LightGuide 9D40` from the last
 *    four hex digits). There is deliberately no rename endpoint yet; adding
 *    one later is additive.
 *  - `model` — string or `null`. Display only.
 *  - `firmware` — non-empty string. Display only. Never parsed.
 *  - `uptime_s` — whole seconds since boot, or `null` if not tracked. Worth
 *    sending: it is what distinguishes "the board rebooted" from "the Wi-Fi
 *    dropped", and a reboot is also when `seq` legitimately restarts.
 *  - `free_storage_bytes` — bytes free on the filesystem partition, or `null`.
 *  - `sensors` — an object with **both** `distance` and `light` keys, each
 *    `{"state": "ok" | "fault" | "unknown"}`. Unrecognised keys are ignored by
 *    the app, so a third sensor may be added without a protocol bump.
 *
 * **What the sensor states mean, and why this route needs them.** Without
 * them, an ultrasonic that has stopped answering and a stand parked ten metres
 * away are the same thing on screen: a dash. They call for completely
 * different actions from the person holding the stand, so the device has to
 * say which it is.
 *
 *  - `ok` — the sensor answered recently. It says nothing about whether the
 *    *stand* is in range; a working sensor reporting no echo is still `ok`.
 *  - `fault` — the sensor is not responding at all: no echo pulse whatsoever
 *    within the timeout, an ADC that reads a hard rail, a bus that does not
 *    ACK. This is a hardware or wiring problem, and it is the one state that
 *    means "the reading will not come back by waiting".
 *  - `unknown` — the device genuinely cannot tell yet, e.g. in the first
 *    moments after boot before any sample has been taken. Not a synonym for
 *    `fault`; the app words them differently.
 *
 * **Send no wording.** There is no `message`, `error` or `detail` string on
 * this payload, deliberately, and there must never be one. The division of
 * responsibility is the same as everywhere else in this contract — the device
 * measures and reports state, the app writes the sentence the photographer
 * reads. A string from the board ends up on a customer's screen in a
 * developer's voice, and cannot be changed without reflashing.
 *
 * This route must answer **even when both sensors are faulty and nothing else
 * on the device works**. It is what the app falls back on to say "the device
 * is there, and here is what is wrong with it" rather than "no device".
 *
 * ### HTTP surface
 *
 * Six routes, and no others are used:
 *
 *  - `GET /api/info` → `200`, as above.
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

/**
 * The version of *this contract* that the app can talk. Not a firmware
 * version, and never compared against one.
 *
 * Two numbers rather than one because the two directions of mismatch are
 * different problems with different fixes, and the app has to be able to tell
 * a customer which one they have:
 *
 *  - device below `PROTOCOL_MIN_SUPPORTED` — the board is older than this app.
 *    The board needs updating.
 *  - device above `PROTOCOL_MAX_SUPPORTED` — the board is newer than this app,
 *    which happens when a cached copy of the app meets updated firmware. The
 *    *app* needs reloading.
 *
 * Widen the range rather than moving it whenever the app can still handle the
 * older shape; that is what keeps a board already in the field working after
 * an app update.
 */
export const PROTOCOL_MIN_SUPPORTED = 1;
export const PROTOCOL_MAX_SUPPORTED = 1;

/**
 * Per-sensor health, as the device reports it.
 *
 *  - `ok` — the sensor answered recently. It says nothing about whether the
 *    stand is in range: a working sensor with nothing in front of it is `ok`
 *    and sends `null` readings, and that distinction is the entire reason this
 *    field exists.
 *  - `fault` — not responding at all. A dash on screen will not come back by
 *    waiting; something needs looking at.
 *  - `unknown` — the device cannot tell yet (the first moments after boot).
 */
export type SensorState = 'ok' | 'fault' | 'unknown';

/**
 * An object rather than a bare `SensorState` string so a later firmware can
 * add a field here — a fault count, a last-good timestamp — without it being a
 * breaking change to the payload's shape.
 */
export interface SensorHealth {
  state: SensorState;
}

/**
 * Who the app is talking to, what it is running, and whether it is well.
 *
 * Everything here is device-reported fact. There is deliberately no message,
 * error or hint string: wording belongs to the app (see `ui/messages.ts`), so
 * that the sentence a customer reads can change without reflashing a board.
 */
export interface DeviceInfo {
  /** Version of this contract. Integer. See PROTOCOL_MIN_SUPPORTED. */
  protocol: number;
  /** Stable for the life of the board — MAC-derived, never per-boot. */
  device_id: string;
  /** Human-readable, and distinct between two boards out of the box. */
  name: string;
  /** Display only. Null when the board does not say. */
  model: string | null;
  /** The board's software build. Display only — never a compatibility input. */
  firmware: string;
  /** Whole seconds since boot, or null. A reset here also explains a `seq` restart. */
  uptime_s: number | null;
  /** Bytes free on the device's filesystem partition, or null. */
  free_storage_bytes: number | null;
  sensors: {
    distance: SensorHealth;
    light: SensorHealth;
  };
}

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
   * Who this is, what it is running, and whether its sensors are answering.
   *
   * The first call the app makes and the only one whose answer it acts on
   * before trusting the rest: a device whose `protocol` is outside
   * `PROTOCOL_MIN_SUPPORTED`..`PROTOCOL_MAX_SUPPORTED` is not guided at all,
   * because an app that misreads a contract it does not know produces
   * confidently wrong numbers rather than a visible failure.
   *
   * Rejects rather than resolves when the payload is not a well-formed
   * `DeviceInfo` — for the same reason `getActiveTarget()` does. "Something
   * answered but we could not understand it" and "a LightGuide answered" must
   * never collapse into one another, or the app ends up showing a device
   * screen full of blanks for a web server that is not a device at all.
   */
  getInfo(): Promise<DeviceInfo>;
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
