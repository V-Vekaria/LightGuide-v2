# Prototype Database Schema v1

**Status:** Implementation specification, not deployed SQL or tested capability.
**Parent decision:** [ADR-012](../DECISIONS.md); [logical design](DATABASE_DESIGN.md).
**Companion:** [Offline Sync v1](OFFLINE_SYNC.md).
**Scope:** Seven application-domain tables. Internal sync records, authentication and local drafts are infrastructure, not extra product features.
**Priority:** This specification does not delay or replace the native Android/ARCore Phase-0 experiment.

Engineering defaults below are the implementation baseline; change them through a documented revision if tests show a problem.

## 1. Type and ownership conventions

- UUIDs: generated on the phone for product records. Cloud UUID type; SQLite canonical UUID text. Profile identity is the authenticated account UUID.
- Timestamp: UTC RFC3339 in SQLite, timestamptz in PostgreSQL. Client capture times describe observations, never determine sync ordering.
- JSON: validated object/array, stored as JSON text locally and jsonb in PostgreSQL. No image bytes or provider-native AR objects.
- Integer counters: nonnegative signed 64-bit. Transport revision/cursor counters as decimal strings to avoid JavaScript precision loss.
- Nullable fields are marked NULL. Other fields are required.
- Foreign keys are enabled on every SQLite connection and verified in tests. Cloud and local validation must enforce same-owner relationships.
- No cloud record has a guest/null owner. Guest data lives in an isolated local workspace; local owner_id can be NULL only there.
- Guest preferences are local settings, not a fabricated authentication user. Account attachment preserves product UUIDs and assigns the authenticated owner in one local transaction.

### Common columns

All seven tables have:

| Column | Type | Rule |
|---|---|---|
| id | UUID | Primary key; profiles.id equals account identity. |
| created_at | timestamp | Client creation time, validated; not a sync cursor. |
| updated_at | timestamp | Server acceptance time for cloud rows; pending local edit time is separate local metadata. |
| revision | bigint | 0 for unsynced local creation; starts at 1 in cloud; server increments on accepted changes. |

All except profiles additionally have owner_id UUID, referencing profiles.id in cloud. Ownership is immutable after guest attachment.

Only equipment, shoots, setups, images and recreations have deleted_at timestamp NULL and purge_after timestamp NULL. Both are server-authoritative once deletion is accepted; NULL together or purge_after >= deleted_at. Profiles use explicit account deletion, not ordinary Trash. setup_versions inherit lifecycle from their setup.

Fields supplied by clients cannot overwrite server revision, timestamps for accepted operations, owner identity or media verification state.

## 2. Seven application tables

### profiles

In addition to common columns:

| Column | Type/default | Rule |
|---|---|---|
| display_name | text NULL | Maximum 120 characters; no client names required. |
| experience_level | text, beginner | beginner / intermediate / professional |
| preferred_units | text, metric | metric / imperial |
| photography_preference | text, both | portrait / product / both |
| default_tolerances | JSON object | ToleranceSet v1 below. |

Cloud id references the authentication user. Never store passwords, access tokens or API keys here.

### equipment

Common owner/lifecycle columns plus:

| Column | Type/default | Rule |
|---|---|---|
| kind | text | camera / lens / light / modifier / reflector / other |
| name | text | Trimmed length 1–120. |
| manufacturer | text NULL | Maximum 120. |
| model | text NULL | Maximum 120. |
| details | JSON object, {} | EquipmentDetails v1. |
| notes | text NULL | Maximum 4,000. |

EquipmentDetails permits mount text NULL, focal_length_min_mm and focal_length_max_mm positive number NULL, modifier_width_m and modifier_height_m positive number NULL, and specifications array of {name:text, value:text, unit:text-or-null}. Maximum 32 specifications, name <=80 and value <=240 characters. Focal minimum cannot exceed maximum. Specifications are recorded facts/manual input, not inferred compatibility guarantees.

### shoots

Common owner/lifecycle columns plus:

