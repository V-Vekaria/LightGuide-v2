# LightGuide v2 — Current Status

**Status:** M0-M2 of the software delivery handoff are implemented with automated evidence: the Android AR harness is hardened, and an offline React Native application exists with a tested local-first data layer and a working save/manual-recreate journey. Physical AR validation and on-device app verification remain open - see "Not yet established".
**Current handoff:** [CLAUDE_BUILD_HANDOFF.md](engineering/CLAUDE_BUILD_HANDOFF.md).

## M0 — Android harness hardened (this delivery)

All [source-audit](validation/AR_SOURCE_AUDIT_2026-09-10.md) findings are addressed in source: the 3 cm/3 deg tolerance profile (with inherited-value flagging, not silent override), removal of the cosmetic match percentage in favour of an authoritative MatchState, FULL_TRACKING-vs-inferred marker gating, a reference-freshness policy, and per-target marker-configuration compatibility checking. Detail in [the experiment README's "Hardening" section](../experiments/phase-0-ar-positioning/README.md#hardening-m0-2026-09-10).

**Verified in this environment:** `./gradlew :app:testDebugUnitTest :app:assembleDebug` → BUILD SUCCESSFUL, 36/36 JVM tests passing (18 pre-existing PoseMathTest + 18 new MatchStateTest), debug APK assembled. Physical accuracy is still not established - see below.

## M1-M2 — Offline application (this delivery)

React Native/TypeScript/Expo Router application under [apps/mobile/](../apps/mobile/README.md): local-first SQLite (a subset of the seven-table design in [DATABASE_SCHEMA.md](product/DATABASE_SCHEMA.md)), immutable setup versions, archive distinct from Trash, pose-delta/guidance maths with an authoritative MatchState, and SpatialProvider/SensorTransport interfaces with only Unavailable/Simulated implementations - no native ARCore or BLE bridge exists yet. Full implemented/simulated/tested/untested breakdown is in [apps/mobile/README.md](../apps/mobile/README.md).

**Verified in this environment:** `npx tsc --noEmit` clean; `npx jest` 40/40 passing against a real file-backed SQLite database (not a mock - see apps/mobile/README.md "Testing approach"), including two real bugs the tests caught before this was committed; `npx expo-doctor` 18/18. **Not verified:** the native Android debug build did not complete in this environment (`./gradlew :app:assembleDebug` stopped after 30+ minutes with no forward progress for the last 20+, likely OneDrive-related - see [VALIDATION_LOG.md](validation/VALIDATION_LOG.md) "Android native build of apps/mobile/" and apps/mobile/README.md), so no APK exists for this app yet, and on-device/emulator behaviour of its screens and `expo-sqlite` binding remains unverified. No emulator or physical device was available in this environment either way.

## Required corrections before physical validation

The Phase-0 experiment's code-level gaps from the source audit are now fixed (see M0 above). What remains is exactly what the audit could not fix: real physical trials. The recovered code's original 4 cm / 2.5 degree defaults and cosmetic match percentage are gone; do not reintroduce them.

## Agreed and documented

- Measure → Save → Recreate; Android first; offline core; one-node validation.
- Native Kotlin/ARCore measurement harness, hardened per M0 above; React Native/Expo offline shell implemented per M1-M2 above, alongside physical testing per ADR-015.
- Evaluation-kit identities and purchase-verification boundaries in [V1_BOM.md](V1_BOM.md).
- Seven-table [schema](product/DATABASE_SCHEMA.md) and [sync specification](product/OFFLINE_SYNC.md); a local-first subset is now implemented (M1-M2), cloud sync remains unimplemented and deferred.
- Application defaults: ±3 cm distance/height, ±3 degrees direction/tilt; these do not establish measured accuracy.
- [Reuse research](product/COMPETITOR_REUSE_RESEARCH_2026-09-10.md): official ARCore/sensor libraries first, competitor imports and AI datasets later.

## Not yet established

- Passing physical position/relocalisation evidence. Printing instructions contain historical marker observations; these are not a complete ±3 cm validation result. VAL-001–003 in [VALIDATION_LOG.md](validation/VALIDATION_LOG.md) remain planned.
- On-device behaviour of apps/mobile/ - screens, expo-sqlite's real binding, and the native Android build of the RN app itself. See apps/mobile/README.md for exactly what automated evidence exists instead.
- Photo capture and equipment-picker UI in the offline app (data model/repositories exist; not wired into screens yet).
- Exact received sensor variants, verified new-board pin map and combined sensor performance.
- Implemented new-node BLE firmware and complete GATT/security/message contract; the app's SensorTransport interface has no non-Unavailable implementation.
- A native Android/ARCore SpatialProvider behind the app's spatial interface (M3 describes this as optional; not done in this delivery).
- iOS implementation/testing, production electronics, cloud sync, or photographer validation.

## Next work

Coding agent: M3 (verify/package/hand over) is next - see [CLAUDE_BUILD_HANDOFF.md](engineering/CLAUDE_BUILD_HANDOFF.md).

User: operate the phone for both apps - print the exact Phase-0 markers at measured dimensions for AR validation using the hardened experiment APK, and build/install the offline app locally (commands in apps/mobile/README.md, including the JDK-17 and possible OneDrive-workaround notes) since no APK for it exists yet, then exercise its save/recreate journey to confirm on-device behaviour that could not be verified in this environment.

## Legacy evidence

Root Preact, mock-device and Nano ESP32 firmware remain legacy engineering. The [24 August report](../device/reports/M5_conformance_acceptance.md) records 21/21 legacy contract tests; it is not proof of new-node BLE or Android positioning.

Keep evidence in [the validation log](validation/VALIDATION_LOG.md). Never count documentation, imported source or simulated data as a physical pass.
