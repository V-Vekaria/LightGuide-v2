import type { PoseTransform, QuaternionXyzw, ToleranceSet } from '../domain/types';

/**
 * Pure current-vs-target guidance maths for the offline app's manual and
 * simulated recreation screens (M2 items 5-6). Deliberately independent of
 * any spatial SDK - same spirit as the Kotlin experiment's pose/Geometry.kt
 * ("plain Kotlin ... unit tested on the JVM without an ARCore session"),
 * ported to TypeScript for this app's own recreation UI.
 *
 * This is NOT the Phase-0 measurement harness and makes no accuracy claim by
 * itself. It consumes whatever pose a SpatialProvider hands it - manual
 * entry, a simulated pose, or (once a native adapter exists) a real one -
 * and only computes the delta/instructions consistently, the same way in
 * every case.
 */

export type ObservationQuality = 'fresh' | 'inferred' | 'unavailable';
export type MatchState = 'in_tolerance' | 'out_of_tolerance' | 'unverifiable';

export interface PoseDelta {
  /** current - target, in the shared reference frame's own axes (not the target's). */
  translationM: { x: number; y: number; z: number };
  rotationDeltaDeg: { pitch: number; yaw: number; roll: number };
  positionErrorM: number;
  orientationErrorDeg: number;
}

export interface GuidanceStep {
  axis: 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll';
  direction: string;
  magnitudeM?: number;
  magnitudeDeg?: number;
  inTolerance: boolean;
}

export interface GuidanceResult {
  steps: GuidanceStep[];
  distanceInTolerance: boolean;
  heightInTolerance: boolean;
  directionInTolerance: boolean;
  tiltInTolerance: boolean;
  allInTolerance: boolean;
}

// ------------------------------------------------------------ quaternion --

