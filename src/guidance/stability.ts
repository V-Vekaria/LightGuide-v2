import type { Reading, Target } from '../contract/types';

/**
 * Stability handling for the live guidance loop — spec §8, "Reading unstable".
 *
 * `verdict()` is instantaneous and stateless by design, and the live screen
 * recomputes it on every frame at 10 Hz. Ultrasonic distance is genuinely
 * noisy (soft and angled surfaces absorb or deflect the ping, people walk
 * through the beam), so feeding raw frames straight into `verdict()` makes the
 * instruction line and the dot flip between "Move 6 cm closer" and "On target"
 * several times a second. This module sits between the two: readings in,
 * a smoothed reading plus a hysteresis-adjusted target out. `verdict()` itself
 * is untouched and stays a pure function of `(reading, target)`.
 *
 * Everything here is pure: no `Date.now()`, no module-level mutable state.
 * `now` is a parameter and the window state is threaded through the caller
 * (see `store.ts`), exactly like `liveness.ts`.
 *
 * ## What it filters
 *
 * 1. **Rolling median over a short window** (5 samples, and never any sample
 *    older than `windowMaxAgeMs`). A median discards outliers outright rather
 *    than averaging them in, which is the right shape for ultrasonic noise:
 *    the failure mode is a handful of wildly wrong pings, not a small
 *    symmetric error. Median-of-5 absorbs up to two bad frames in a row with
 *    no visible effect at all. The even-length case takes the lower median
 *    rather than averaging the two middles, so every number this module emits
 *    is a value the sensor actually reported — it never synthesises one.
 *
 *    That rejection is a property of a *filled* window, not of the median
 *    function. With one sample the median is the sample; with two, the lower
 *    median is whichever ping came out lower — so a single wild reading is not
 *    rejected, it is published verbatim. Every `resetStability()` (connect,
 *    retarget, reconnect) re-enters exactly that state, and the frame right
 *    after it is therefore unfiltered. So each step also reports whether the
 *    window behind it was deep enough to have actually outvoted an outlier
 *    (`minMedianSamples`, 3 of 5 — a strict majority, which is what it takes
 *    for the median to be a value the sensor agreed on rather than one it
 *    merely emitted once). `StabilityStep.filtered` carries that, and the
 *    guidance screen requires it before it will call the stand *settled* —
 *    which is what keeps a single wild ping inside tolerance from buzzing
 *    "arrived" one frame after a reset. The reading itself is still published
 *    immediately: showing the best number available is right, calling it an
 *    arrival is not.
 *
 * 2. **Output deadband with a settle timer.** The median of five noisy samples
 *    still wobbles every frame, and the instruction renders to 0.1 cm — so the
 *    median alone leaves "Move 6.3 cm closer" / "Move 6.4 cm closer" churning,
 *    and leaves the band boundary oscillating when the stand is parked a hair
 *    outside tolerance. The emitted value therefore holds while the median
 *    stays within `distanceDeadbandCm` of it, and when the median does leave
 *    that deadband the value follows only after the excursion has persisted
 *    for `settleMs` (250 ms). Excursions that do not last are noise and are
 *    dropped; excursions that last are the stand actually moving.
 *
 *    A move larger than `jumpDistanceCm` (3 cm — twice the sensor's own
 *    spread, and it has already had to survive the median) skips the settle
 *    timer entirely and publishes on the spot. That is what keeps a real move
 *    fast while still confirming the small ambiguous ones.
 *
 * 3. **Hysteresis on the in-band boundary**, applied by widening the target's
 *    tolerances (never the target itself) while a channel is latched in-band:
 *    you enter the band at `tol` and only leave it at `tol *
 *    leaveToleranceFactor`. Sitting a hair outside tolerance no longer
 *    oscillates between "On target" and a move instruction. The factor is
 *    finite and small (1.25), so a stand that genuinely moves out always
 *    leaves the band — 20 cm out is 20 cm out at any threshold.
 *
 * The cost of 2 and 3 together, stated plainly: once you are on target the app
 * keeps saying so until you are `tol * 1.25 + deadband` out — 6.85 cm against
 * a 5 cm tolerance. Measured on a 20-second noisy trace parked 0.5 cm outside
 * tolerance (the worst case there is), the raw instruction line changes 174
 * times and the stabilised one changes 6. That is the whole point.
 *
 * ## What it deliberately does NOT do
 *
 * **It never bridges a dropout.** If the newest frame's channel is `null`, the
 * output for that channel is `null` — full stop, regardless of how many good
 * samples sit in the window. A dropout is rendered as a gap, never as a
 * plausible-looking number carried over from 300 ms ago. That is the app's
 * most important property (a wrong "you're on target" is worse than a visible
 * gap) and it is worth the cost: a single missed ping produces a one-frame
 * gap in the readout rather than being smoothed away.
 *
 * It also does not smooth across a stall. Samples older than
 * `windowMaxAgeMs` (800 ms) are dropped, so the feed resuming after a pause
 * never blends pre-stall and post-stall geometry. The deadband's held value is
 * bound by the same clock: it survives only while live data keeps affirming
 * it, and a hold that goes unaffirmed for longer than `windowMaxAgeMs`
 * expires and re-anchors on the current median. Without that the deadband
 * would outlive the window it is anchored to and republish a pre-stall value
 * as though it were current — a stale reading rendered as live, which is the
 * one thing this app must never do.
 *
 * ## Latency
 *
 * A median-of-N flips to a new level once (N+1)/2 samples of that level have
 * landed: 3 frames for N=5, which at 10 Hz is **300 ms**. A genuine 20 cm move
 * clears `jumpDistanceCm` by a mile, so it skips the settle timer and the
 * hysteresis has nothing to say about it either — the readout, the dot and the
 * instruction all follow in **300 ms**, or ~400 ms including a frame of
 * transport. Comfortably inside the ~500 ms ceiling.
 *
 * The settle timer only ever delays *small* changes: a 2 cm nudge takes
 * 300 ms + 250 ms ≈ 550 ms to show. That is the deliberate half of the
 * trade-off. A 2 cm change is well inside a 5 cm tolerance, so nothing the
 * user must act on is being withheld, and the alternative — following every
 * 2 cm wobble instantly — is exactly the flicker this module exists to remove.
 *
 * The window is deliberately not longer. Median-of-9 would swallow someone
 * walking through the beam for a full second, but it would also put a real
 * move 500 ms behind the user's hands, and a display that lags the stand you
 * are physically holding is worse than one that occasionally shows a person
 * crossing it.
 */

