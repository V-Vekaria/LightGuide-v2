# LightGuide v2 — Current Status

**Reviewed 14 September 2026.** Main is the common documentation/experiment baseline. Two offline application implementations exist on separate branches and remain separate for the user's comparison. Main does not contain `apps/mobile/`; its absence is not evidence that no app has been built.

## Implementation and evidence by branch

| Track | Inspected commit | Current evidence |
|---|---|---|
| `main` before this documentation update | `56e960347162645a767ff8be970172e45152f5de` | Recovered Android experiment, common specifications and legacy implementation. Later mobile/harness fixes are not merged here. |
| `codex/offline-mobile-app` | `d6110136934b3b78456a90b570d58ce00885145c` | [Mobile README](https://github.com/V-Vekaria/LightGuide-v2/blob/d6110136934b3b78456a90b570d58ce00885145c/apps/mobile/README.md) documents local SQLite, photos, equipment/shoots, immutable versions, manual recreation and labelled simulation. Config is 0.1.2 / Android versionCode 3, package `com.lightguide.codex`. [Run 34707182893](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34707182893) is successful for software, native positioning tests/build, Android packaging and emulator smoke. |
| `feat/offline-app-delivery` | `7184b71aa9e6d97138021cc44a34a0a05573b6f7` | [Branch status](https://github.com/V-Vekaria/LightGuide-v2/blob/7184b71aa9e6d97138021cc44a34a0a05573b6f7/docs/STATUS.md) reports harness/app builds and local data tests. It also identifies unverified device runtime and unfinished photo/equipment UI. These are recorded branch results, not newly rerun checks. |

See [branch and CI evidence](validation/BRANCH_STATUS_2026-09-14.md) for provenance and limits. Do not merge the two applications or transfer test results between them before the user compares them.

## Navigation fix and phone feedback

The user reported repeated Settings taps creating duplicate Back-stack entries after passing earlier phone checks. The Codex [navigation report](https://github.com/V-Vekaria/LightGuide-v2/blob/d6110136934b3b78456a90b570d58ce00885145c/docs/validation/CODEX_NAVIGATION_2026-09-12.md) records a fix for 0.1.2/build 3, browser regressions and an expanded Android smoke check.

That report's “pending CI” statement is historical: the subsequent run at the inspected commit completed successfully, including the Android smoke job. This review did not download or install its APK or reproduce the issue on the user's phone. Confirm the installed package/version when recording the user's retest. Do not reuse an older APK checksum for this build.

## Main's recovered experiment

Main retains the source/assets recovered from `experiment/phase-0-ar-positioning` at `5bc532b0d1bfd94f8f554867eec94e7403d1a7ce`. The [10 September source audit](validation/AR_SOURCE_AUDIT_2026-09-10.md) describes main's original default, scoring, freshness and reference/configuration gaps.

Both implementation branches contain later hardening work according to their source reports. Review and reuse the chosen branch's fixes instead of repeating the original audit tasks blindly. Recovery, hardening and successful native compilation are not physical accuracy evidence.

## Agreed baseline

- Measure → Save → Recreate; Android first; offline core; one physical node first.
- Native Kotlin/ARCore measurement harness and a React Native/Expo offline shell behind explicit interfaces, per ADR-015.
- [Seven-table data design](product/DATABASE_DESIGN.md), [schema](product/DATABASE_SCHEMA.md) and [sync specification](product/OFFLINE_SYNC.md). Branch implementations must state their actual coverage; a specification is not proof of complete sync.
- Configured ±3 cm distance/height and ±3° direction/tilt defaults are tolerances, not proven accuracy.
- Evaluation-kit identities and verification boundaries remain in [V1_BOM.md](V1_BOM.md).
- [App acceptance requirements](engineering/APP_ACCEPTANCE.md) now cover navigation, persistence, media, layout, equipment explanations, provenance and release evidence.

## Still open

- Physical positioning/relocalisation trials and independent return-error measurements; VAL-001–004 remain open.
- Verified native AR integration in the mobile shell and live new-node BLE/telemetry.
- Exact received hardware variants, verified new-board wiring and combined sensor/calibration performance.
- Real-phone checks not established by emulator/browser tests, including the user's installed build identity and upgrade/data retention.
- iOS implementation/testing, cloud sync, production hardware and five-photographer validation.

## Next work

1. Use the selected implementation's existing source and run instructions. Preserve both apps for comparison.
2. Identify the APK being tested; reconcile its version/commit and [release evidence](engineering/APP_ACCEPTANCE.md). Retest the reported navigation issue on that build.
3. Continue applicable phone acceptance checks and record actual failures/results. No rebuilding completed milestones merely because main lacks their source.
4. Complete exact-marker physical trials and separately requested sensor bench work. These do not substitute for each other.

The [delivery handoff](engineering/CLAUDE_BUILD_HANDOFF.md) defines scope and milestone criteria; use this status page to determine which milestones already have evidence.

## Legacy evidence

Root Preact, mock-device and Nano ESP32 firmware remain legacy engineering. The [24 August report](../device/reports/M5_conformance_acceptance.md) records legacy contract tests; it does not validate new-node BLE or Android positioning. Preserve prior reports and link later evidence from [the validation log](validation/VALIDATION_LOG.md).
