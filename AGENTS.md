# AGENTS.md — start here

## Current product direction

LightGuide v2 is the commercial R&D repository. The current V1 is **Measure → Save → Recreate** real photographic lighting setups.

Before changing code, read:
1. `CLAUDE.md`
2. `docs/V1_PRODUCT_SPEC.md`
3. `docs/V1_ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. `docs/TEST_PLAN.md`

## Immediate engineering task

The active milestone is `experiments/phase-0-ar-positioning/`.

Build/validate the Android ARCore positioning proof of concept before final commercial hardware decisions. The experiment must test whether a phone plus known visual references can record and restore stand X/Y/Z and pitch/yaw/roll with roughly 3–5 cm positional repeatability and 2–3° orientation under realistic studio conditions.

Do not add ESP32/BLE/spectral/ToF hardware work to Phase 0 unless it becomes necessary to answer the positioning question.

## Legacy implementation warning

The existing root `src/`, `mock-device/`, `device/`, `docs/superpowers/` and associated tests belong to an earlier commercial prototype built around manually entered target distance/light values, ultrasonic sensing and LDR measurements.

That code is preserved because it contains useful engineering. It is **not the current product architecture**.

Potentially reusable after review:
- guidance filtering, hysteresis, arrival and liveness concepts;
- device abstraction/conformance patterns;
- setup persistence and backup/export concepts;
- mock-device/test infrastructure;
- UI interaction lessons.

Do not silently make the old manual-target workflow current again.

## Rules for new V1 work

- Product direction: Measure → Save → Recreate.
- Smartphone is the primary spatial and UI layer.
- Android/ARCore is the first positioning prototype.
- Visual-marker/reference positioning is a hypothesis, not a proven fact.
- Core operation must remain offline-capable.
- Design data models for multiple light nodes, implement one first.
- Do not lock UWB, MCU, IMU or final commercial sensor BOM before Phase 0 evidence.
- Do not add a dedicated node camera for V1.
- Do not make AI lighting recommendations the V1 core.
- Do not modify the separate `LightGuide-Edge` university repository.

## Existing legacy tests

The earlier companion-app implementation has extensive tests and should remain buildable while it is preserved. If modifying legacy modules for reuse, understand their existing liveness/staleness semantics before deleting or simplifying them.

## Decision discipline

Any architecture change must be recorded in `docs/DECISIONS.md`. Mark it as CONFIRMED, HYPOTHESIS, DEFERRED or LEGACY. Code should not become the only place where a major product decision exists.
