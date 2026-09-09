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

Current evaluation candidates:
- VL53L5CX 8×8 multi-zone ToF breakout;
- Adafruit AS7343 14-channel Light/Color breakout (ADA6477);
- SparkFun BNO086 Qwiic orientation breakout (SEN-22857);
- ESP32-S3-WROOM-1-N8R8 DevKitC-1-compatible development board.

The AS7343 is the purchased/recommended evaluation direction; earlier documentation mentioning a TCS3448-class device remains an alternative for later comparison, not the ordered evaluation sensor.

Do not treat these exact parts as the production BOM until Phase 0 positioning and subsequent sensor experiments establish that each part adds sufficient value.

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

## ADR-010 — Prototype evaluation kit does not lock the product BOM

**Status:** CONFIRMED

The September 2026 ESP32-S3 and sensor purchases are an evaluation kit, not a final commercial-hardware decision.

Recorded hardware contexts:
- university: Arduino Nano 33 BLE Sense and academic sensors;
- legacy commercial bench implementation: Arduino Nano ESP32 with HC-SR04/LDR and Wi-Fi SoftAP;
- new evaluation controller: ESP32-S3-WROOM-1-N8R8 DevKitC-1-compatible board;
- new evaluation sensors: VL53L5CX, BNO086 SEN-22857 and AS7343 ADA6477.

The new board supports BLE, but BLE firmware is not yet implemented. Its pin map and board configuration differ from the existing Arduino Nano ESP32 and must be verified after arrival.

Only the controller order has been verified from an order screenshot. The user reports that the sensor kit was ordered, but exact seller listings/received parts remain unverified until receipts or photographs are checked.

The detailed and authoritative component status is maintained in `V1_BOM.md`.

## ADR-011 — Phased mobile and spatial stack

**Status:** CONFIRMED

Use native Android/Kotlin with ARCore for Phase 0 and the first physical positioning validation.

If the AR positioning gate passes, build the broader application shell with React Native/TypeScript and Expo Development Builds. Expose Android ARCore through a native module behind a platform-neutral spatial-engine interface. Do not use Expo Go as the product test environment.

iPhone remains a commercial target, but its Swift/ARKit spatial implementation is deferred until Mac/Xcode and physical iPhone test access exist. Cross-platform screen design is not evidence of tested iOS spatial support.

Reasoning:
- AR positioning is the highest-risk capability and should be tested through the best-supported native Android path;
- the current Windows development environment and available ARCore phone support Android validation;
- no Mac is currently available, so promising simultaneous iOS delivery would be untestable;
- a React Native shell remains appropriate for the larger non-AR product if native spatial engines are isolated;
- Unity, browser-only delivery and two complete native apps are rejected for the current solo, near-zero-budget stage.

The production-shell choice remains conditional on Phase 0 succeeding; the Phase-0 experiment may be discarded without becoming technical debt.

## ADR-012 — Lean seven-table application database

**Status:** CONFIRMED — logical prototype design; implementation pending.

Use seven core application tables: profiles, equipment, shoots, setups, setup_versions, images and recreations. Store scene objects, measurements, equipment-at-capture and calibration context in validated, versioned scene snapshots instead of separate per-object/per-measurement tables initially.

Preserve exact target versions, actual recreation snapshots, measurement provenance, ownership, local-first saving, conflict preservation and 30-day Trash. Authentication and local sync/media infrastructure are separate from the seven-table count.

Defer reusable equipment kits, collaboration, dedicated analytics and AI-specific tables until their features are implemented. Preserve required Phase-0 validation logging; do not continuously retain every BLE reading by default.

Reasoning: reduce solo-prototype implementation complexity without removing information needed for recreation. Advanced per-light concurrent editing and cross-setup measurement queries are accepted trade-offs.

This replaces the earlier, more granular database proposal from discussion. It does not replace the native Android/ARCore Phase-0 gate, create a database, migrate existing data or lock production infrastructure.

Authoritative detail and remaining implementation work: [Lean Prototype Database Design](product/DATABASE_DESIGN.md).