| Column | Type/default | Rule |
|---|---|---|
| name | text | Trimmed length 1–120. |
| category | text | portrait / product |
| scheduled_at | timestamp NULL | Optional planning time. |
| status | text, draft | draft / planned / active / completed |
| notes | text NULL | Maximum 4,000. |
| planned_equipment_ids | JSON UUID array, [] | Unique same-owner inventory IDs; missing/retired equipment is flagged, never silently substituted. |

Multiple cameras are supported by the array; actually used equipment/settings live in the scene snapshot.

### setups

Common owner/lifecycle columns plus:

| Column | Type/default | Rule |
|---|---|---|
| title | text | Trimmed length 1–120. |
| category | text | portrait / product |
| current_version_id | UUID NULL | References a version belonging to this setup and owner. NULL only before first publication. |
| archived_at | timestamp NULL | Archive is reversible organisation, not deletion. |

A published setup and its initial version/current pointer are committed atomically. Do not expose an empty cloud setup as a completed capture.

### setup_versions

Common columns and owner_id, but no independent lifecycle columns:

| Column | Type/default | Rule |
|---|---|---|
| setup_id | UUID | Same-owner setup FK. |
| parent_version_id | UUID NULL | Previous version in the same setup; NULL for the first version. |
| snapshot_schema_version | integer, 1 | Equals snapshot.schema_version. |
| snapshot | JSON object | SceneSnapshot v1. |

Saved versions are immutable in both stores. Drafts live in local working_drafts. No mutable draft status is needed on this table.
A parent must exist before a child is inserted; immutable parent links prevent cycles. A competing edit creates another child; it does not overwrite either child or automatically become current.
Inventory references and image availability are external relationships; deletion may make an image unavailable without rewriting the historic snapshot.

### images

Common owner/lifecycle columns plus:

| Column | Type/default | Rule |
|---|---|---|
| mime_type | text | Supported optimised output: image/jpeg, image/png or image/webp. |
| width_px, height_px | integer | Positive, <= 20,000 each for prototype output validation. |
| byte_size | bigint | Optimised byte count, >0 and <=10 MiB. Original local file may be larger. |
| sha256 | text | 64 lowercase hex characters; digest of the optimised bytes. |
| storage_key | text NULL | Server-allocated private object key; never a public/signed URL. |
| upload_state | text, pending | pending / uploaded / purging / purged; server controls verification transitions. |
| exif | JSON object, {} | Allowlisted EXIF only. |

EXIF keys: camera_make, camera_model, lens_model (text NULL <=120); focal_length_mm, aperture_f, exposure_time_s, iso (positive numbers NULL). GPS, camera serial numbers and unrelated metadata are not copied by default.

Local original/optimised paths and download failures belong in local_media, not cloud columns. A saved setup may refer to an image whose metadata exists but upload is pending. Images are immutable assets: replacing pixels creates a new image ID.

### recreations

Common owner/lifecycle columns plus:

| Column | Type/default | Rule |
|---|---|---|
| setup_version_id | UUID | Exact target, same owner; required. |
| shoot_id | UUID NULL | Same-owner shoot, if attached to a session. |
| started_at | timestamp | Observation time, not ordering authority. |
| completed_at | timestamp NULL | Must not precede started_at. |
| duration_ms | bigint NULL | Nonnegative elapsed duration; measure with a monotonic clock where available. |
| status | text, in_progress | in_progress / completed / abandoned |
| outcome | text NULL | matched / close_enough / adapted / unsuccessful |
| actual_snapshot | JSON object NULL | SceneSnapshot v1, preserving actual observations and evidence photos. |
| tolerances | JSON object | ToleranceSet captured for this attempt. |
| evaluation | JSON object NULL | Evaluation v1 below. |
| feedback | JSON object, {} | difficulty 1–5 NULL, usefulness 1–5 NULL, notes text NULL <=4,000. |

Completed requires completed_at and outcome. If measurements were unavailable, allow a photographer-reported outcome but do not manufacture a measured match.
Completed attempt evidence is immutable; later feedback edits are allowed with revision checks. Correcting evidence requires a new attempt, preserving the old record.

## 3. SceneSnapshot v1

Required top-level fields:

