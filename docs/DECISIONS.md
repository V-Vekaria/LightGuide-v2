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

AS7343 ADA6477 is the recommended evaluation direction; exact sensor receipt is still unverified. Superseded unnamed/alternative sensor suggestions are not current hardware instructions; use V1_BOM.md for authoritative component status.

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

## ADR-013 — Prototype schema and offline-sync specification v1

**Status:** CONFIRMED implementation baseline; not implemented or validated.

The seven domain tables in ADR-012 now have a field/type/relationship specification in [DATABASE_SCHEMA.md](product/DATABASE_SCHEMA.md). Structured scene snapshots preserve measurement provenance, calibration context, immutable target versions and actual recreation evidence.

The protocol in [OFFLINE_SYNC.md](product/OFFLINE_SYNC.md) specifies durable local saves, guest attachment, idempotent operation IDs, server-authoritative revisions, preserved setup branches, explicit conflict resolution, private image transfers and deletion/tombstone recovery. Internal local/server sync records are additional infrastructure, not new product features or a claim of seven total physical tables.

Matching defaults retain the user's distance/height tolerance of 0.03 m, direction/tilt 3 degrees, and brightness relative tolerance 0.10. They are application targets, not demonstrated sensor accuracy or a replacement for measured Phase-0 validation criteria.

Implementation details use a versioned engineering baseline: reference coordinates originate at the floor beneath the subject, orientations use explicit platform-neutral quaternions and unknown/stale data cannot qualify for measured Match. These conventions require adapter and validation tests before use.

Cloud sync remains after the positioning gate. Do not build this full backend as a prerequisite for the native Android/ARCore experiment. Required next work is migrations, validators, transactional functions, client integration and acceptance tests—not more database feature expansion.

## ADR-014 — Current handoff cleanup and legacy isolation

**Status:** CONFIRMED documentation maintenance; no product implementation or validation claim.

At the user's request, remove obsolete plans and stale handover details from active entry points. Move the August companion implementation/design plans and previous app/firmware handover snapshots into docs/archive/legacy-companion/. Preserve their original text as dated evidence, not instructions.

Refresh root CLAUDE.md, AGENTS.md, README.md and current status with the Android-first route, N8R8/VL53L5CX/BNO086/AS7343 evaluation kit, seven-table schema/sync links and validation boundaries. Replace the legacy device's stale skeleton/milestone instructions with explicit maintenance-only guidance. Label retained legacy wiring/command notes.

Retain legacy code, scripts, traces, dependency files and acceptance reports at their existing paths so reference builds are not broken. Remove obsolete sensor alternatives from active guidance. Reuse the onboard programmable RGB LED if verified; do not assume other feedback hardware exists.

The ±3 cm application matching default remains distinct from the historical 3–5 cm feasibility screen; both must be evaluated honestly. Neither documentation cleanup nor completed planning finalises production hardware, proves sensor/AR accuracy or supplies an implemented BLE/database system.

Recovery: archived originals and the parent Git commit retain the pre-cleanup material. No source or measured test evidence is discarded.

## ADR-015 — Recover existing AR source and develop the offline application alongside validation

**Date:** 2026-09-10  
**Status:** CONFIRMED delivery decision; physical capability remains unvalidated.

The user requested checking the repository for prior Android work, applying the reuse decisions and preparing autonomous application development/testing before their own device tests.

A branch audit found the implementation on `experiment/phase-0-ar-positioning` at `5bc532b0d1bfd94f8f554867eec94e7403d1a7ce`. Incorporate that experiment's files into the current baseline while retaining current documentation and legacy code. Do not recreate the scaffold or merge obsolete branch-wide planning files. See [source audit](validation/AR_SOURCE_AUDIT_2026-09-10.md).

The recovered source is experimental. Its 4 cm / 2.5 degree defaults, cosmetic match score, stale-tracking rules and reference/configuration lifecycle need reconciliation before new physical trials. Source recovery does not resolve those defects.

Permit the React Native/TypeScript + Expo Development Builds offline application under apps/mobile/ to proceed alongside physical Phase-0 testing. This changes the sequencing restrictions in ADR-009/011: the gate controls validated live positioning and final hardware decisions, not independent local UI/storage/manual-recreation implementation. Maintain a platform-neutral spatial interface and a separate native measurement harness so an AR change does not require rewriting the offline application.

Reuse official ARCore features and manufacturer libraries for BNO086, VL53L5CX and AS7343, pinning compatible versions and retaining applicable licences during implementation. See [research and adoption boundaries](product/COMPETITOR_REUSE_RESEARCH_2026-09-10.md). Competitor export import, AI datasets, cloud services and production electronics remain later work, not prerequisites for the offline prototype.

