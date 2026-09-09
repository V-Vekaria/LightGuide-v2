# LightGuide v2 — V1 Architecture

## Architecture goal

Support reliable **Measure → Save → Recreate** of physical studio-lighting setups while keeping the core workflow offline and avoiding unnecessary hardware complexity before positioning is validated.

## Delivery architecture

LightGuide uses a phased architecture because spatial positioning is the highest-risk capability.

### Phase 0 — Android positioning experiment

- Platform: Android only.
- Language/tooling: Kotlin in Android Studio.
- Spatial SDK: native ARCore.
- Device: a verified ARCore-compatible Android phone.
- Purpose: prove or reject reference establishment, node-marker pose capture, relocalisation and return guidance.
- Output: timestamped validation data and an explicit continue/change/stop decision.

Phase-0 code is an experiment. It does not need to become the final consumer application, and production UI/backend work must not distort the positioning test.

### Production application direction after the Phase-0 gate

If Phase 0 supports continuing:

- shared application shell: React Native + TypeScript;
- framework/tooling: Expo with Development Builds, not Expo Go;
- navigation: Expo Router;
- Android spatial implementation: native Kotlin/ARCore module;
- iOS spatial implementation: native Swift/ARKit module, deferred until Mac/Xcode and iPhone test access exist;
- BLE: native-capable React Native library behind a transport interface;
- local-first database: SQLite;
- optional cloud backend: Supabase for authentication, PostgreSQL, optimised image storage and server-side functions.

The shared application consumes a platform-neutral spatial contract rather than importing ARCore or ARKit concepts throughout the UI.

### Platform scope

- Android is the engineering and first physical-validation platform.
- iPhone remains a required commercial target.
- iPhone spatial functionality is not part of the first technical validation because no Mac development environment is currently available.
- No claim of iPhone support may be made until it is built and tested on real Apple hardware.
- Non-AR screens may be designed cross-platform before then, but this does not count as iOS product validation.

### Alternatives not selected now

- **Expo Go:** cannot host the required custom native AR/BLE implementation.
- **Unity as the whole application:** useful for some cross-platform AR work, but unnecessarily heavy for the setup library, equipment, cloud and collaboration product.
- **Browser/PWA:** cannot provide dependable cross-platform AR and BLE for this product.
- **Two fully native applications immediately:** technically strong but unrealistic for a solo, near-zero-budget validation stage.

## System layers

### 1. Smartphone spatial layer
Responsibilities:
- establish the studio/subject reference frame;
- detect and identify LightGuide node markers;
- estimate node X/Y/Z position;
- estimate pitch/yaw/roll;
- store saved poses;
- compute current-vs-saved deltas;
- present live movement guidance;
- maintain the local setup database;
- later receive node telemetry over BLE.

Initial platform: native Android/Kotlin with ARCore.

### 2. Spatial-engine contract

The application-facing spatial interface should expose platform-neutral records:

- reference-frame ID and validity;
- node/marker ID;
- position X/Y/Z in metres;
- orientation in a documented representation;
- tracking state and confidence/quality;
- measurement timestamp;
- calibration/version metadata;
- saved-target versus current-pose delta;
- explicit stale/lost/relocalising states.

ARCore-specific objects must not be stored directly in the product database. The future ARKit implementation must be able to produce the same application-facing records.

### 3. Visual reference layer
Initial hypothesis:
- known-size, high-feature marker/reference associated with each LightGuide node;
- a stable subject/studio reference defines the coordinate origin between sessions;
- marker physical dimensions are known to improve pose estimation.

Marker format and size are not yet locked. Detection range and usability must be measured.

### 4. LightGuide node layer — future hardware
Prototype evaluation candidates:
- ESP32-S3-WROOM-1-N8R8 DevKitC-1-compatible controller;
- VL53L5CX 8×8 multi-zone ToF;
- Adafruit AS7343 14-channel Light/Color sensor;
- SparkFun BNO086 orientation sensor;
- future rechargeable battery and USB-C power design;
- RGB status indicator;
- compact stand-mountable enclosure.

These component choices are evaluation candidates until Phase 0 and later sensor testing validate the system requirements. See `V1_BOM.md`.

### 5. Guidance layer
The guidance engine compares saved and current configuration vectors and converts deltas into human instructions:
- move left/right;
- move forward/back;
- raise/lower;
- rotate clockwise/counter-clockwise;
- tilt up/down;
- show match/tolerance state.

Existing `src/guidance/` filtering, hysteresis and liveness concepts should be evaluated for reuse rather than copied blindly.

## Saved configuration model

A saved light configuration should ultimately support a vector such as:

- node identity;
- position relative to subject/studio frame: X, Y, Z;
- orientation: platform-neutral quaternion in the documented reference frame, with derived pitch/yaw/roll for display;
- local distance/depth observations;
- illumination/spectral measurements;
- optional light/modifier metadata;
- timestamp and calibration metadata.

V1 should store enough information to recreate physical state. AI interpretation is not required for the core loop.

The authoritative application persistence specification is the [seven-table design](product/DATABASE_DESIGN.md), [schema/snapshot format](product/DATABASE_SCHEMA.md) and [offline-sync procedure](product/OFFLINE_SYNC.md). These documents specify implementation work; they do not indicate an already deployed database.

## Multi-light model

Architecture must support multiple uniquely identified nodes from the beginning, but implementation should validate one light first. No design should assume only one light can ever exist.

## Offline/online split

Offline core:
- AR positioning;
- marker detection;
- BLE telemetry;
- setup save/recreate;
- local SQLite data store;
- guidance calculations.

Optional online later:
- account/cloud sync;
- team sharing;
- AI recommendations;
- analytics;
- firmware distribution.

## Positioning fallback

Phone AR + visual references is the preferred V1 hypothesis because it minimises BOM and avoids fixed anchors. It is not considered proven.

If Phase 0 shows unacceptable drift, range, relocalisation or orientation accuracy, evaluate reference improvements first, then sensor fusion or UWB. Do not hide a failed AR result by adding application features.

## Current architecture status

LOCKED as product direction:
- Measure → Save → Recreate;
- phone-led spatial layer;
- offline core;
- multi-node-compatible architecture;
- no dedicated node camera in V1;
- Android is the first physical-validation platform;
- platform-neutral spatial data contract.

LOCKED for Phase 0:
- native Kotlin/Android Studio;
- native ARCore;
- real ARCore-compatible Android phone.

PROVISIONAL after Phase 0:
- React Native/TypeScript application shell;
- Expo Development Builds;
- SQLite local store;
- Supabase optional cloud services;
- native spatial modules behind a shared interface.

DEFERRED:
- iOS ARKit implementation until Mac/Xcode and iPhone test access exist;
- exact marker system/size;
- exact production MCU/IMU;
- whether UWB is needed;
- final sensor BOM;
- final enclosure and battery architecture.
