import type { SceneSnapshot, ToleranceSet } from './types';

/**
 * Structural validation for the parts of DATABASE_SCHEMA.md's SceneSnapshot
 * v1 that are cheap to get wrong and expensive to get wrong silently: array
 * caps, the encoded size limit, schema_version pinning and quaternion
 * normalisation. This is not a full JSON-schema validator for every nested
 * field - see the schema doc for the complete field list - but it is the
 * gate that runs before anything is written to setup_versions or
 * recreations.actual_snapshot, both of which are immutable once saved.
 */

export const MAX_OBJECTS = 64;
export const MAX_IMAGES = 64;
export const MAX_MEASUREMENTS_PER_OBJECT = 128;
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
export const QUATERNION_NORM_TOLERANCE = 0.001;

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

function fail(message: string): never {
  throw new SnapshotValidationError(message);
}

function quaternionNorm(q: readonly [number, number, number, number]): number {
  return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
}

export function validateSceneSnapshot(snapshot: SceneSnapshot): void {
  if (snapshot.schemaVersion !== 1) {
    fail(`unsupported snapshot schema_version ${String(snapshot.schemaVersion)}`);
  }
  if (snapshot.objects.length > MAX_OBJECTS) {
    fail(`snapshot has ${snapshot.objects.length} objects, maximum is ${MAX_OBJECTS}`);
  }
  if (snapshot.images.length > MAX_IMAGES) {
    fail(`snapshot has ${snapshot.images.length} image references, maximum is ${MAX_IMAGES}`);
  }

  const seenObjectIds = new Set<string>();
  for (const object of snapshot.objects) {
    if (seenObjectIds.has(object.id)) {
      fail(`duplicate scene object id ${object.id}`);
    }
    seenObjectIds.add(object.id);

    if (object.measurements.length > MAX_MEASUREMENTS_PER_OBJECT) {
      fail(
        `object ${object.id} has ${object.measurements.length} measurements, ` +
          `maximum is ${MAX_MEASUREMENTS_PER_OBJECT}`,
      );
    }

    for (const measurement of object.measurements) {
      if (measurement.kind === 'position' && Array.isArray(measurement.value)) {
        const v = measurement.value as unknown[];
        if (v.length !== 3 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
          fail(`position measurement ${measurement.id} must be 3 finite numbers`);
        }
      }
      if (measurement.kind === 'orientation' && measurement.value && !Array.isArray(measurement.value)) {
        const q = measurement.value as { x: number; y: number; z: number; w: number };
        const norm = quaternionNorm([q.x, q.y, q.z, q.w]);
        if (Math.abs(norm - 1) > QUATERNION_NORM_TOLERANCE) {
          fail(
            `orientation measurement ${measurement.id} quaternion norm ${norm.toFixed(4)} ` +
              `is outside tolerance of 1 +/- ${QUATERNION_NORM_TOLERANCE}`,
          );
        }
      }
      if (
        (measurement.kind === 'distance' || measurement.kind === 'height' || measurement.kind === 'brightness') &&
        measurement.value !== null &&
        (typeof measurement.value !== 'number' || !Number.isFinite(measurement.value))
      ) {
        fail(`${measurement.kind} measurement ${measurement.id} must be a finite number or null`);
      }
      if (measurement.value === null && measurement.quality === 'valid') {
        fail(`measurement ${measurement.id} cannot be null while reporting quality "valid"`);
      }
      // A spatial measurement is only comparable against the frame it was taken in.
      if (
        (measurement.kind === 'position' || measurement.kind === 'orientation') &&
        measurement.referenceFrameId &&
        snapshot.referenceFrame &&
        measurement.referenceFrameId !== snapshot.referenceFrame.id
      ) {
        fail(`measurement ${measurement.id} references a reference frame not present in this snapshot`);
      }
    }
  }

  if (snapshot.referenceFrame?.worldFromReference) {
    const norm = quaternionNorm(snapshot.referenceFrame.worldFromReference.quaternionXyzw);
    if (Math.abs(norm - 1) > QUATERNION_NORM_TOLERANCE) {
      fail(`reference frame quaternion norm ${norm.toFixed(4)} is outside tolerance`);
    }
  }

  const imageObjectIds = new Set(snapshot.objects.map((o) => o.id));
  for (const ref of snapshot.images) {
    if (ref.objectId && !imageObjectIds.has(ref.objectId)) {
      fail(`image reference ${ref.imageId} points at object ${ref.objectId}, which is not in this snapshot`);
    }
  }

  const encodedBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
  if (encodedBytes > MAX_SNAPSHOT_BYTES) {
    fail(`snapshot is ${encodedBytes} bytes encoded, maximum is ${MAX_SNAPSHOT_BYTES}`);
  }
}

export function validateToleranceSet(tolerances: ToleranceSet): void {
  if (tolerances.schemaVersion !== 1) {
    fail(`unsupported tolerance schema_version ${String(tolerances.schemaVersion)}`);
  }
  const positive: [string, number][] = [
    ['distanceM', tolerances.distanceM],
    ['heightM', tolerances.heightM],
    ['directionDeg', tolerances.directionDeg],
    ['tiltDeg', tolerances.tiltDeg],
    ['brightnessRelative', tolerances.brightnessRelative],
  ];
  for (const [field, value] of positive) {
    if (!Number.isFinite(value) || value <= 0) {
      fail(`tolerance field ${field} must be a positive finite number, got ${String(value)}`);
    }
  }
  if (tolerances.enabledMetrics.length === 0) {
    fail('tolerance set must enable at least one metric');
  }
  if (new Set(tolerances.enabledMetrics).size !== tolerances.enabledMetrics.length) {
    fail('enabledMetrics must not contain duplicates');
  }
}
