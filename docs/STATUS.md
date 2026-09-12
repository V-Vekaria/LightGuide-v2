# LightGuide v2 — Current Status

**Status on `codex/offline-mobile-app`:** offline application implemented and ready for Android phone evaluation. Run [34612856890](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34612856890) at `27639e4b60dbfb4b82d13915b962db1acdbfbd0f` passed software/browser checks, APK compilation, installation, launch, save, force-close, offline reopen and all four manual recreation steps plus outcome recording. Downloaded artifact and smoke evidence agree on package `com.lightguide.codex` and APK SHA-256 `58fd3c902f2c1a52f05ea7e6f1d76963a92d045d863578df82d2df8b364fc72b`. Physical camera/AR, BLE, sensors and ±3 cm accuracy validation remain open. See [Android retry evidence](validation/CODEX_ANDROID_RETRY_2026-09-11.md).

**12 September developer audit:** the subsequent photo/layout repair at `1d8348404005b945434647f2f523e4e28a996ee0` passed CI run 34650679069. Additional draft recovery, shoot-reference, recreation-state/timing and responsive-layout fixes are now prepared for release 0.1.1 (Android build 2). Local audit checks pass; this new revision's Android build and smoke gate remain pending. See [application audit](validation/CODEX_APPLICATION_AUDIT_2026-09-12.md).

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

- Passing physical position/relocalisation evidence. Printing instructions contain historical marker observations; these are not a complete ±3 cm validation result.
- Physical native AR runtime verification and tested cloud sync. The offline mobile shell passed emulator installation, persistence and manual recreation; camera/AR accuracy, BLE and cloud sync remain unimplemented or untested.
- Exact received sensor variants, verified new-board pin map and combined sensor performance.
- Implemented new-node BLE firmware and complete GATT/security/message contract.
- iOS implementation/testing, production electronics or photographer validation.

## Next work

Coding agent: execute the [software handoff](engineering/CLAUDE_BUILD_HANDOFF.md), starting with source hardening, then the offline user journey. Report real test results and deliver Android installation instructions plus a focused physical checklist.

User: operate the phone, print the exact markers at measured dimensions, take independent measurements and verify received hardware when the software is ready.

## Legacy evidence

Root Preact, mock-device and Nano ESP32 firmware remain legacy engineering. The [24 August report](../device/reports/M5_conformance_acceptance.md) records 21/21 legacy contract tests; it is not proof of new-node BLE or Android positioning.

Keep evidence in [the validation log](validation/VALIDATION_LOG.md). Never count documentation, imported source or simulated data as a physical pass.