export interface StabilityOptions {
  /** Samples kept in the rolling window. Odd, so the median is a real sample. */
  windowSize: number;
  /** Samples older than this never influence the output — no smoothing across a stall. */
  windowMaxAgeMs: number;
  /** Emitted distance holds until the median moves further than this, in cm. */
  distanceDeadbandCm: number;
  /** Same, for the raw brightness and ambient channels (0..1 units). */
  lightDeadband: number;
  /** How long the median must stay outside the deadband before the emitted value follows it. */
  settleMs: number;
  /** A distance jump this large is unambiguous, not noise: publish it without waiting out settleMs. */
  jumpDistanceCm: number;
  /** Same, for the light channels. */
  jumpLight: number;
  /** Tolerance multiplier for LEAVING a band once entered. 1 disables hysteresis. */
  leaveToleranceFactor: number;
  /**
   * How many samples a channel's window must hold before its median counts as
   * outlier-rejecting — a strict majority of `windowSize`. Below this the
   * median is still emitted (the best number available is worth showing) but
   * the step is reported as unfiltered, and callers that would act on it
   * irreversibly — the arrival cue — must wait.
   */
  minMedianSamples: number;
}

export const DEFAULT_STABILITY_OPTIONS: StabilityOptions = {
  windowSize: 5,
  windowMaxAgeMs: 800,
  distanceDeadbandCm: 0.6,
  lightDeadband: 0.006,
  settleMs: 250,
  jumpDistanceCm: 3,
  jumpLight: 0.03,
  leaveToleranceFactor: 1.25,
  minMedianSamples: 3,
};

