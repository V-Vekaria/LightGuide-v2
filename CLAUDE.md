# LightGuide v2 — AI Handoff

## Current product truth

LightGuide v2 is the commercial R&D project. Current V1 is **Measure → Save → Recreate** for real photographic lighting setups.

Do not revert the product to the older manual-target concept where a photographer enters a distance such as 50 cm and an ultrasonic/LDR node guides them to it. That implementation remains in this repository only as legacy reference and a source of potentially reusable engineering.

## Current V1 architecture

- Smartphone is the primary spatial-computing and UI layer.
- Android/ARCore is the first positioning prototype target.
- Known visual marker/reference on each node is the first positioning hypothesis.
- Phone establishes a world/reference frame and estimates node X/Y/Z plus pitch/yaw/roll.
- Future node communicates over BLE.
- Proposed future node sensing: VL53L5CX-class multi-zone ToF, TCS3448-class spectral/light sensing, and a suitable orientation sensor.
- Final MCU/IMU/UWB choices are not locked until positioning validation.
- Core Measure/Save/Recreate workflow must work offline.
- Architecture should support multiple light nodes, but only one node is built first.

## Immediate task

Build and validate `experiments/phase-0-ar-positioning/` before finalising commercial hardware.

The experiment must:
1. detect a known-size visual marker attached to a light stand;
2. record pose X/Y/Z and pitch/yaw/roll relative to a stable subject/studio reference;
3. save that pose;
4. allow the stand to be moved;
5. compute current-vs-saved delta;
6. guide the user back to the saved pose;
7. log measured error against independent ground truth.

Initial engineering gate: approximately 3–5 cm positional repeatability and 2–3° orientation under realistic studio conditions. Treat these as test targets, not marketing claims.

## Do not do yet

- Do not order/finalise a full commercial sensor BOM.
- Do not lock UWB unless AR validation demonstrates it is needed.
- Do not put a dedicated camera into the LightGuide node for V1.
- Do not build an AI lighting-recommendation engine as the V1 core.
- Do not modify the separate `LightGuide-Edge` university repository.

## Existing code

Potentially reusable: guidance filtering/stability logic, device abstraction/conformance concepts, setup storage, backup/export concepts and mock-device testing. Reuse only after checking fit with the current architecture.

## Sources of truth

Read in this order:
1. `docs/V1_PRODUCT_SPEC.md`
2. `docs/V1_ARCHITECTURE.md`
3. `docs/DECISIONS.md`
4. `docs/POSITIONING_RESEARCH.md`
5. `docs/TEST_PLAN.md`
6. this file

When a new architectural decision is made, record it in `docs/DECISIONS.md` before allowing code to make the decision implicit.