function normalize(q: QuaternionXyzw): QuaternionXyzw {
  const n = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

function conjugate(q: QuaternionXyzw): QuaternionXyzw {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function multiply(a: QuaternionXyzw, b: QuaternionXyzw): QuaternionXyzw {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** Axis-angle magnitude of a rotation quaternion, degrees. */
function angleDeg(q: QuaternionXyzw): number {
  const n = normalize(q);
  const clamped = Math.min(1, Math.max(-1, Math.abs(n.w)));
  return (2 * Math.acos(clamped) * 180) / Math.PI;
}

/** Intrinsic Y-X-Z Euler extraction, matching the sign reporting convention used throughout this app: pitch up +, yaw right +, roll clockwise + (seen from behind, looking along +Z). */
function eulerDeg(q0: QuaternionXyzw): { pitch: number; yaw: number; roll: number } {
  const q = normalize(q0);
  const { x, y, z, w } = q;
  // Rotation matrix elements needed for a Y-X-Z extraction.
  const m02 = 2 * (x * z + y * w);
  const m12 = 2 * (y * z - x * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const m00 = 1 - 2 * (y * y + z * z);
  const m20 = 2 * (x * z - y * w);
  const m10 = 2 * (x * y + z * w);
  const m11 = 1 - 2 * (x * x + z * z);

  const sinPitch = Math.min(1, Math.max(-1, -m12));
  const pitch = Math.asin(sinPitch);
  const gimbalLocked = Math.abs(sinPitch) > 0.99999;

  let yaw: number;
  let roll: number;
  if (gimbalLocked) {
    yaw = Math.atan2(-m20, m00);
    roll = 0;
  } else {
    yaw = Math.atan2(m02, m22);
    roll = Math.atan2(m10, m11);
  }

  const toDeg = (r: number) => (r * 180) / Math.PI;
  return { pitch: -toDeg(pitch), yaw: toDeg(yaw), roll: -toDeg(roll) };
}

// ---------------------------------------------------------------- delta --

export function computeDelta(target: PoseTransform, current: PoseTransform): PoseDelta {
  const dx = current.positionM[0] - target.positionM[0];
  const dy = current.positionM[1] - target.positionM[1];
  const dz = current.positionM[2] - target.positionM[2];

  const targetQ: QuaternionXyzw = {
    x: target.quaternionXyzw[0],
    y: target.quaternionXyzw[1],
    z: target.quaternionXyzw[2],
    w: target.quaternionXyzw[3],
  };
  const currentQ: QuaternionXyzw = {
    x: current.quaternionXyzw[0],
    y: current.quaternionXyzw[1],
    z: current.quaternionXyzw[2],
    w: current.quaternionXyzw[3],
  };
  const relative = multiply(conjugate(normalize(targetQ)), normalize(currentQ));

  return {
    translationM: { x: dx, y: dy, z: dz },
    rotationDeltaDeg: eulerDeg(relative),
    positionErrorM: Math.sqrt(dx * dx + dy * dy + dz * dz),
    orientationErrorDeg: angleDeg(relative),
  };
}

// ------------------------------------------------------------- guidance --

function linearStep(
  axis: 'x' | 'y' | 'z',
  offsetM: number,
  negativeLabel: string,
  positiveLabel: string,
  toleranceM: number,
): GuidanceStep {
  return {
    axis,
    direction: offsetM >= 0 ? positiveLabel : negativeLabel,
    magnitudeM: Math.abs(offsetM),
    inTolerance: Math.abs(offsetM) <= toleranceM,
  };
}

function angularStep(
  axis: 'yaw' | 'pitch' | 'roll',
  offsetDeg: number,
  negativeLabel: string,
  positiveLabel: string,
  toleranceDeg: number,
): GuidanceStep {
  return {
    axis,
    direction: offsetDeg >= 0 ? positiveLabel : negativeLabel,
    magnitudeDeg: Math.abs(offsetDeg),
    inTolerance: Math.abs(offsetDeg) <= toleranceDeg,
  };
}

export function computeGuidance(delta: PoseDelta, tolerances: ToleranceSet): GuidanceResult {
  // Each step must show the CORRECTION, which is the opposite of the
  // measured offset: a stand sitting to the right (positive X) must be
  // moved left. linearStep/angularStep take (label-for-negative-offset,
  // label-for-positive-offset), so the positive-offset label is always the
  // "other" direction from what the axis name might suggest.
  const steps = [
    linearStep('x', delta.translationM.x, 'MOVE RIGHT', 'MOVE LEFT', tolerances.distanceM),
    linearStep('y', delta.translationM.y, 'RAISE', 'LOWER', tolerances.heightM),
    linearStep('z', delta.translationM.z, 'MOVE BACK', 'MOVE FORWARD', tolerances.distanceM),
    angularStep('yaw', delta.rotationDeltaDeg.yaw, 'ROTATE RIGHT', 'ROTATE LEFT', tolerances.directionDeg),
    angularStep('pitch', delta.rotationDeltaDeg.pitch, 'TILT UP', 'TILT DOWN', tolerances.tiltDeg),
    angularStep('roll', delta.rotationDeltaDeg.roll, 'ROLL CW', 'ROLL CCW', tolerances.tiltDeg),
  ];

  const distanceInTolerance = Math.abs(delta.translationM.x) <= tolerances.distanceM && Math.abs(delta.translationM.z) <= tolerances.distanceM;
  const heightInTolerance = Math.abs(delta.translationM.y) <= tolerances.heightM;
  const directionInTolerance = Math.abs(delta.rotationDeltaDeg.yaw) <= tolerances.directionDeg;
  const tiltInTolerance =
    Math.abs(delta.rotationDeltaDeg.pitch) <= tolerances.tiltDeg && Math.abs(delta.rotationDeltaDeg.roll) <= tolerances.tiltDeg;

  const enabled = new Set(tolerances.enabledMetrics);
  const relevant = [
    !enabled.has('distance') || distanceInTolerance,
    !enabled.has('height') || heightInTolerance,
    !enabled.has('direction') || directionInTolerance,
    !enabled.has('tilt') || tiltInTolerance,
  ];

  return {
    steps,
    distanceInTolerance,
    heightInTolerance,
    directionInTolerance,
    tiltInTolerance,
    allInTolerance: relevant.every(Boolean),
  };
}

/**
 * The single authoritative verdict, mirroring the Kotlin harness's
 * MatchState: a numeric pass/fail is only reportable when the observation is
 * fresh and the reference frame is valid. An inferred or unavailable
 * observation, or an invalid/lost reference, must always read UNVERIFIABLE -
 * never fall back to whatever the stale numbers say.
 */
export function computeMatchState(params: {
  delta: PoseDelta | null;
  observationQuality: ObservationQuality;
  referenceValid: boolean;
  tolerances: ToleranceSet;
}): MatchState {
  if (!params.delta) return 'unverifiable';
  if (params.observationQuality !== 'fresh') return 'unverifiable';
  if (!params.referenceValid) return 'unverifiable';
  return computeGuidance(params.delta, params.tolerances).allInTolerance ? 'in_tolerance' : 'out_of_tolerance';
}
