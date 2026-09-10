import { DEFAULT_TOLERANCES } from '../src/domain/types';
import type { PoseTransform } from '../src/domain/types';
import { computeDelta, computeGuidance, computeMatchState } from '../src/guidance/guidance';

const IDENTITY_Q: [number, number, number, number] = [0, 0, 0, 1];

function pose(x: number, y: number, z: number, q: [number, number, number, number] = IDENTITY_Q): PoseTransform {
  return { positionM: [x, y, z], quaternionXyzw: q };
}

describe('computeDelta', () => {
  it('reports zero delta for identical poses', () => {
    const p = pose(1, 2, 3);
    const delta = computeDelta(p, p);
    expect(delta.positionErrorM).toBeCloseTo(0, 6);
    expect(delta.orientationErrorDeg).toBeCloseTo(0, 3);
  });

  it('reports the straight-line offset and its sign per axis', () => {
    const target = pose(0, 0, 0);
    const current = pose(0.18, -0.07, 0.11);
    const delta = computeDelta(target, current);
    expect(delta.translationM.x).toBeCloseTo(0.18, 6);
    expect(delta.translationM.y).toBeCloseTo(-0.07, 6);
    expect(delta.translationM.z).toBeCloseTo(0.11, 6);
    expect(delta.positionErrorM).toBeCloseTo(Math.sqrt(0.18 ** 2 + 0.07 ** 2 + 0.11 ** 2), 6);
  });

  it('a 90 degree yaw between target and current reports a 90 degree orientation error', () => {
    const half = Math.PI / 4;
    const yaw90: [number, number, number, number] = [0, Math.sin(half), 0, Math.cos(half)];
    const delta = computeDelta(pose(0, 0, 0), pose(0, 0, 0, yaw90));
    expect(delta.orientationErrorDeg).toBeCloseTo(90, 1);
  });
});

describe('computeGuidance', () => {
  it('a stand too far right is told to move left', () => {
    const delta = computeDelta(pose(0, 0, 0), pose(0.18, 0, 0));
    const result = computeGuidance(delta, DEFAULT_TOLERANCES);
    const step = result.steps.find((s) => s.axis === 'x')!;
    expect(step.direction).toBe('MOVE LEFT');
    expect(step.magnitudeM).toBeCloseTo(0.18, 6);
    expect(step.inTolerance).toBe(false);
  });

  it('a stand too low is told to raise', () => {
    const delta = computeDelta(pose(0, 0, 0), pose(0, -0.07, 0));
    const result = computeGuidance(delta, DEFAULT_TOLERANCES);
    const step = result.steps.find((s) => s.axis === 'y')!;
    expect(step.direction).toBe('RAISE');
  });

  it('position exactly at the 3cm distance boundary passes', () => {
    const delta = computeDelta(pose(0, 0, 0), pose(0.03, 0, 0));
    const result = computeGuidance(delta, DEFAULT_TOLERANCES);
    expect(result.distanceInTolerance).toBe(true);
  });

  it('position just outside the 3cm distance boundary fails', () => {
    const delta = computeDelta(pose(0, 0, 0), pose(0.031, 0, 0));
    const result = computeGuidance(delta, DEFAULT_TOLERANCES);
    expect(result.distanceInTolerance).toBe(false);
  });

  it('a delta with everything at zero is fully in tolerance', () => {
    const delta = computeDelta(pose(1, 1, 1), pose(1, 1, 1));
    const result = computeGuidance(delta, DEFAULT_TOLERANCES);
    expect(result.allInTolerance).toBe(true);
  });
});

describe('computeMatchState', () => {
  const target = pose(0, 0, 0);
  const inToleranceDelta = computeDelta(target, pose(0.001, 0, 0));
  const outOfToleranceDelta = computeDelta(target, pose(0.5, 0, 0));

  it('reports in_tolerance for a fresh, valid, in-tolerance reading', () => {
    const state = computeMatchState({
      delta: inToleranceDelta,
      observationQuality: 'fresh',
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(state).toBe('in_tolerance');
  });

  it('reports out_of_tolerance for a fresh, valid, out-of-tolerance reading', () => {
    const state = computeMatchState({
      delta: outOfToleranceDelta,
      observationQuality: 'fresh',
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(state).toBe('out_of_tolerance');
  });

  it('an inferred observation is unverifiable even when numerically in tolerance', () => {
    const state = computeMatchState({
      delta: inToleranceDelta,
      observationQuality: 'inferred',
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(state).toBe('unverifiable');
  });

  it('an invalid reference is unverifiable', () => {
    const state = computeMatchState({
      delta: inToleranceDelta,
      observationQuality: 'fresh',
      referenceValid: false,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(state).toBe('unverifiable');
  });

  it('no delta at all is unverifiable', () => {
    const state = computeMatchState({
      delta: null,
      observationQuality: 'fresh',
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(state).toBe('unverifiable');
  });

  it('an unavailable observation is unverifiable', () => {
    const state = computeMatchState({
      delta: inToleranceDelta,
      observationQuality: 'unavailable',
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(state).toBe('unverifiable');
  });
});
