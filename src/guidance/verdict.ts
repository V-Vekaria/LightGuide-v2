import type { ChannelState, Reading, Target, Verdict } from '../contract/types';

function classify(delta: number, tol: number): ChannelState {
  if (Math.abs(delta) <= tol) return 'in_band';
  return delta < 0 ? 'under' : 'over';
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function instructionFor(
  distanceState: ChannelState,
  distanceDelta: number | null,
  brightnessState: ChannelState,
  guidingOnLight: boolean,
): string {
  if (distanceState === 'unknown' || distanceDelta === null) {
    return 'Waiting for a clear reading';
  }
  // Distance first: moving the stand changes the light level too.
  if (distanceState === 'over') return `Move ${round(Math.abs(distanceDelta), 1)} cm closer`;
  if (distanceState === 'under') return `Move ${round(Math.abs(distanceDelta), 1)} cm further`;
  if (brightnessState === 'under') return 'Raise the light';
  if (brightnessState === 'over') return 'Lower the light';
  if (guidingOnLight && brightnessState === 'unknown') {
    return 'On target for distance — no light reading';
  }
  return 'On target';
}

export function verdict(reading: Reading, target: Target): Verdict {
  const distance_delta_cm =
    reading.distance_cm === null ? null : round(reading.distance_cm - target.distance_cm, 1);
  const distance_state: ChannelState =
    distance_delta_cm === null ? 'unknown' : classify(distance_delta_cm, target.distance_tol_cm);

  let brightness_delta: number | null = null;
  let brightness_state: ChannelState = 'unknown';

  const guidingOnLight = target.brightness_above_ambient !== null;
  const lightReadable = reading.brightness !== null && reading.ambient !== null;

  if (guidingOnLight && lightReadable) {
    const aboveAmbient = reading.brightness! - reading.ambient!;
    brightness_delta = round(aboveAmbient - target.brightness_above_ambient!, 3);
    brightness_state = classify(brightness_delta, target.brightness_tol);
  }

  return {
    distance_delta_cm,
    distance_state,
    brightness_delta,
    brightness_state,
    instruction: instructionFor(distance_state, distance_delta_cm, brightness_state, guidingOnLight),
    trustworthy: distance_state !== 'unknown',
  };
}
