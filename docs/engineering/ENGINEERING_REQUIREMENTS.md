# LightGuide V1 — Engineering Requirements

## Status legend
- **CONFIRMED** — requirement is part of the current V1 baseline.
- **TARGET** — initial quantitative target requiring validation.
- **OPEN** — implementation choice is intentionally not locked yet.

## Spatial positioning
- **CONFIRMED:** system must represent light position relative to a repeatable subject/studio reference frame.
- **CONFIRMED:** system must represent orientation sufficiently to guide practical recreation.
- **CONFIRMED application defaults:** distance and height matching tolerance ±3 cm; direction and tilt ±3 degrees; brightness relative tolerance ±10%; spectral similarity experimental.
- **TARGET, not measured capability:** accuracy/repeatability must support those tolerances under declared conditions; quantify uncertainty and do not infer accuracy from the configured threshold.
- **TARGET:** orientation repeatability is initially screened around 2–3 degrees, pending tests.
- **OPEN:** phone AR + visual marker is the current first-choice method; UWB or other positioning may be added only if validation shows it is needed.

## Phase 0 acceptance gate
Phone AR remains the primary V1 spatial layer if repeated trials demonstrate approximately 3–5 cm positional repeatability and approximately 2–3° orientation repeatability with acceptable relocalisation and workflow usability.

This is a broad feasibility screen, not proof of the tighter ±3 cm application tolerance. Report the fraction and error distribution of trials meeting the tighter distance/height target separately. A result in the 3–5 cm range may support further investigation but cannot be advertised as consistent ±3 cm performance.

If results are materially worse or inconsistent, positioning architecture must be revisited before commercial hardware is locked.

## Connectivity
- **CONFIRMED:** core V1 workflow must function offline.
- **CONFIRMED:** node-to-phone communication should use a local link; BLE is the current preferred hypothesis.
- **OPEN:** final BLE protocol and packet schema will be defined after Phase 0.

## Node sensing
- **TARGET/HYPOTHESIS:** VL53L5CX-class multi-zone ToF for local distance/depth sensing.
- **EVALUATION:** Adafruit AS7343 14-channel breakout, ADA6477, for illumination/spectral information; exact receipt and performance remain to verify.
- **EVALUATION:** SparkFun BNO086 Qwiic SEN-22857 for orientation; verify exact receipt, mounting and interference. Final production IMU remains open; raw yaw is not automatically aligned to the scene reference.
- **OPEN:** final MCU, power architecture, battery capacity and enclosure.

Controller evaluation uses ESP32-S3-WROOM-1-N8R8 DevKitC-1-compatible hardware. The authoritative purchase/component record is [V1_BOM.md](../V1_BOM.md). Neither the legacy Nano firmware nor its tests proves the new kit is integrated.

## Performance
- guidance should update fast enough to feel continuous during physical stand movement;
- stale pose/sensor data must never be presented as a confirmed match;
- the system must expose tracking quality/validity internally even if the normal UI simplifies it;
- saved setup data must persist locally across app restarts.

## Multi-light architecture
- data model must support multiple independently identified light nodes;
- first integrated prototype may implement only one physical node;
- node identifiers must remain stable within a saved setup.

## Safety and failure behaviour
- loss of tracking must stop match confirmation;
- loss of node telemetry must be visible and must not silently reuse stale readings;
- invalid or low-confidence positioning must trigger reacquisition rather than false precision.

## Verification
Each quantitative requirement must eventually link to a repeatable verification test and recorded result. Until validated, numeric values are engineering targets, not marketing claims.
