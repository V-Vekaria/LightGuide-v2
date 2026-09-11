# LightGuide v2 — Current Status

**Status on `codex/offline-mobile-app`:** offline application implemented; software/browser validation and Android packaging in progress. This independent comparison branch does not alter Claude's work or `main`. Physical validation remains open.

See [Codex build evidence](validation/CODEX_BUILD_2026-09-11.md) and [run instructions](../apps/mobile/README.md).
**Current handoff:** [CLAUDE_BUILD_HANDOFF.md](engineering/CLAUDE_BUILD_HANDOFF.md).

## Implemented source recovered

The experiment was present on branch `experiment/phase-0-ar-positioning` at `5bc532b0d1bfd94f8f554867eec94e7403d1a7ce`, although main previously contained only its README. The Android source, Gradle wrapper, marker assets, printing instructions and JVM tests are now included under [experiments/phase-0-ar-positioning/](../experiments/phase-0-ar-positioning/README.md).

Source inspection confirms marker registration, reference-relative pose maths, target persistence, directional guidance and CSV/JSON logging. This is an experimental implementation, not the finished consumer application.

The earlier statement that the experiment existed only as a README applied to main, not all branches. Recovery preserves source/assets from the experiment commit; current documentation takes precedence over its historical defaults.

## Required corrections before physical validation

See [the source audit](validation/AR_SOURCE_AUDIT_2026-09-10.md). On this branch, source fixes address defaults, scoring, freshness, reference/marker-size compatibility, stable capture and log validity. Native compilation and physical accuracy are still pending; see the branch evidence record.

## Agreed and documented

- Measure → Save → Recreate; Android first; offline core; one-node validation.
- Native Kotlin/ARCore measurement harness; React Native/Expo offline shell may proceed alongside physical testing per ADR-015.
- Evaluation-kit identities and purchase-verification boundaries in [V1_BOM.md](V1_BOM.md).
- Seven-table [schema](product/DATABASE_SCHEMA.md) and [sync specification](product/OFFLINE_SYNC.md).
- Application defaults: ±3 cm distance/height, ±3 degrees direction/tilt; these do not establish measured accuracy.
- [Reuse research](product/COMPETITOR_REUSE_RESEARCH_2026-09-10.md): official ARCore/sensor libraries first, competitor imports and AI datasets later.

## Not yet established

- Current Android build/test pass in this environment; Android SDK, Gradle command, Kotlin compiler and adb were unavailable during this recovery audit.
- Passing physical position/relocalisation evidence. Printing instructions contain historical marker observations; these are not a complete ±3 cm validation result.
- A verified native APK and tested cloud sync. The React Native source, SQLite migrations and JavaScript bundles are implemented and checked on this branch.
- Exact received sensor variants, verified new-board pin map and combined sensor performance.
- Implemented new-node BLE firmware and complete GATT/security/message contract.
- iOS implementation/testing, production electronics or photographer validation.

## Next work

Coding agent: execute the [software handoff](engineering/CLAUDE_BUILD_HANDOFF.md), starting with source hardening, then the offline user journey. Report real test results and deliver Android installation instructions plus a focused physical checklist.

User: operate the phone, print the exact markers at measured dimensions, take independent measurements and verify received hardware when the software is ready.

## Legacy evidence

Root Preact, mock-device and Nano ESP32 firmware remain legacy engineering. The [24 August report](../device/reports/M5_conformance_acceptance.md) records 21/21 legacy contract tests; it is not proof of new-node BLE or Android positioning.

Keep evidence in [the validation log](validation/VALIDATION_LOG.md). Never count documentation, imported source or simulated data as a physical pass.
