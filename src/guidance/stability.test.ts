import { describe, it, expect } from 'vitest';
import {
  createStabilityState,
  stabilise,
  DEFAULT_STABILITY_OPTIONS,
  type StabilityState,
} from './stability';
import { verdict } from './verdict';
import type { Reading, Target } from '../contract/types';

/** The device streams at 10 Hz, so one frame is 100 ms. */
const FRAME_MS = 100;
/** The ceiling the brief sets on how long a genuine move may take to show. */
const LATENCY_BUDGET_MS = 500;

const target: Target = {
  distance_cm: 50,
  distance_tol_cm: 5,
  brightness_above_ambient: null,
  brightness_tol: 0.08,
};

const lightTarget: Target = { ...target, brightness_above_ambient: 0.5 };

function frame(seq: number, over: Partial<Reading> = {}): Reading {
  return { distance_cm: 50, brightness: null, ambient: null, seq, ts: seq * FRAME_MS, ...over };
}

/**
 * Deterministic LCG. A stability filter has to be judged against a noise trace,
 * and a reproducible one beats a mocked random every time — the same trace
 * fails the same way for whoever reads this test next.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

interface Replay {
  raw: string[];
  stable: string[];
  bands: string[];
  distances: (number | null)[];
}

/** Replays a distance trace through both the raw and the stabilised path. */
function replay(trace: (number | null)[], t: Target = target): Replay {
  let state = createStabilityState();
  const out: Replay = { raw: [], stable: [], bands: [], distances: [] };
  trace.forEach((distance_cm, i) => {
    const r = frame(i, { distance_cm });
    out.raw.push(verdict(r, t).instruction);
    const step = stabilise(state, r, t, i * FRAME_MS);
    state = step.state;
    const v = verdict(step.reading, step.target ?? t);
    out.stable.push(v.instruction);
    out.bands.push(v.distance_state);
    out.distances.push(step.reading.distance_cm);
  });
  return out;
}

/** How many times the line changed — the thing the user actually sees flicker. */
function changes(list: readonly string[]): number {
  let n = 0;
  for (let i = 1; i < list.length; i += 1) if (list[i] !== list[i - 1]) n += 1;
  return n;
}

describe('stabilise — noise rejection', () => {
  it('holds one instruction through noise that makes the raw verdict flicker', () => {
    // The stand is parked 55.5 cm out: half a centimetre outside a 5 cm
    // tolerance, i.e. inside the sensor's own noise of the boundary. Plus the
    // real ultrasonic failure mode — the occasional badly wrong ping off a
    // soft or angled surface.
    const random = rng(20260819);
    const trace: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const gross = random() < 0.08;
      trace.push(gross ? 55.5 * 0.5 : 55.5 + (random() - 0.5) * 3);
    }

    const { raw, stable, bands } = replay(trace);

    // Without stability the instruction line is unusable: over these 20 seconds
    // it changes 174 times — several times a second, exactly as spec §8 warns.
    expect(changes(raw)).toBeGreaterThan(150);

    // With it, the instruction changes a handful of times over the same trace:
    // more than an order of magnitude fewer, and the on-target/off-target call
    // — the one that flips the colour and the whole meaning — barely moves.
    expect(changes(stable)).toBeLessThanOrEqual(8);
    expect(changes(stable)).toBeLessThan(changes(raw) / 20);
    expect(changes(bands)).toBeLessThanOrEqual(6);
  });

  it('does not flicker at all when the stand is genuinely on target', () => {
    const random = rng(7);
    const trace = Array.from({ length: 200 }, () =>
      random() < 0.08 ? 25 : 50 + (random() - 0.5) * 3,
    );
    const { raw, stable } = replay(trace);
    expect(changes(raw)).toBeGreaterThan(20);
    // One change: the warm-up frame before the window has anything to work with.
    expect(changes(stable)).toBeLessThanOrEqual(2);
    expect(stable[stable.length - 1]).toBe('On target');
  });

  it('rejects a burst of gross outliers outright — someone walking through the beam', () => {
    // Five good frames, then two frames of a person crossing at 20 cm, then good again.
    const trace = [50, 50, 50, 50, 50, 20, 20, 50, 50, 50];
    const { stable } = replay(trace);
    // Median-of-5 absorbs up to two bad frames with no visible effect at all.
    expect(new Set(stable).size).toBe(1);
    expect(stable[0]).toBe('On target');
  });
});

