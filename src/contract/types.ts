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
  listSetups(): Promise<Setup[]>;
  saveSetup(setup: Setup): Promise<Setup>;
  deleteSetup(id: string): Promise<void>;
  setActiveTarget(target: Target | null): Promise<void>;
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
