import type { SqlDriver } from '../db/driver';
import { newUuid, nowIso } from '../domain/ids';
import { DEFAULT_TOLERANCES } from '../domain/types';
import type { ImageRefRole, Measurement, SceneObject, SceneSnapshot, Setup, ShootCategory } from '../domain/types';
import { createSetup, getSetup, publishSetupVersion } from '../repositories/setups';

/** Manually-entered light geometry. Every field is optional - M2 item 2: "Missing measurements stay unknown", never a fabricated zero. */
export interface ManualLightInput {
  role?: string;
  distanceM?: number;
  heightM?: number;
  directionDeg?: number;
  tiltDeg?: number;
  powerLabel?: string;
  modifierDescription?: string;
}

export interface QuickCaptureInput {
  title: string;
  category: ShootCategory;
  light?: ManualLightInput;
  images?: { imageId: string; role: ImageRefRole }[];
  notes?: string;
}

function manualMeasurement(kind: 'distance' | 'height' | 'direction' | 'tilt', value: number | undefined, unit: string, now: string): Measurement | null {
  if (value === undefined) return null;
  return {
    id: newUuid(),
    kind: kind === 'direction' ? 'orientation' : kind === 'tilt' ? 'orientation' : kind,
    value,
    unit,
    source: 'manual',
    capturedAt: now,
    quality: 'valid',
    uncertainty: null,
    deviceId: null,
    deviceUptimeMs: null,
    firmwareVersion: null,
    targetObjectId: null,
    referenceFrameId: null,
    calibration: null,
    supersedesMeasurementId: null,
  };
}

/**
 * Builds a manual/photo-only scene snapshot: no reference frame (honest -
 * there was no AR scan), one light object carrying whatever the photographer
 * actually entered. This is the "manual fallback" path (M07/US04): capture
 * must succeed with zero of the optional fields filled in.
 */
export function buildManualSnapshot(input: { light?: ManualLightInput; images?: { imageId: string; role: ImageRefRole }[]; notes?: string }): SceneSnapshot {
  const now = nowIso();
  const measurements = [
    manualMeasurement('distance', input.light?.distanceM, 'm', now),
    manualMeasurement('height', input.light?.heightM, 'm', now),
    manualMeasurement('direction', input.light?.directionDeg, 'deg', now),
    manualMeasurement('tilt', input.light?.tiltDeg, 'deg', now),
  ].filter((m): m is Measurement => m !== null);

  const lightObject: SceneObject = {
    id: newUuid(),
    kind: 'light',
    role: input.light?.role ?? null,
    name: null,
    deviceId: null,
    equipment: [],
    measurements,
    settings: {
      powerLabel: input.light?.powerLabel ?? null,
      focalLengthMm: null,
      apertureF: null,
      exposureTimeS: null,
      iso: null,
      modifierDescription: input.light?.modifierDescription ?? null,
      poseImageId: null,
    },
    notes: null,
  };

  return {
    schemaVersion: 1,
    referenceFrame: null,
    objects: [lightObject],
    images: (input.images ?? []).map((ref) => ({ imageId: ref.imageId, role: ref.role, objectId: null })),
    notes: input.notes ?? null,
  };
}

/** Create + publish in one call - the common case (M02-M05). Returns the setup with its new current version already set. */
export function saveQuickCapture(db: SqlDriver, input: QuickCaptureInput): Setup {
  const snapshot = buildManualSnapshot(input);
  const setupId = db.transaction(() => {
    const setup = createSetup(db, { title: input.title, category: input.category });
    publishSetupVersion(db, { setupId: setup.id, parentVersionId: null, snapshot });
    return setup.id;
  });
  return getSetup(db, setupId)!;
}

export const DEFAULT_RECREATION_TOLERANCES = DEFAULT_TOLERANCES;