| Field | Type | Meaning |
|---|---|---|
| schema_version | integer 1 | Format discriminator. |
| reference_frame | ReferenceFrame or NULL | NULL permits manual/photo-only capture, but prohibits spatial match claims. |
| objects | SceneObject array | Stable unique IDs, maximum 64; may be empty for Quick Capture. |
| images | ImageRef array | Maximum 64. |
| notes | text NULL | Maximum 4,000. |

Prototype size limit: 512 KiB encoded UTF-8 per snapshot. Enforce finite numbers, allowed keys and all limits on phone and server. An unknown schema version is preserved locally but not edited or silently downgraded.

### ReferenceFrame

Fields: id UUID; convention fixed "subject_floor_rh_v1"; reference_image_id UUID NULL; marker_id text NULL; marker_width_m positive number NULL; established_at timestamp; source manual / phone_ar; status valid / uncertain / lost; world_from_reference {position_m:[x,y,z], quaternion_xyzw:[x,y,z,w]} NULL.

Origin is the floor point directly beneath the chosen subject reference, not the subject's face. +Y is up; +Z points horizontally from the subject toward the reference camera position; +X is camera-right when looking toward the subject. This is right-handed. Re-establish this frame for recreation; do not compare unrelated phone world origins.

Coordinates are metres. Store orientation as a unit quaternion [x,y,z,w], mapping object-local vectors into the reference frame, tolerance |norm-1| <= 0.001. Display angles may be derived in degrees; the adapter must document them. Do not store raw IMU yaw as if it were already a scene-frame direction.

### SceneObject

Fields: id UUID; kind light / camera / subject / background; role text NULL <=80; name text NULL <=120; device_id text NULL <=120; equipment EquipmentAtCapture array; measurements Measurement array (maximum 128 per object); settings ObjectSettings; notes text NULL <=4,000.

EquipmentAtCapture: equipment_id UUID NULL; kind as equipment.kind; name text; manufacturer/model text NULL; details EquipmentDetails. Embedded historical details survive later inventory changes/deletion.

ObjectSettings: power_label text NULL <=80; focal_length_mm, aperture_f, exposure_time_s and iso positive number NULL; modifier_description text NULL <=240; pose_image_id UUID NULL. Unavailable settings stay NULL.

### Measurement

Fields:
- id UUID; kind position / orientation / distance / height / brightness / spectral;
- value: finite number for distance/height/brightness, 3-number array for position, unit quaternion for orientation, or array of {channel:text, value:number, wavelength_nm:number-or-null} for spectral (maximum 32 channels);
- unit: m for position/distance/height, unit_quaternion for orientation, or an explicit calibrated/raw unit for brightness/spectral;
- source: manual / phone_ar / sensor / estimate;
- captured_at timestamp; quality valid / uncertain / stale / unavailable / invalid;
- uncertainty: same-dimensional nonnegative number/array or NULL; no fabricated confidence;
- device_id text NULL; device_uptime_ms nonnegative integer NULL; firmware_version text NULL;
- target_object_id UUID NULL; reference_frame_id UUID NULL;
- calibration CalibrationContext NULL;
- supersedes_measurement_id UUID NULL.

Unavailable/invalid values are NULL. Spatial values require reference_frame_id matching the enclosing frame. Distance target_object_id identifies the measured target; without target association, a ToF return is not automatically subject distance. Correction links remain within the snapshot, preserve original values and cannot cycle.

CalibrationContext: id UUID; schema_version 1; calibrated_at timestamp; method text <=120; sensor_model text <=120; mounting_description text NULL <=240; reference_frame_id UUID NULL; object_from_sensor {position_m:[x,y,z], quaternion_xyzw:[x,y,z,w]} NULL; parameters array of {name:text, value:number-or-number-array, unit:text} maximum 32; spectral acquisition {gain:number, integration_time_ms:number} NULL.

Object/body conventions: camera forward = -Z, up = +Y; light output forward = -Z, top = +Y. A subject faces +Z in its local frame, up +Y; a background normal is +Z. Sensor adapters explicitly map their axes/mounting into these conventions. Raw readings with unknown mapping may be retained, but cannot qualify for spatial matching.

ImageRef: image_id UUID; role result / setup / reference / pose; object_id UUID NULL. References must point to same-owner image records (metadata may be pending upload). On later deletion render unavailable rather than dangling download attempts.

