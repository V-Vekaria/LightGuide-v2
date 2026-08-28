# LightGuide v2 — V1 Architecture

## Architecture goal

Support reliable **Measure → Save → Recreate** of physical studio-lighting setups while keeping the core workflow offline and avoiding unnecessary hardware complexity before positioning is validated.

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

Initial platform: Android with ARCore.

### 2. Visual reference layer
Initial hypothesis:
- known-size, high-feature marker/reference associated with each LightGuide node;
- a stable subject/studio reference defines the coordinate origin between sessions;
- marker physical dimensions are known to improve pose estimation.

Marker format and size are not yet locked. Detection range and usability must be measured.

### 3. LightGuide node layer — future hardware
Provisional components:
- ESP32-S3-class MCU with BLE/Wi-Fi capability;
- VL53L5CX-class multi-zone ToF for local depth/distance context;
- TCS3448-class spectral/light sensor for illumination, CCT/spectral/flicker information;
- suitable high-quality orientation sensor;
- rechargeable battery and USB-C;
- RGB status indicator;
- compact stand-mountable enclosure.

These component choices are provisional until Phase 0 validates the positioning strategy.

### 4. Guidance layer
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
- orientation: pitch, yaw, roll;
- local distance/depth observations;
- illumination/spectral measurements;
- optional light/modifier metadata;
- timestamp and calibration metadata.

V1 should store enough information to recreate physical state. AI interpretation is not required for the core loop.

## Multi-light model

Architecture must support multiple uniquely identified nodes from the beginning, but implementation should validate one light first. No design should assume only one light can ever exist.

## Offline/online split

Offline core:
- AR positioning;
- marker detection;
- BLE telemetry;
- setup save/recreate;
- local data store;
- guidance calculations.

Optional online later:
- account/cloud sync;
- team sharing;
- AI recommendations;
- analytics;
- firmware distribution.

## Positioning fallback

Phone AR + visual references is the preferred V1 hypothesis because it minimizes BOM and avoids fixed anchors. It is not considered proven.

If Phase 0 shows unacceptable drift, range, relocalisation or orientation accuracy, evaluate augmentation with UWB or other sensor fusion.

## Current architecture status

LOCKED as product direction:
- Measure → Save → Recreate;
- phone-led spatial layer;
- offline core;
- multi-node-compatible architecture;
- no dedicated node camera in V1.

HYPOTHESIS TO VALIDATE:
- ARCore + known markers can meet the required repeatability.

NOT YET LOCKED:
- exact marker system/size;
- exact MCU;
- exact IMU;
- whether UWB is needed;
- final sensor BOM;
- final enclosure and battery architecture.