describe('stabilise — latency', () => {
  it('shows a genuine 20 cm move within the 500 ms budget', () => {
    const steady = Array.from({ length: 15 }, () => 50);
    const moved = Array.from({ length: 15 }, () => 70);
    const { stable, distances } = replay([...steady, ...moved]);

    const stepIndex = steady.length;
    const settledAt = distances.findIndex((d, i) => i >= stepIndex && d === 70);
    expect(settledAt).toBeGreaterThan(-1);

    const latencyMs = (settledAt - stepIndex + 1) * FRAME_MS;
    // Median-of-5 flips once three samples of the new level have landed: 300 ms.
    expect(latencyMs).toBe(300);
    expect(latencyMs).toBeLessThanOrEqual(LATENCY_BUDGET_MS);
    expect(stable[settledAt]).toBe('Move 20 cm closer');
  });

  it('shows a genuine move inside the budget even with the sensor noisy', () => {
    const random = rng(7);
    const noisy = (base: number) => base + (random() - 0.5) * 3;
    const trace = [
      ...Array.from({ length: 15 }, () => noisy(50)),
      ...Array.from({ length: 15 }, () => noisy(70)),
    ];
    const { distances } = replay(trace);

    const stepIndex = 15;
    const settledAt = distances.findIndex((d, i) => i >= stepIndex && d !== null && d > 68.5);
    expect(settledAt).toBeGreaterThan(-1);
    expect((settledAt - stepIndex + 1) * FRAME_MS).toBeLessThanOrEqual(LATENCY_BUDGET_MS);
  });
});

describe('stabilise — dropouts are never bridged', () => {
  it('turns a null distance into a null distance, never a number', () => {
    let state = createStabilityState();
    // Fill the window with perfectly good readings first, so there is plenty
    // of plausible-looking data to fabricate from.
    for (let i = 0; i < 5; i += 1) {
      state = stabilise(state, frame(i, { distance_cm: 50 }), target, i * FRAME_MS).state;
    }

    const dropout = stabilise(state, frame(5, { distance_cm: null }), target, 5 * FRAME_MS);
    expect(dropout.reading.distance_cm).toBeNull();
    expect(verdict(dropout.reading, dropout.target ?? target).instruction).toBe(
      'Waiting for a clear reading',
    );
    expect(verdict(dropout.reading, dropout.target ?? target).trustworthy).toBe(false);

    // And it recovers on the next real ping rather than staying blanked.
    const back = stabilise(dropout.state, frame(6, { distance_cm: 50 }), target, 6 * FRAME_MS);
    expect(back.reading.distance_cm).toBe(50);
  });

  it('does not bridge a dropout on the light channel either', () => {
    let state = createStabilityState();
    for (let i = 0; i < 5; i += 1) {
      const r = frame(i, { distance_cm: 50, brightness: 0.6, ambient: 0.1 });
      state = stabilise(state, r, lightTarget, i * FRAME_MS).state;
    }
    const step = stabilise(
      state,
      frame(5, { distance_cm: 50, brightness: null, ambient: 0.1 }),
      lightTarget,
      5 * FRAME_MS,
    );
    expect(step.reading.brightness).toBeNull();
    // The other axis is untouched — distance keeps reporting.
    expect(step.reading.distance_cm).toBe(50);
  });

  it('smooths the light channels too, without crossing them over', () => {
    let state = createStabilityState();
    // Brightness spikes on one frame; ambient is rock steady. Only brightness
    // should be affected, and the spike should not survive the median.
    const brightnesses = [0.6, 0.6, 0.95, 0.6, 0.6, 0.6];
    let last = stabilise(state, frame(0, { brightness: 0.6, ambient: 0.1 }), lightTarget, 0);
    brightnesses.forEach((brightness, i) => {
      last = stabilise(
        state,
        frame(i, { distance_cm: 50, brightness, ambient: 0.1 }),
        lightTarget,
        i * FRAME_MS,
      );
      state = last.state;
    });
    expect(last.reading.brightness).toBe(0.6);
    expect(last.reading.ambient).toBe(0.1);
    expect(verdict(last.reading, last.target ?? lightTarget).instruction).toBe('On target');
  });

  it('only ever emits a value the sensor actually reported', () => {
    const random = rng(99);
    const trace = Array.from({ length: 120 }, () => 50 + (random() - 0.5) * 6);
    const reported = new Set(trace);
    const { distances } = replay(trace);
    for (const d of distances) {
      if (d !== null) expect(reported.has(d)).toBe(true);
    }
  });
});

