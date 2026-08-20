/**
 * Arrival detection: recognising the *moment* guidance goes from not-settled
 * to settled, as opposed to the ongoing fact that it is settled.
 *
 * This exists because the guidance screen is the one channel a photographer
 * cannot use while they are two metres away with both hands on the stand. The
 * out-of-band channels that reach them there — a buzz, a short tone — are
 * events, not states: they can only be fired once, at the transition. Firing
 * them from the settled *state* would buzz continuously.
 *
 * The live screen re-renders roughly twice a second from the store's heartbeat
 * (see `tick` in store.ts) whether or not anything changed, so "settled is
 * true right now" is observed over and over for a single arrival. Detection
 * therefore has to compare against what was last observed, which is what makes
 * it worth pulling out of the component: it is a two-line state machine whose
 * three interesting behaviours (fire once, don't re-fire, re-arm) are exactly
 * the ones a re-render storm breaks.
 *
 * Pure and allocation-only: no timers, no browser APIs, no clock. The caller
 * owns the state (a ref in the component) and threads it through, the same
 * arrangement `guidance/stability.ts` uses.
 */

export interface ArrivalState {
  /**
   * The last settled value observed, or null before anything has been
   * observed at all. The null is load-bearing: it is what distinguishes
   * "opened already settled" (no arrival happened — the user was never
   * elsewhere) from "crossed into tolerance" (an arrival happened).
   */
  readonly seen: boolean | null;
}

export interface ArrivalStep {
  readonly state: ArrivalState;
  /** True on exactly the render where not-settled became settled. */
  readonly arrived: boolean;
}

/** A tracker that has observed nothing yet. */
export function createArrivalState(): ArrivalState {
  return { seen: null };
}

/**
 * Folds one observation of `settled` into the tracker.
 *
 * `arrived` is true only for a genuine false -> true edge:
 *
 * - first observation, whatever its value -> false. Mounting the screen onto
 *   an already-settled stand is not an arrival; nobody walked anywhere.
 * - true -> true (every heartbeat re-render while settled) -> false.
 * - true -> false -> true (drifted out, adjusted back in) -> true. The cue
 *   re-arms itself; there is no latch to clear.
 *
 * Never mutates `state`; returns the next one.
 */
export function observeSettled(state: ArrivalState, settled: boolean): ArrivalStep {
  return { state: { seen: settled }, arrived: state.seen === false && settled };
}
