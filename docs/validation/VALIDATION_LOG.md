# LightGuide — Validation Log

## Purpose
This is the evidence record for LightGuide. Product and engineering documents may contain hypotheses; this file records what was actually tested, observed and concluded.

## Evidence rule
Every important architecture decision should eventually point to one or more entries here, a linked experiment report, or another reproducible source of evidence.

## Entry template

### VAL-XXX — Short title
**Date:** YYYY-MM-DD  
**Question:** What uncertainty are we testing?  
**Requirement/risk:** Link to requirement or risk ID where applicable.  
**Method:** Exact test procedure.  
**Equipment:** Phone/hardware/software and versions.  
**Environment:** Distance, lighting, room/studio conditions, marker size, etc.  
**Trials:** Number of repeated trials.  
**Ground truth:** How truth was independently measured.  
**Results:** Raw/summary measurements.  
**Pass criteria:** Predefined threshold.  
**Outcome:** PASS / FAIL / INCONCLUSIVE.  
**Decision:** What changes because of this result?  
**Artifacts:** Links to CSV, screenshots, video, code or experiment folder.

---

## Planned validation

### VAL-001 — AR pose repeatability
**Status:** Planned  
**Question:** Can Android ARCore + a known visual reference repeatedly estimate the light stand pose accurately enough for V1?  
**Risk:** R-001  
**Experiment:** `../../experiments/phase-0-ar-positioning/`  
**Primary measures:** position error, orientation error, relocalisation success, scan time and tracking failures.  
**Initial target:** approximately 3–5 cm position and 2–3° orientation under supported conditions.

### VAL-002 — Marker size and detection range
**Status:** Planned  
**Question:** What marker/reference dimensions provide practical detection without making the product awkward in a studio?  
**Risk:** R-002  
**Measures:** detection distance, viewing angle, reacquisition time and user handling.

### VAL-003 — Cross-session relocalisation
**Status:** Planned  
**Question:** Can the saved reference frame be re-established reliably in a later session?  
**Risk:** R-003  
**Measures:** restoration error after ending/restarting the AR session and moving the phone.

### VAL-004 — End-to-end one-light recreation
**Status:** Future  
**Question:** Does the integrated system let a user restore a moved light faster and/or more consistently than a manual method?  
**Measures:** completion time, final geometry error, failed attempts, user comprehension and photographic outcome.

## Decision discipline
Do not convert a target into a claimed specification until it has passed a defined validation test under stated conditions.

## Source recovery audit — 2026-09-10

The implementation was found on branch experiment/phase-0-ar-positioning at 5bc532b0d1bfd94f8f554867eec94e7403d1a7ce and incorporated into the current baseline. See [source audit](AR_SOURCE_AUDIT_2026-09-10.md) for methods, evidence and code gaps.

Outcome: source/assets located and inspected; no new physical trial or Android build/test pass claimed. VAL-001–004 remain open. Historical marker observations in the recovered printing instructions are retained, not promoted into a complete ±3 cm result.

## Software verification — 2026-09-10 (M0–M2 delivery)

**Status:** Automated software evidence only. None of this is physical positioning accuracy evidence and none of it advances VAL-001–004, which remain Planned.

**M0 — Phase-0 harness hardening.** `cd experiments/phase-0-ar-positioning/android && ./gradlew :app:testDebugUnitTest :app:assembleDebug` → BUILD SUCCESSFUL, 36/36 JVM tests passing (18 PoseMathTest + 18 new MatchStateTest covering the 3 cm/3 deg boundary, MatchState gating on inferred/stale/lost-tracking/incompatible-target, and capture eligibility), debug APK assembled to the redirected build output (see experiment README, "Build and deploy"). Ran in this environment using Android Studio's bundled JBR as JAVA_HOME; Gradle 9.7.1 supports it.

**M1–M2 — apps/mobile/ offline application.** `npx tsc --noEmit` clean. `npx jest` 40/40 passing against a real, file-backed SQLite database via Node's built-in `node:sqlite` (not `:memory:` for the durability tests, not a mock - see apps/mobile/README.md "Testing approach"). Coverage includes restart durability (close + reopen the DB file), immutable setup versions (editing publishes a new version; an in-progress recreation's target version does not move under it), archive-vs-Trash separation, and guidance/MatchState correctness. This run caught and fixed two real bugs before commit: inverted directional-correction labels (MOVE LEFT/RIGHT and RAISE/LOWER were swapped) in `src/guidance/guidance.ts`, and a Windows-only test-cleanup race unrelated to app code. `npx expo-doctor` 18/18.

**Android native build of apps/mobile/ — attempted, blocked, not completed.** `npx expo prebuild --platform android` succeeded, generating a native project. `./gradlew :app:assembleDebug` first failed outright (`Unsupported class file major version 69`: the RN/Expo template's pinned Gradle 8.14.3 cannot run on Java 25, the only JDK preinstalled in this environment). Retried after downloading a portable Temurin JDK 17: the build then ran for over 30 minutes, confirmed by OS-level CPU-time accounting to be doing real compilation work (not hung) for at least the first ~20 minutes, but produced no further task-progress output for the last 20+ minutes before this run was stopped rather than left indefinitely. The working tree is inside a OneDrive-synced folder; this repository's own legacy notes (`docs/STATUS.md` predecessor content, and this experiment's own `build.gradle.kts` comment) record OneDrive file-locking/sync interference as a known cause of exactly this kind of anomaly on this machine, and the Phase-0 Android build works around it by redirecting its output outside OneDrive - the generated `apps/mobile/android` project does not have an equivalent redirect. This is the leading hypothesis, not a confirmed root cause.

**Outcome: INCONCLUSIVE, not FAIL.** No compile error was produced; the build did not reach BUILD SUCCESSFUL or BUILD FAILED in the time available. Do not read this as evidence the app fails to build. Exact reproduction commands, and the recommended workaround (exclude `apps/mobile/android` and `apps/mobile/node_modules` from OneDrive sync, or run the build from a non-synced checkout), are in `apps/mobile/README.md`.

**Not established by any of the above:** a completed native Android build or on-device/emulator behaviour of apps/mobile/'s screens or its `expo-sqlite` binding (`src/db/driver.expo.ts`) - no emulator or physical device was available in this environment, and the native build itself did not complete; and, as always, real AR positioning accuracy, which requires the physical trials in VAL-001–003.