describe('stabilise — hysteresis', () => {
  /**
   * Holds the stand still at `distance` for `frames` frames and returns the
   * final step, so a test can express "park it here, then park it there".
   */
  function park(distance: number, frames = 8, from?: { state: StabilityState; seq: number }) {
    let state = from?.state ?? createStabilityState();
    let seq = from?.seq ?? 0;
    let last = stabilise(state, frame(seq, { distance_cm: distance }), target, seq * FRAME_MS);
    for (let i = 0; i < frames; i += 1) {
      last = stabilise(state, frame(seq, { distance_cm: distance }), target, seq * FRAME_MS);
      state = last.state;
      seq += 1;
    }
    return { ...last, seq };
  }

  const instructionOf = (step: { reading: Reading; target: Target | null }) =>
    verdict(step.reading, step.target ?? target).instruction;

  it('does not re-issue a move instruction for drift inside the leave threshold', () => {
    // Settle on target, then drift to 6 cm out — past the 5 cm tolerance but
    // inside the 1.25x leave threshold of 6.25 cm.
    const settled = park(50);
    expect(instructionOf(settled)).toBe('On target');

    const drifted = park(56, 8, { state: settled.state, seq: settled.seq });
    expect(drifted.reading.distance_cm).toBe(56);
    expect(instructionOf(drifted)).toBe('On target');

    // Arriving at the same 56 cm *without* having been in band first is
    // classified as out — the hysteresis is a latch, not a wider tolerance.
    expect(instructionOf(park(56))).toBe('Move 6 cm closer');
  });

  it('always lets a genuine move leave the in-band state', () => {
    const settled = park(50);
    const out = park(57, 8, { state: settled.state, seq: settled.seq });
    expect(verdict(out.reading, out.target ?? target).distance_state).toBe('over');
    expect(instructionOf(out)).toBe('Move 7 cm closer');

    // And a big move is never held back at all.
    const wayOut = park(90, 8, { state: out.state, seq: out.seq });
    expect(instructionOf(wayOut)).toBe('Move 40 cm closer');
  });

  it('never widens the tolerance by more than the stated factor', () => {
    const settled = park(50);
    expect(settled.target?.distance_tol_cm).toBe(
      target.distance_tol_cm * DEFAULT_STABILITY_OPTIONS.leaveToleranceFactor,
    );
    // The target itself is never moved — only the classification threshold.
    expect(settled.target?.distance_cm).toBe(target.distance_cm);

    // Out of band, the tolerance is the real one, untouched.
    const out = park(70);
    expect(out.target?.distance_tol_cm).toBe(target.distance_tol_cm);
  });
});

describe('stabilise — settle timer', () => {
  it('makes a small change wait to be confirmed, but publishes a big one at once', () => {
    let state = createStabilityState();
    for (let i = 0; i < 6; i += 1) {
      state = stabilise(state, frame(i, { distance_cm: 50 }), target, i * FRAME_MS).state;
    }
    const settled = state;

    // A 2 cm nudge is inside the jump threshold, so it is confirmed first: the
    // median reaches it in 3 frames, then settleMs has to elapse.
    let s = settled;
    const nudged: (number | null)[] = [];
    for (let i = 0; i < 8; i += 1) {
      const seq = 6 + i;
      const step = stabilise(s, frame(seq, { distance_cm: 52 }), target, seq * FRAME_MS);
      s = step.state;
      nudged.push(step.reading.distance_cm);
    }
    const nudgeShownAt = nudged.findIndex((d) => d === 52);
    expect(nudgeShownAt).toBeGreaterThan(2);
    expect((nudgeShownAt + 1) * FRAME_MS).toBeLessThanOrEqual(600);

    // A 20 cm move skips the settle timer entirely: it lands the moment the
    // median agrees, three frames in.
    let big = settled;
    const moved: (number | null)[] = [];
    for (let i = 0; i < 8; i += 1) {
      const seq = 6 + i;
      const step = stabilise(big, frame(seq, { distance_cm: 70 }), target, seq * FRAME_MS);
      big = step.state;
      moved.push(step.reading.distance_cm);
    }
    expect(moved.findIndex((d) => d === 70)).toBe(2);
  });
});

