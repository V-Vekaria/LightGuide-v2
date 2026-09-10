/**
 * Domain types for the local-first prototype database.
 *
 * These mirror docs/product/DATABASE_SCHEMA.md's seven-table design and
 * SceneSnapshot v1 as closely as a local-only implementation reasonably can.
 * Cloud-only concerns (server revision, RLS, upload_state transitions) are
 * intentionally NOT modelled here - this app has no backend yet - but field
 * names and shapes are kept compatible so a future sync layer does not need
 * a data migration to adopt them. See ADR-015 and ADR-013 in DECISIONS.md.
 */

export type Uuid = string;
export type IsoTimestamp = string;

// --------------------------------------------------------------- common --

export type LifecycleFields = {
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  archivedAt: IsoTimestamp | null;
  deletedAt: IsoTimestamp | null;
  purgeAfter: IsoTimestamp | null;
};

// ------------------------------------------------------------- profiles --

export type ExperienceLevel = 'beginner' | 'intermediate' | 'professional';
export type Units = 'metric' | 'imperial';
export type PhotographyPreference = 'portrait' | 'product' | 'both';

export interface Profile {
  id: Uuid;
  displayName: string | null;
  experienceLevel: ExperienceLevel;
  preferredUnits: Units;
  photographyPreference: PhotographyPreference;
  defaultTolerances: ToleranceSet;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// ------------------------------------------------------------- equipment --

export type EquipmentKind = 'camera' | 'lens' | 'light' | 'modifier' | 'reflector' | 'other';

export interface EquipmentSpecification {
  name: string;
  value: string;
  unit: string | null;
}

export interface EquipmentDetails {
  mount: string | null;
  focalLengthMinMm: number | null;
  focalLengthMaxMm: number | null;
  modifierWidthM: number | null;
  modifierHeightM: number | null;
  specifications: EquipmentSpecification[];
}

export interface Equipment extends LifecycleFields {
  id: Uuid;
  ownerId: Uuid | null;
  kind: EquipmentKind;
  name: string;
  manufacturer: string | null;
  model: string | null;
  details: EquipmentDetails;
  notes: string | null;
}

// --------------------------------------------------------------- shoots --

export type ShootCategory = 'portrait' | 'product';
export type ShootStatus = 'draft' | 'planned' | 'active' | 'completed';

export interface Shoot extends LifecycleFields {
  id: Uuid;
  ownerId: Uuid | null;
  name: string;
  category: ShootCategory;
  scheduledAt: IsoTimestamp | null;
  status: ShootStatus;
  notes: string | null;
  plannedEquipmentIds: Uuid[];
}

// --------------------------------------------------------------- setups --

export interface Setup extends LifecycleFields {
  id: Uuid;
  ownerId: Uuid | null;
  title: string;
  category: ShootCategory;
  currentVersionId: Uuid | null;
}

export interface SetupVersion {
  id: Uuid;
  ownerId: Uuid | null;
  setupId: Uuid;
  parentVersionId: Uuid | null;
  snapshotSchemaVersion: 1;
  snapshot: SceneSnapshot;
  createdAt: IsoTimestamp;
}

// --------------------------------------------------------------- images --

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface AllowlistedExif {
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  focalLengthMm: number | null;
  apertureF: number | null;
  exposureTimeS: number | null;
  iso: number | null;
}

export interface ImageRecord extends LifecycleFields {
  id: Uuid;
  ownerId: Uuid | null;
  /** Local file URI. There is no cloud storage yet - see images.storage_key in the schema doc for the future cloud field. */
  localUri: string;
  mimeType: ImageMimeType;
  widthPx: number | null;
  heightPx: number | null;
  byteSize: number | null;
  sha256: string | null;
  exif: AllowlistedExif;
}

// --------------------------------------------------------- recreations --

export type RecreationStatus = 'in_progress' | 'completed' | 'abandoned';
export type RecreationOutcome = 'matched' | 'close_enough' | 'adapted' | 'unsuccessful';

export interface EvaluationMetric {
  objectId: Uuid;
  metric: string;
  target: number | null;
  actual: number | null;
  delta: number | null;
  unit: string;
  tolerance: number | null;
  status: 'within' | 'outside' | 'unavailable' | 'invalid';
}

export interface Evaluation {
  schemaVersion: 1;
  method: 'manual' | 'measured';
  algorithmVersion: string;
  evaluatedAt: IsoTimestamp;
  metrics: EvaluationMetric[];
  result: 'matched' | 'not_matched' | 'unverifiable';
}

export interface RecreationFeedback {
  difficulty: number | null;
  usefulness: number | null;
  notes: string | null;
}

export interface Recreation {
  id: Uuid;
  ownerId: Uuid | null;
  setupVersionId: Uuid;
  shootId: Uuid | null;
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp | null;
  durationMs: number | null;
  status: RecreationStatus;
  outcome: RecreationOutcome | null;
  actualSnapshot: SceneSnapshot | null;
  tolerances: ToleranceSet;
  evaluation: Evaluation | null;
  feedback: RecreationFeedback;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// --------------------------------------------------------- scene snapshot --

export type ReferenceFrameStatus = 'valid' | 'uncertain' | 'lost';
export type ReferenceFrameSource = 'manual' | 'phone_ar';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionXyzw {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PoseTransform {
  positionM: [number, number, number];
  quaternionXyzw: [number, number, number, number];
}

export interface ReferenceFrame {
  id: Uuid;
  /** Fixed per DATABASE_SCHEMA.md: origin = floor beneath the subject, +Y up, +Z subject-to-camera, +X camera-right. Right-handed. */
  convention: 'subject_floor_rh_v1';
  referenceImageId: Uuid | null;
  markerId: string | null;
  markerWidthM: number | null;
  establishedAt: IsoTimestamp;
  source: ReferenceFrameSource;
  status: ReferenceFrameStatus;
  worldFromReference: PoseTransform | null;
}

export type SceneObjectKind = 'light' | 'camera' | 'subject' | 'background';

export interface EquipmentAtCapture {
  equipmentId: Uuid | null;
  kind: EquipmentKind;
  name: string;
  manufacturer: string | null;
  model: string | null;
  details: EquipmentDetails;
}

export type MeasurementKind = 'position' | 'orientation' | 'distance' | 'height' | 'brightness' | 'spectral';
export type MeasurementSource = 'manual' | 'phone_ar' | 'sensor' | 'estimate';
export type MeasurementQuality = 'valid' | 'uncertain' | 'stale' | 'unavailable' | 'invalid';

export interface SpectralChannel {
  channel: string;
  value: number;
  wavelengthNm: number | null;
}

export type MeasurementValue = number | [number, number, number] | QuaternionXyzw | SpectralChannel[];

export interface CalibrationContext {
  id: Uuid;
  schemaVersion: 1;
  calibratedAt: IsoTimestamp;
  method: string;
  sensorModel: string;
  mountingDescription: string | null;
  referenceFrameId: Uuid | null;
  objectFromSensor: PoseTransform | null;
  parameters: { name: string; value: number | number[]; unit: string }[];
  spectralAcquisition: { gainValue: number; integrationTimeMs: number } | null;
}

export interface Measurement {
  id: Uuid;
  kind: MeasurementKind;
  /** Null means unavailable/invalid - never a fabricated zero. */
  value: MeasurementValue | null;
  unit: string;
  source: MeasurementSource;
  capturedAt: IsoTimestamp;
  quality: MeasurementQuality;
  uncertainty: number | number[] | null;
  deviceId: string | null;
  deviceUptimeMs: number | null;
  firmwareVersion: string | null;
  targetObjectId: Uuid | null;
  referenceFrameId: Uuid | null;
  calibration: CalibrationContext | null;
  supersedesMeasurementId: Uuid | null;
}

export interface ObjectSettings {
  powerLabel: string | null;
  focalLengthMm: number | null;
  apertureF: number | null;
  exposureTimeS: number | null;
  iso: number | null;
  modifierDescription: string | null;
  poseImageId: Uuid | null;
}

export interface SceneObject {
  id: Uuid;
  kind: SceneObjectKind;
  role: string | null;
  name: string | null;
  deviceId: string | null;
  equipment: EquipmentAtCapture[];
  measurements: Measurement[];
  settings: ObjectSettings;
  notes: string | null;
}

export type ImageRefRole = 'result' | 'setup' | 'reference' | 'pose';

export interface ImageRef {
  imageId: Uuid;
  role: ImageRefRole;
  objectId: Uuid | null;
}

export interface SceneSnapshot {
  schemaVersion: 1;
  /** Null permits manual/photo-only capture; spatial match claims require a frame. */
  referenceFrame: ReferenceFrame | null;
  objects: SceneObject[];
  images: ImageRef[];
  notes: string | null;
}

// ------------------------------------------------------------- tolerances --

export type ToleranceMetric = 'distance' | 'height' | 'direction' | 'tilt' | 'brightness';

export interface ToleranceSet {
  schemaVersion: 1;
  distanceM: number;
  heightM: number;
  directionDeg: number;
  tiltDeg: number;
  brightnessRelative: number;
  spectralMode: 'experimental';
  enabledMetrics: ToleranceMetric[];
}

/** Application matching defaults per docs/product/DATABASE_SCHEMA.md ToleranceSet v1. Not a proven accuracy claim. */
export const DEFAULT_TOLERANCES: ToleranceSet = {
  schemaVersion: 1,
  distanceM: 0.03,
  heightM: 0.03,
  directionDeg: 3,
  tiltDeg: 3,
  brightnessRelative: 0.1,
  spectralMode: 'experimental',
  enabledMetrics: ['distance', 'height', 'direction', 'tilt'],
};
