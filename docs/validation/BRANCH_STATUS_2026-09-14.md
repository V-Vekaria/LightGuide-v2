# Branch and CI evidence — 14 September 2026

## Review scope

Read GitHub branch trees, mobile configuration, branch status/reports and CI run/job metadata. This was a documentation review: no APK was downloaded, installed or retested, and no physical trial was performed.

Before the documentation update, main was `56e960347162645a767ff8be970172e45152f5de`. It has no `apps/mobile/` tree. Two separate application branches do. Preserve them for the user's comparison; this update merges neither implementation.

## Codex implementation

- Branch: `codex/offline-mobile-app`.
- Inspected commit: [d6110136934b3b78456a90b570d58ce00885145c](https://github.com/V-Vekaria/LightGuide-v2/commit/d6110136934b3b78456a90b570d58ce00885145c).
- [Source configuration](https://github.com/V-Vekaria/LightGuide-v2/blob/d6110136934b3b78456a90b570d58ce00885145c/apps/mobile/app.json): version 0.1.2, Android versionCode 3, package `com.lightguide.codex`.
- [Mobile README](https://github.com/V-Vekaria/LightGuide-v2/blob/d6110136934b3b78456a90b570d58ce00885145c/apps/mobile/README.md): local-first offline app and exact run instructions.
- [Navigation report](https://github.com/V-Vekaria/LightGuide-v2/blob/d6110136934b3b78456a90b570d58ce00885145c/docs/validation/CODEX_NAVIGATION_2026-09-12.md): repeated Settings/Back-stack repair; browser regressions; extended Android smoke checks.
- [Application audit](https://github.com/V-Vekaria/LightGuide-v2/blob/d6110136934b3b78456a90b570d58ce00885145c/docs/validation/CODEX_APPLICATION_AUDIT_2026-09-12.md): recorded earlier findings, tests and device-test limits.

[CI run 34707182893](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34707182893), created 12 September 2026, completed with conclusion **success** at the inspected commit. GitHub job metadata reviewed on 14 September shows:

| Job | Result | Observed successful steps |
|---|---|---|
| software | success | Legacy checks; mobile typecheck/tests; web/Android exports; browser end-to-end tests |
| positioning | success | Native Android unit tests and debug assembly |
| android | success | Standalone evaluation APK assembly with embedded JavaScript |
| android-smoke | success | Artifact download, APK identity recording and installed-Android offline test |

The navigation report's pending-CI wording predates this successful run. The source report says the smoke procedure includes repeated Settings taps and Back checks; the subsequent smoke job succeeded. This review inspected job metadata rather than replaying the smoke trace.

**Limit:** CI success and source configuration do not identify which APK is currently installed on the user's phone. The current artifact's binary checksum was not independently obtained here. Do not reuse the earlier build's checksum. Physical gallery/camera, upgrade/data retention and real spatial accuracy still need their own evidence.

## Separate application implementation

- Branch: `feat/offline-app-delivery`.
- Inspected commit: [7184b71aa9e6d97138021cc44a34a0a05573b6f7](https://github.com/V-Vekaria/LightGuide-v2/commit/7184b71aa9e6d97138021cc44a34a0a05573b6f7).
- [Status report](https://github.com/V-Vekaria/LightGuide-v2/blob/7184b71aa9e6d97138021cc44a34a0a05573b6f7/docs/STATUS.md) records harness hardening, native compilation, a local-first application and SQLite tests. It leaves device runtime and photo/equipment screen integration unverified or unfinished.
- [Mobile instructions](https://github.com/V-Vekaria/LightGuide-v2/blob/7184b71aa9e6d97138021cc44a34a0a05573b6f7/apps/mobile/README.md).

No Actions run was returned by the head-SHA query for this commit during review. This is not a claim that the branch failed or was never tested locally. Its recorded local tests were not rerun here.

## Documentation outcome

Main now distinguishes its common baseline from branch-specific implementation and points to both applications. README provides workflow, architecture, run-entry links and the topic map. [APP_ACCEPTANCE.md](../engineering/APP_ACCEPTANCE.md) records eleven explicit app checks and a release-record format.

The earlier standalone documentation audit identified a provenance gap. This review resolves the source-branch location and current Codex CI outcome; exact installed-artifact identity and user retest remain open.

Physical validation entries VAL-001–004 are unchanged. Source/build/browser/emulator evidence does not establish ±3 cm accuracy, live BLE, calibrated sensors, iOS support or a five-photographer MVP.
