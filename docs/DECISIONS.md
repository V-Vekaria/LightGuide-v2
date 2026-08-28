# LightGuide v2 — Architecture Decisions

This file records product and engineering decisions so future contributors and AI coding agents do not silently reopen settled questions.

## Status labels

- **CONFIRMED** — current product/architecture decision.
- **HYPOTHESIS** — preferred approach that must be validated experimentally.
- **DEFERRED** — intentionally not decided yet.
- **LEGACY** — preserved earlier prototype decision; not current truth.

## ADR-001 — V1 product focus

**Status:** CONFIRMED

V1 is **Measure → Save → Recreate** real photographic lighting setups.

Reasoning: setup memory/recreation is the clearer product gap. AI-generated 'optimal lighting' and virtual lighting design already have strong adjacent products. Physical capture plus closed-loop recreation is the stronger initial differentiation.

AI recommendation/adaptation belongs to later versions, not the V1 core.

## ADR-002 — Phone-led positioning before UWB

**Status:** HYPOTHESIS

Test Android ARCore + known visual references/markers before adding UWB.

Reasoning:
- reduces node BOM;
- avoids fixed anchor installation;
- phone already supplies camera, IMU, compute and UI;
- easier to validate before hardware selection.

Acceptance target: approximately 3–5 cm positional repeatability and 2–3° orientation in realistic studio use.

Fallback: improve visual reference design or add UWB/sensor fusion if evidence shows AR alone is insufficient.

## ADR-003 — Multi-light architecture, one-node implementation first

**Status:** CONFIRMED

Data models and identity must allow multiple lights from day one. Engineering validation begins with one node to reduce complexity.

## ADR-004 — Offline core

**Status:** CONFIRMED

Measure, save, recreate, local positioning, local guidance and future BLE telemetry must not require internet access.

Cloud sync, team sharing, AI recommendations and analytics may be optional online features later.

## ADR-005 — No dedicated node camera for V1

**Status:** CONFIRMED

Use the smartphone camera/computation for visual positioning and later subject analysis. Do not add a camera to the LightGuide hardware node unless future evidence creates a strong requirement.

## ADR-006 — Commercial sensor stack is provisional

**Status:** DEFERRED

Current candidates:
- VL53L5CX-class multi-zone ToF;
- TCS3448-class spectral/light sensor;
- high-quality orientation sensor;
- ESP32-S3-class MCU.

Do not treat exact part numbers as locked until Phase 0 positioning is complete and system requirements are clearer.

## ADR-007 — Existing manual-target prototype

**Status:** LEGACY

The existing app/firmware architecture based on a manually entered distance target plus ultrasonic/LDR measurements is preserved for reference.

Potentially reusable:
- filtering/hysteresis;
- liveness/staleness handling;
- guidance presentation ideas;
- device abstraction/conformance testing;
- setup persistence/export concepts;
- mock-device development.

Not reusable as product truth:
- manual 50 cm target as the main V1 workflow;
- HC-SR04/LDR as commercial positioning/light architecture;
- assumption that distance alone represents stand position.

## ADR-008 — University project separation

**Status:** CONFIRMED

`LightGuide-Edge` remains a separate academic project. Commercial v2 may cite lineage or reuse lessons/data where appropriate, but must not rewrite the university repository or make it the baseline architecture.

## ADR-009 — Current engineering priority

**Status:** CONFIRMED

Do not continue broad architecture redesign or final hardware purchasing now. Build the Phase-0 AR positioning proof of concept and make the next positioning decision from measured evidence.