The coding agent should complete available automated software checks, report blocked native/toolchain checks and continue independent work. The user performs physical print/pose/relocalisation, BLE and sensor tests. Mock or emulator results cannot establish ±3 cm accuracy, calibrated light measurement or iOS support.

Authoritative task sequence and acceptance criteria: [CLAUDE_BUILD_HANDOFF.md](engineering/CLAUDE_BUILD_HANDOFF.md).

## ADR-016 — Independent Codex comparison build (11 September 2026)

**Historical: active comparison restriction superseded by ADR-017.**

At the user's request, Codex implementation remains on `codex/offline-mobile-app`, with mobile ID `com.lightguide.codex` and harness ID `com.lightguide.codex.phase0`. Do not merge or overwrite Claude's implementation; the user will compare both. This changes distribution identity, not the agreed core scope or physical-validation gates. See the [build evidence](validation/CODEX_BUILD_2026-09-11.md).


## ADR-017 — Select Codex implementation and retire redundant branches

**Date:** 2026-09-14
**Status:** CONFIRMED by the user's choice of the Codex app and explicit request to merge useful work and delete unneeded branches.

Integrate the tested Codex source at d6110136934b3b78456a90b570d58ce00885145c into main while retaining main's current documentation. Keep application/harness package IDs and local data unchanged. Do not combine the alternative Claude app's repositories, navigation or spatial maths with this implementation merely to merge every branch.

Retire already-merged and superseded branches after a passing integration workflow. Preserve each exact old tip with a recovery tag before deletion; skip/fail if a branch moved, is protected, or a backup points elsewhere. This replaces ADR-016's instruction to keep both implementations active. It does not change product scope or physical-validation gates.

See [branch cleanup](validation/BRANCH_CLEANUP_2026-09-14.md) for per-branch findings and recovery references.

## ADR-018 — Shared demonstration and recreation presentation

**Date:** 2026-09-17
**Status:** IMPLEMENTED on the demo-style recreation branch; release verification tracked in its PR.

At the user's request, use a shared React Native recreation workspace for the pitch practice flow and manual recreation. Keep one main instruction, current/saved values, and top/side views. Reuse existing storage and immutable target versions. Practice state is local and synthetic; manual current inputs are explicitly session-only and cannot become sensor evidence. Keep missing coordinates unknown rather than inferring position from scalar range. Do not activate or claim AR/BLE integration as a consequence of UI parity. See [implementation and test evidence](validation/DEMO_STYLE_RECREATION_2026-09-17.md).

## ADR-019 — Photographer usability and explicit assessments

**Date:** 2026-09-18
**Status:** Implemented; exact release checks tracked in the delivery PR.

The approved UX review drives photo-first manual recreation, uncropped expandable photos with button zoom/panning, a direct disposable practice entry, visual library cards, fractional shutter entry and optional camera fields within capture. Camera draft fields are optional for backwards compatibility. Existing package, database filename, scene schema and saved target versions remain unchanged.

SQLite user_version 2 transactionally rebuilds only the leaf recreations table to permit not_evaluated, restoring its index and immutable-evidence trigger. Existing completed records and photos remain unchanged. Unfinished legacy assessment selections are cleared once because the old close_enough default cannot be distinguished from a deliberate choice; step and notes remain. New attempts require explicit selection. Current manual readings remain visit-only and resume explains re-entry.

Live sensing, expanded categories and full shoot scheduling remain outside this usability delivery. See [evidence](validation/PHOTOGRAPHER_UX_2026-09-18.md).

## ADR-020 — Visible recreation guidance and app-owned device session

**Date:** 2026-09-24
**Status:** Implemented; Android release verification pending.

Show the existing recreation diagram and saved/current measurements directly, ahead of detailed instructions. Missing pose stays unknown and manual side-view spacing remains illustrative. Keep the large-text fallback and immutable saved targets.

A root DeviceProvider owns one foreground BLE controller; navigating away from the device screen only removes a subscriber. Shared screen chrome distinguishes connected/fresh readings, waiting, stopped readings and disconnection. Freshness uses the existing one-second threshold. Capture reuses the existing validated pending-snapshot path. App backgrounding is not a promise of background BLE support.

No storage migration, protocol revision, dependency or physical-validation claim is introduced. See [implementation evidence](validation/DEVICE_WORKFLOW_UX_2026-09-24.md).