describe('stabilise — window hygiene', () => {
  it('ignores a frame it has already folded in', () => {
    let state = createStabilityState();
    for (let i = 0; i < 5; i += 1) {
      state = stabilise(state, frame(i, { distance_cm: 50 }), target, i * FRAME_MS).state;
    }
    // A re-render on the 500 ms heartbeat replays the same frame. It must not
    // enter the window again and skew the median toward the stalest value.
    const repeat = frame(9, { distance_cm: 80 });
    const first = stabilise(state, repeat, target, 500);
    const second = stabilise(first.state, repeat, target, 550);
    const third = stabilise(second.state, repeat, target, 600);
    expect(second.reading.distance_cm).toBe(first.reading.distance_cm);
    expect(third.reading.distance_cm).toBe(first.reading.distance_cm);
    // Folded in exactly once, however many times the component re-renders.
    const count = (s: typeof third.state) =>
      s.samples.filter((sample) => sample.distance_cm === 80).length;
    expect(count(first.state)).toBe(1);
    expect(count(second.state)).toBe(1);
    expect(count(third.state)).toBe(1);
  });

  it('never blends readings from either side of a stall', () => {
    let state = createStabilityState();
    for (let i = 0; i < 5; i += 1) {
      state = stabilise(state, frame(i, { distance_cm: 50 }), target, i * FRAME_MS).state;
    }
    // Feed resumes five seconds later, somewhere completely different.
    const after = stabilise(state, frame(5, { distance_cm: 90 }), target, 5_400);
    expect(after.reading.distance_cm).toBe(90);
    expect(after.state.samples.length).toBe(1);
  });

  it('expires a held value rather than republishing it after a stall', () => {
    // Regression: the deadband hold used to have no expiry, so it outlived the
    // window it is anchored to. A small change after a long gap would be
    // swallowed and the PRE-stall value re-emitted as live — a stale reading
    // rendered as current, which is exactly what must never happen.
    let state = createStabilityState();
    for (let i = 0; i < 5; i += 1) {
      state = stabilise(state, frame(i, { distance_cm: 50 }), target, i * FRAME_MS).state;
    }

    // 51 cm is inside the jump threshold, so nothing but the expiry can let it
    // through — and after three seconds of silence it must.
    const after = stabilise(state, frame(5, { distance_cm: 51 }), target, 3_400);
    expect(after.reading.distance_cm).toBe(51);
  });

  it('keeps holding while live data affirms the held value', () => {
    // The flip side: a hold that every frame agrees with must not expire just
    // because it has been held for a while. Ten seconds of steady 50s with the
    // median wobbling inside the deadband stays put.
    const random = rng(4242);
    let state = createStabilityState();
    const emitted: (number | null)[] = [];
    for (let i = 0; i < 100; i += 1) {
      const step = stabilise(
        state,
        frame(i, { distance_cm: 50 + (random() - 0.5) * 0.8 }),
        target,
        i * FRAME_MS,
      );
      state = step.state;
      emitted.push(step.reading.distance_cm);
    }
    // One settled value across the whole run, not one that re-anchors every 800ms.
    expect(new Set(emitted.slice(5)).size).toBe(1);
  });

  it('handles a null reading without inventing anything', () => {
    const step = stabilise(createStabilityState(), null, target, 0);
    expect(step.reading.distance_cm).toBeNull();
    expect(step.reading.brightness).toBeNull();
    expect(step.reading.ambient).toBeNull();
    expect(verdict(step.reading, target).trustworthy).toBe(false);
  });

  it('is pure — the state passed in is never mutated', () => {
    const state = createStabilityState();
    const snapshot = JSON.stringify(state);
    stabilise(state, frame(0, { distance_cm: 50 }), target, 0);
    stabilise(state, frame(1, { distance_cm: 90 }), target, 100);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('is deterministic — no clock is read internally', () => {
    const trace = [50, 51, 49, 52, 48, 60, 61, 59];
    expect(replay(trace).distances).toEqual(replay(trace).distances);
  });
});