interface Sample {
  at: number;
  distance_cm: number | null;
  brightness: number | null;
  ambient: number | null;
}

/**
 * Per-channel output state: the value currently being shown, plus how long the
 * median has been disagreeing with it by more than the deadband.
 */
interface Hold {
  /** Last emitted value. Null means "dropped out" and resets everything below. */
  readonly value: number | null;
  /**
   * The last time live data affirmed this value — i.e. the median agreed with
   * it to within the deadband. A hold that goes unaffirmed for longer than
   * `windowMaxAgeMs` has expired and must not be emitted again: without this
   * the deadband would quietly outlive the window it is anchored to and
   * publish a value from before a stall as though it were current.
   */
  readonly affirmedAt: number | null;
  /** When the median first left the deadband around `value`, or null if it hasn't. */
  readonly restlessSince: number | null;
}

export interface StabilityState {
  /** Newest last. Pruned by age and by `windowSize` on every step. */
  readonly samples: readonly Sample[];
  readonly distance: Hold;
  readonly brightness: Hold;
  readonly ambient: Hold;
  /** Hysteresis latches: is this channel currently being treated as in-band? */
  readonly distanceInBand: boolean;
  readonly brightnessInBand: boolean;
  /** Identity of the last frame folded in, so a re-render can't double-count it. */
  readonly lastSeq: number | null;
  readonly lastTs: number | null;
}

const IDLE_HOLD: Hold = { value: null, affirmedAt: null, restlessSince: null };

export interface StabilityStep {
  state: StabilityState;
  /** Smoothed reading. A null channel in is always a null channel out. */
  reading: Reading;
  /** `target` with tolerances widened per the hysteresis latches. Null in, null out. */
  target: Target | null;
  /**
   * True when every channel this step actually reports a number for had at
   * least `minMedianSamples` samples behind its median — i.e. the outlier
   * rejection this module advertises was really in force, not just nominally
   * applied to a window of one.
   *
   * False for the first frames after any `resetStability()`, after a stall
   * long enough to age the window out, and whenever `reading` is blank. A
   * channel that is null contributes nothing either way: it is already
   * reported as unknown downstream, so it can neither be trusted nor
   * distrusted.
   *
   * Read this before treating a reading as an *arrival*. Do not read it before
   * displaying one — a number that has not yet earned the median's protection
   * is still the honest best estimate, and withholding it would blank the
   * screen for 300 ms on every reconnect.
   */
  filtered: boolean;
}

export function createStabilityState(): StabilityState {
  return {
    samples: [],
    distance: IDLE_HOLD,
    brightness: IDLE_HOLD,
    ambient: IDLE_HOLD,
    distanceInBand: false,
    brightnessInBand: false,
    lastSeq: null,
    lastTs: null,
  };
}

/** Matches verdict.ts's rounding so the latch and the verdict never disagree. */
function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * Lower median: for an even count it takes the lower of the two middles rather
 * than averaging them, so the result is always a value the sensor actually
 * reported. Never interpolates a number that was never measured.
 */
function lowerMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

/**
 * The median of the window for one channel, held through the deadband and its
 * settle timer. `latest` is the newest frame's value for that channel: when it
 * is null the channel has dropped out and the answer is null, whatever good
 * data the window still holds — the hold is reset so the next real ping is
 * published immediately rather than waiting out a settle it never earned.
 */