### ToleranceSet v1

Fields: schema_version 1; distance_m 0.03; height_m 0.03; direction_deg 3; tilt_deg 3; brightness_relative 0.10; spectral_mode fixed "experimental"; enabled_metrics unique array drawn from distance / height / direction / tilt / brightness.

These are adjustable match targets, not accuracy claims. Only compare compatible sources, frames and calibration/acquisition conditions. Near-zero or uncalibrated brightness cannot support a relative match claim. No spectral pass/fail gate in v1. A changed tolerance starts a separately recorded attempt; it does not silently revise an existing target.

Evaluation v1: schema_version 1; method manual / measured; algorithm_version text; evaluated_at timestamp; metrics array of {object_id:UUID, metric:text, target:number-or-null, actual:number-or-null, delta:number-or-null, unit:text, tolerance:number-or-null, status:within/outside/unavailable/invalid}; result matched / not_matched / unverifiable. Only fresh, valid, comparable required metrics may yield measured matched. Photographer outcome and algorithm result remain distinct.

## 4. Constraints, indexes and access

- Unique (owner_id,id) on six owned tables supports composite same-owner FKs.
- setups current pointer uses (owner_id,id,current_version_id) -> setup_versions(owner_id,setup_id,id), deferred for atomic initial publication. Add corresponding unique key to versions.
- Version parent uses (owner_id,setup_id,parent_version_id) -> the same version key. Other FK relationships include owner_id.
- Local guests are protected by workspace separation plus application validation; attach owner IDs before cloud validation.
- Index owned tables on (owner_id,updated_at,id); index versions on (owner_id,setup_id,created_at,id); recreations on (owner_id,setup_version_id,started_at,id) and (owner_id,shoot_id); lifecycle tables on purge_after where not NULL.
- Index setup titles for ordinary prototype filtering only if measurements justify it; no speculative full JSON GIN indexes.
- Validate JSON references in the same server transaction as publication. A normal FK cannot enforce IDs embedded inside JSON.
- Images referenced by any retained version/attempt cannot be deleted as orphan cleanup. Explicit user image deletion is different and may make historic photos unavailable.
- Enable RLS on exposed tables, owner-only reads; no anonymous product-data access. Revoke direct client writes and route mutations through validated sync functions so revision/feed rules cannot be bypassed.
- Privileged server functions must authenticate owner independently, restrict executable grants, fix search_path and never accept arbitrary table/SQL names. No service-role secret in the app.
- Drafts, credentials, filesystem paths and UI sync flags never enter product snapshots.

## 5. Implementation acceptance

Create versioned SQLite and PostgreSQL migrations and matching runtime validators. Before claiming implementation complete, test:

1. Same-owner FKs and cross-account denial, including JSON image references.
2. Restart-safe guest capture and account attachment preserving product IDs.
3. Atomic publication: no pointer to a missing version; rollback leaves neither half.
4. Immutable saved snapshots, valid parent branches and retained equipment-at-capture.
5. NULL/invalid/stale measurement handling, quaternion/axis conversion and 3 cm display.
6. Image metadata saved before upload; private download permissions.
7. Old snapshot loading and transactional migration rollback.
8. Every case in the [sync acceptance matrix](OFFLINE_SYNC.md#11-acceptance-tests).

## Sources

Type/constraint implementation should follow [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html), [PostgreSQL JSON](https://www.postgresql.org/docs/current/datatype-json.html) and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). The LightGuide fields and procedures above are project design decisions, not vendor-provided automatic functionality.

## Offline implementation revision — 18 September 2026

The mobile SQLite v2 migration adds `not_evaluated` to recreation outcomes. A completed attempt still requires an explicit outcome. No default positive assessment is written. Legacy unfinished assessment selections are cleared once while steps/notes are retained; completed evidence is copied unchanged. The leaf-table migration is atomic and restores the immutable-completed trigger and index. The database filename and SceneSnapshot version remain unchanged. This is not a cloud migration.

Capture drafts optionally include camera focal/aperture/shutter/ISO strings and camera equipment IDs. Saving parses shutter fractions into exposure seconds in the existing camera object. Older drafts remain accepted.
