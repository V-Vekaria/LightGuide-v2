import { DEFAULT_TOLERANCES } from '../src/domain/types';
import type { SceneSnapshot } from '../src/domain/types';
import { SnapshotValidationError, validateSceneSnapshot, validateToleranceSet } from '../src/domain/validation';

function emptySnapshot(): SceneSnapshot {
  return { schemaVersion: 1, referenceFrame: null, objects: [], images: [], notes: null };
}

describe('validateSceneSnapshot', () => {
  it('accepts an empty Quick Capture snapshot', () => {
    expect(() => validateSceneSnapshot(emptySnapshot())).not.toThrow();
  });

  it('rejects an unsupported schema_version', () => {
    const bad = { ...emptySnapshot(), schemaVersion: 2 as unknown as 1 };
    expect(() => validateSceneSnapshot(bad)).toThrow(SnapshotValidationError);
  });

  it('rejects more than 64 objects', () => {
    const snapshot = emptySnapshot();
    for (let i = 0; i < 65; i += 1) {
      snapshot.objects.push({
        id: `obj-${i}`,
        kind: 'light',
        role: null,
        name: null,
        deviceId: null,
        equipment: [],
        measurements: [],
        settings: {
          powerLabel: null,
          focalLengthMm: null,
          apertureF: null,
          exposureTimeS: null,
          iso: null,
          modifierDescription: null,
          poseImageId: null,
        },
        notes: null,
      });
    }
    expect(() => validateSceneSnapshot(snapshot)).toThrow(/64/);
  });

  it('rejects an orientation measurement whose quaternion is not normalised', () => {
    const snapshot = emptySnapshot();
    snapshot.objects.push({
      id: 'light-1',
      kind: 'light',
      role: null,
      name: null,
      deviceId: null,
      equipment: [],
      measurements: [
        {
          id: 'm1',
          kind: 'orientation',
          value: { x: 0, y: 0, z: 0, w: 2 }, // norm 2, not 1
          unit: 'unit_quaternion',
          source: 'manual',
          capturedAt: '2026-01-01T00:00:00Z',
          quality: 'valid',
          uncertainty: null,
          deviceId: null,
          deviceUptimeMs: null,
          firmwareVersion: null,
          targetObjectId: null,
          referenceFrameId: null,
          calibration: null,
          supersedesMeasurementId: null,
        },
      ],
      settings: {
        powerLabel: null,
        focalLengthMm: null,
        apertureF: null,
        exposureTimeS: null,
        iso: null,
        modifierDescription: null,
        poseImageId: null,
      },
      notes: null,
    });
    expect(() => validateSceneSnapshot(snapshot)).toThrow(/quaternion norm/);
  });

  it('rejects a measurement claiming quality "valid" with a null value', () => {
    const snapshot = emptySnapshot();
    snapshot.objects.push({
      id: 'light-1',
      kind: 'light',
      role: null,
      name: null,
      deviceId: null,
      equipment: [],
      measurements: [
        {
          id: 'm1',
          kind: 'distance',
          value: null,
          unit: 'm',
          source: 'manual',
          capturedAt: '2026-01-01T00:00:00Z',
          quality: 'valid',
          uncertainty: null,
          deviceId: null,
          deviceUptimeMs: null,
          firmwareVersion: null,
          targetObjectId: null,
          referenceFrameId: null,
          calibration: null,
          supersedesMeasurementId: null,
        },
      ],
      settings: {
        powerLabel: null,
        focalLengthMm: null,
        apertureF: null,
        exposureTimeS: null,
        iso: null,
        modifierDescription: null,
        poseImageId: null,
      },
      notes: null,
    });
    expect(() => validateSceneSnapshot(snapshot)).toThrow(/cannot be null/);
  });

  it('rejects an image reference to an object that is not in the snapshot', () => {
    const snapshot = emptySnapshot();
    snapshot.images.push({ imageId: 'img-1', role: 'result', objectId: 'nonexistent-object' });
    expect(() => validateSceneSnapshot(snapshot)).toThrow(/not in this snapshot/);
  });
});

describe('validateToleranceSet', () => {
  it('accepts the application defaults', () => {
    expect(() => validateToleranceSet(DEFAULT_TOLERANCES)).not.toThrow();
  });

  it('rejects a zero or negative tolerance', () => {
    expect(() => validateToleranceSet({ ...DEFAULT_TOLERANCES, distanceM: 0 })).toThrow();
    expect(() => validateToleranceSet({ ...DEFAULT_TOLERANCES, tiltDeg: -1 })).toThrow();
  });

  it('rejects an empty enabledMetrics list', () => {
    expect(() => validateToleranceSet({ ...DEFAULT_TOLERANCES, enabledMetrics: [] })).toThrow();
  });
});
