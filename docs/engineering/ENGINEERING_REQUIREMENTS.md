# LightGuide V1 — Engineering Requirements

## Status legend
- **CONFIRMED** — requirement is part of the current V1 baseline.
- **TARGET** — initial quantitative target requiring validation.
- **OPEN** — implementation choice is intentionally not locked yet.

## Spatial positioning
- **CONFIRMED:** system must represent light position relative to a repeatable subject/studio reference frame.
- **CONFIRMED:** system must represent orientation sufficiently to guide practical recreation.
- **TARGET:** normal studio positioning error should aim for ≤5 cm under supported conditions.
- **TARGET:** close-range/product scenarios should aim for ≤2–3 cm where technically feasible.
- **TARGET:** orientation error should aim for ≤2–3° for pitch/yaw under supported conditions.
- **TARGET:** height reconstruction should aim for ≤3–5 cm.
- **OPEN:** phone AR + visual marker is the current first-choice method; UWB or other positioning may be added only if validation shows it is needed.

## Phase 0 acceptance gate
Phone AR remains the primary V1 spatial layer if repeated trials demonstrate approximately 3–5 cm positional repeatability and approximately 2–3° orientation repeatability with acceptable relocalisation and workflow usability.

If results are materially worse or inconsistent, positioning architecture must be revisited before commercial hardware is locked.

## Connectivity
- **CONFIRMED:** core V1 workflow must function offline.
- **CONFIRMED:** node-to-phone communication should use a local link; BLE is the current preferred hypothesis.
- **OPEN:** final BLE protocol and packet schema will be defined after Phase 0.

## Node sensing
- **TARGET/HYPOTHESIS:** VL53L5CX-class multi-zone ToF for local distance/depth sensing.
- **TARGET/HYPOTHESIS:** TCS3448-class multi-spectral sensing for illumination/spectral information.
- **OPEN:** final IMU selection; yaw stability must be solved by the spatial reference or a suitable sensor strategy.
- **OPEN:** final MCU, power architecture, battery capacity and enclosure.

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