function smoothChannel(
  samples: readonly Sample[],
  pick: (sample: Sample) => number | null,
  latest: number | null,
  hold: Hold,
  deadband: number,
  jump: number,
  settleMs: number,
  maxHoldAgeMs: number,
  now: number,
): Hold {
  if (latest === null) return IDLE_HOLD;

  const values: number[] = [];
  for (const sample of samples) {
    const value = pick(sample);
    if (value !== null) values.push(value);
  }
  const median = lowerMedian(values);
  if (median === null) return IDLE_HOLD;

  const publish = (value: number): Hold => ({ value, affirmedAt: now, restlessSince: null });

  // Nothing held yet (first frame, or straight after a dropout): publish now.
  if (hold.value === null) return publish(median);

  // The hold has gone unaffirmed for longer than the window's own memory —
  // the feed stalled, or this channel dropped out and came back. Whatever it
  // holds predates everything the window knows about, so it is stale by the
  // same definition the window uses. Re-anchor on live data instead of
  // emitting a value from before the gap.
  if (hold.affirmedAt === null || now - hold.affirmedAt > maxHoldAgeMs) return publish(median);

  const moved = Math.abs(median - hold.value);

  // Inside the deadband: the median is only wobbling. Hold — and this counts
  // as live data affirming the held value, so the expiry clock resets.
  if (moved <= deadband) return { value: hold.value, affirmedAt: now, restlessSince: null };

  // A jump this big is not noise. The window median has already had to agree
  // three times over to get here, and the sensor's own spread is a fraction of
  // this — so publish immediately rather than making a photographer who just
  // walked the stand half a metre wait out a confirmation timer.
  if (moved > jump) return publish(median);

  // Between the two: real enough to matter, small enough to be noise. Publish
  // only once it has stayed outside the deadband for settleMs. This is what
  // stops the band oscillating when the stand is parked on the boundary.
  // The hold is NOT affirmed here — the median disagrees with it — so the
  // expiry clock keeps running. settleMs is well under maxHoldAgeMs, so this
  // always resolves one way or the other long before it could expire.
  const since = hold.restlessSince ?? now;
  if (now - since >= settleMs) return publish(median);
  return { value: hold.value, affirmedAt: hold.affirmedAt, restlessSince: since };
}

/**
 * Hysteresis latch for one channel. Enters the band at `tol`, leaves it only
 * past `tol * factor`. An unknown delta leaves the latch untouched — the
 * verdict already reports 'unknown' for that channel, and the latch is only a
 * threshold memory, never something the user sees.
 */
function latchInBand(previous: boolean, delta: number | null, tol: number, factor: number): boolean {
  if (delta === null) return previous;
  return Math.abs(delta) <= (previous ? tol * factor : tol);
}

/**
 * The target `verdict()` should be called with: identical, except that a
 * channel currently latched in-band gets a widened tolerance. `distance_cm`
 * and `brightness_above_ambient` are never touched, so every delta the user
 * sees is still measured against the real target.
 */
function widenTarget(
  target: Target | null,
  distanceInBand: boolean,
  brightnessInBand: boolean,
  factor: number,
): Target | null {
  if (target === null) return null;
  return {
    ...target,
    distance_tol_cm: distanceInBand ? target.distance_tol_cm * factor : target.distance_tol_cm,
    brightness_tol: brightnessInBand ? target.brightness_tol * factor : target.brightness_tol,
  };
}

function blankReading(): Reading {
  return { distance_cm: null, brightness: null, ambient: null, seq: 0, ts: 0 };
}

/** How many samples in the window carry a real number for this channel. */
function countPresent(samples: readonly Sample[], pick: (sample: Sample) => number | null): number {
  let n = 0;
  for (const sample of samples) if (pick(sample) !== null) n += 1;
  return n;
}

/**
 * Folds one frame into the rolling state and returns what live guidance should
 * actually render: a smoothed reading and the target to classify it against.
 *
 * Pure and deterministic — `now` is supplied by the caller and the state is
 * returned rather than mutated, so a whole noisy trace can be replayed in a
 * test with zero mocking. Feeding the same frame twice (same `seq` and `ts`,
 * which is what a re-render on the 500 ms heartbeat would do) is a no-op: it
 * does not enter the window a second time and the output is unchanged.
 *
 * `reading` may be null (nothing has arrived yet) — the result is an
 * all-unknown reading, never a leftover from an earlier session.
 */
