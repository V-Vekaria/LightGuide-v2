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

## 11 September 2026 — independent Codex build

See [CODEX_BUILD_2026-09-11.md](CODEX_BUILD_2026-09-11.md) for executed checks and pending native/physical validation. App IDs and branch are isolated for comparison with Claude.


## 11 September 2026 — Codex offline Android APK verification

Workflow run [34612856890](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34612856890)
at source `27639e4b60dbfb4b82d13915b962db1acdbfbd0f` passed software,
positioning, APK compilation and emulator smoke jobs. Downloaded same-run APK
and smoke-evidence artifacts matched package `com.lightguide.codex` and APK
SHA-256 `58fd3c902f2c1a52f05ea7e6f1d76963a92d045d863578df82d2df8b364fc72b`.
Install, launch, save, force-close, offline reopen, all four manual recreation
steps and outcome recording passed. See
[CODEX_ANDROID_RETRY_2026-09-11.md](CODEX_ANDROID_RETRY_2026-09-11.md).

Outcome: PASS for offline Android phone-evaluation readiness. VAL-001–004 and
physical camera/AR, BLE, sensor and ±3 cm accuracy validation remain open.

## Branch and CI reconciliation — 2026-09-14

[BRANCH_STATUS_2026-09-14.md](BRANCH_STATUS_2026-09-14.md) records inspected source commits and GitHub run/job metadata. Codex run 34707182893 at d6110136934b3b78456a90b570d58ce00885145c passed software, positioning build/tests, Android build and emulator smoke jobs. Separate-branch local test reports are attributed rather than rerun. This review reconciles main's stale status with existing branches; it performs no new application or physical tests. Installed APK identity/user retest and VAL-001–004 remain open.


## Codex selected and integration prepared — 2026-09-14

The user chose the Codex implementation and authorised merging and branch cleanup. Runtime source is integrated from d6110136934b3b78456a90b570d58ce00885145c with current main documentation preserved. CI now covers main and pull requests. [Cleanup policy and branch inventory](BRANCH_CLEANUP_2026-09-14.md) retain recovery references and require successful integration checks before deletion. This entry records integration work, not a new physical validation result.

## Consolidation verified and branches retired — 2026-09-15

**Outcome:** PASS for software integration and repository cleanup.

- Integrated commit: `e6c63bb2cd7e759ae7adf91abe66e9e3aa051050`.
- [CI run 34897024247](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34897024247) passed software, positioning, Android build and Android emulator smoke jobs. The initial Android SDK setup failure was fixed by requesting platform-tools explicitly; all test gates remained enabled.
- [Cleanup run 34900253605](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34900253605) succeeded after verifying the integration and reviewed branch tips.
- Final branch/tag inspection confirmed only main remains and all six archive tags point to their exact reviewed commits. [Inventory and recovery references](BRANCH_CLEANUP_2026-09-14.md).
- The documentation closeout removes the completed one-time maintenance workflow/script and records these results; application runtime and dependencies are unchanged.

This does not establish physical AR accuracy, BLE/calibration, iOS, cloud or photographer acceptance. Installed-phone acceptance and VAL-001–004 remain open.

## 17 September 2026 — Demo-style recreation

Shared manual/practice guidance implemented from the user-approved interactive demo. [Evidence and limitations](DEMO_STYLE_RECREATION_2026-09-17.md) records software tests, bundle exports, browser-launch blocker and the phone retest. This does not close physical AR/BLE/sensor validation gates.
