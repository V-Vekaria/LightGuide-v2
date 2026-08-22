import { describe, it, expect } from 'vitest';
import { createArrivalState, observeSettled, type ArrivalState } from './arrival';

/** Feeds a sequence of `settled` observations and returns where each one fired. */
function fireIndexes(sequence: boolean[]): number[] {
  let state = createArrivalState();
  const fired: number[] = [];
  sequence.forEach((settled, index) => {
    const step = observeSettled(state, settled);
    state = step.state;
    if (step.arrived) fired.push(index);
  });
  return fired;
}

describe('observeSettled', () => {
  it('fires on the not-settled -> settled edge', () => {
    const first = observeSettled(createArrivalState(), false);
    expect(first.arrived).toBe(false);

    const second = observeSettled(first.state, true);
    expect(second.arrived).toBe(true);
  });

  it('does not fire again while it stays settled', () => {
    // The live screen re-renders about twice a second from the store's
    // heartbeat whether or not anything changed. One arrival, one cue.
    expect(fireIndexes([false, true, true, true, true, true, true])).toEqual([1]);
  });

  it('does not fire on the first observation, even when already settled', () => {
    // Opening the screen onto a stand that is already in tolerance is not an
    // arrival — nobody walked anywhere, and buzzing would be a lie.
    const step = observeSettled(createArrivalState(), true);
    expect(step.arrived).toBe(false);
    expect(step.state.seen).toBe(true);
  });

  it('re-arms: settled -> not settled -> settled fires again', () => {
    expect(fireIndexes([false, true, false, true])).toEqual([1, 3]);
  });

  it('re-arms after a mount that opened already settled', () => {
    expect(fireIndexes([true, false, true])).toEqual([2]);
  });

  it('never fires on the settled -> not-settled edge', () => {
    expect(fireIndexes([false, true, false, false])).toEqual([1]);
  });

  it('fires exactly once per crossing across a long noisy session', () => {
    // in, out, in again, held for a while — two crossings, two cues.
    const sequence = [
      false, false, false, true, true, true, true,
      false, false,
      true, true, true, true, true, true, true, true,
    ];
    expect(fireIndexes(sequence)).toEqual([3, 9]);
  });

  it('does not mutate the state it is given', () => {
    const start: ArrivalState = createArrivalState();
    const afterFalse = observeSettled(start, false);
    expect(start.seen).toBe(null);

    const afterTrue = observeSettled(afterFalse.state, true);
    expect(afterFalse.state.seen).toBe(false);
    expect(afterTrue.state.seen).toBe(true);
  });

  it('is a pure function of the state passed in, not of call order', () => {
    // Replaying the same prior state twice must give the same answer twice:
    // nothing is latched anywhere but in the returned state.
    const settledState: ArrivalState = { seen: false };
    expect(observeSettled(settledState, true).arrived).toBe(true);
    expect(observeSettled(settledState, true).arrived).toBe(true);
  });
});