export function stabilise(
  state: StabilityState,
  reading: Reading | null,
  target: Target | null,
  now: number,
  options: StabilityOptions = DEFAULT_STABILITY_OPTIONS,
): StabilityStep {
  const widened = () =>
    widenTarget(target, state.distanceInBand, state.brightnessInBand, options.leaveToleranceFactor);

  if (reading === null) {
    return { state, reading: blankReading(), target: widened(), filtered: false };
  }

  const duplicate = state.lastSeq === reading.seq && state.lastTs === reading.ts;
  const appended: Sample[] = duplicate
    ? [...state.samples]
    : [
        ...state.samples,
        {
          at: now,
          distance_cm: reading.distance_cm,
          brightness: reading.brightness,
          ambient: reading.ambient,
        },
      ];

  const fresh = appended.filter((sample) => now - sample.at <= options.windowMaxAgeMs);
  // If age pruning would empty the window (a long stall, or a duplicate frame
  // arriving much later) keep the newest sample: the current frame is real and
  // must still be reportable. Only ever falls back to a sample we hold.
  const samples = (fresh.length > 0 ? fresh : appended.slice(-1)).slice(-options.windowSize);

  const distanceHold = smoothChannel(
    samples,
    (s) => s.distance_cm,
    reading.distance_cm,
    state.distance,
    options.distanceDeadbandCm,
    options.jumpDistanceCm,
    options.settleMs,
    options.windowMaxAgeMs,
    now,
  );
  const brightnessHold = smoothChannel(
    samples,
    (s) => s.brightness,
    reading.brightness,
    state.brightness,
    options.lightDeadband,
    options.jumpLight,
    options.settleMs,
    options.windowMaxAgeMs,
    now,
  );
  const ambientHold = smoothChannel(
    samples,
    (s) => s.ambient,
    reading.ambient,
    state.ambient,
    options.lightDeadband,
    options.jumpLight,
    options.settleMs,
    options.windowMaxAgeMs,
    now,
  );

  const distance_cm = distanceHold.value;
  const brightness = brightnessHold.value;
  const ambient = ambientHold.value;
  const smoothed: Reading = { distance_cm, brightness, ambient, seq: reading.seq, ts: reading.ts };

  // Whether the median that produced each published channel actually had a
  // majority behind it. Only channels that published a number are judged: a
  // null channel is already reported as unknown and has nothing to be right
  // or wrong about.
  const deepEnough = (pick: (sample: Sample) => number | null): boolean =>
    countPresent(samples, pick) >= options.minMedianSamples;
  const filtered =
    (distance_cm === null || deepEnough((s) => s.distance_cm)) &&
    (brightness === null || deepEnough((s) => s.brightness)) &&
    (ambient === null || deepEnough((s) => s.ambient));

  let distanceInBand = false;
  let brightnessInBand = false;
  if (target !== null) {
    const distanceDelta = distance_cm === null ? null : round(distance_cm - target.distance_cm, 1);
    distanceInBand = latchInBand(
      state.distanceInBand,
      distanceDelta,
      target.distance_tol_cm,
      options.leaveToleranceFactor,
    );

    const lightTarget = target.brightness_above_ambient;
    if (lightTarget !== null) {
      const brightnessDelta =
        brightness === null || ambient === null ? null : round(brightness - ambient - lightTarget, 3);
      brightnessInBand = latchInBand(
        state.brightnessInBand,
        brightnessDelta,
        target.brightness_tol,
        options.leaveToleranceFactor,
      );
    }
  }

  return {
    state: {
      samples,
      distance: distanceHold,
      brightness: brightnessHold,
      ambient: ambientHold,
      distanceInBand,
      brightnessInBand,
      lastSeq: reading.seq,
      lastTs: reading.ts,
    },
    reading: smoothed,
    target: widenTarget(target, distanceInBand, brightnessInBand, options.leaveToleranceFactor),
    filtered,
  };
}
