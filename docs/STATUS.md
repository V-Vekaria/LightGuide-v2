# LightGuide v2 — Current Status

**14 September 2026: the user selected the Codex application.** Main now contains its mobile implementation and hardened native positioning harness, plus the latest workflow/architecture/acceptance documentation. The prior requirement to retain two active app branches is superseded.

## Integrated application

- Source selected: `d6110136934b3b78456a90b570d58ce00885145c`, formerly codex/offline-mobile-app.
- [Mobile instructions](../apps/mobile/README.md): local SQLite, local photographs, draft recovery, equipment/shoots, immutable versions, manual recreation and labelled simulation.
- Identity unchanged: `com.lightguide.codex`, version 0.1.2 / Android versionCode 3.
- The separate native harness remains `com.lightguide.codex.phase0`; mobile live AR/BLE is not implied.
- Runtime source and dependency files are preserved from the selected commit. Integration changes documentation and CI/maintenance wiring.

## Software evidence

[Run 34707182893](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34707182893) passed software/browser checks, native positioning unit tests/build, Android packaging and emulator smoke at the selected source commit. [The navigation report](validation/CODEX_NAVIGATION_2026-09-12.md) records the repeated Settings repair. Its original “pending CI” text predates that successful run.

CI now runs on main and pull requests. Integration [run 34897024247](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34897024247) at `e6c63bb2cd7e759ae7adf91abe66e9e3aa051050` passed all four jobs: software, positioning, Android build and emulator smoke. Cleanup [run 34900253605](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34900253605) also succeeded. Inspection on 15 September confirmed only `main` remains and all six recovery tags match the reviewed branch tips. See the [completed consolidation record](validation/BRANCH_CLEANUP_2026-09-14.md). User phone results must still name the installed package/version.

## Retired alternatives

Claude's implementation at `7184b71aa9e6d97138021cc44a34a0a05573b6f7` is not merged into the chosen app. It uses an alternative data/UI/harness implementation; mixing the two would need a separate engineering review. Its source/tests and the older branch tips were preserved with verified recovery tags, and all six retired branches have been deleted. The dated [branch review](validation/BRANCH_STATUS_2026-09-14.md) remains historical evidence.

## Current requirements

- Measure → Save → Recreate; Android first; offline core; one physical node first.
- [App acceptance](engineering/APP_ACCEPTANCE.md) covers navigation, persistence, media, layout, equipment help, provenance and release evidence.
- [Data design](product/DATABASE_DESIGN.md), [schema](product/DATABASE_SCHEMA.md) and [sync specification](product/OFFLINE_SYNC.md) remain authoritative; local database tests do not prove full cloud sync.
- Configured ±3 cm distance/height and ±3° direction/tilt tolerances are not proven accuracy.
- Evaluation-kit identities and verification boundaries remain in [V1_BOM.md](V1_BOM.md).

## Remaining work

1. Record the installed APK's package/version and phone acceptance results; preserve data when upgrading.
2. Run exact-marker physical positioning/relocalisation trials with independent ground truth. VAL-001–004 remain open.
3. Sensor bench bring-up is done: received parts identified, pin map verified, and all sensors plus a save button run together ([evidence](validation/ESP32S3_SENSOR_BENCH_2026-09-21.md)). Next: define and validate the live BLE link and calibration before integration.
4. Complete mobile native AR integration, iOS, cloud or other deferred features only when their own scope/evidence supports them.
5. Collect five-photographer evidence before MVP claims.

The [delivery handoff](engineering/CLAUDE_BUILD_HANDOFF.md) defines milestone criteria; do not restart milestones already evidenced on main. Legacy root web/device tests remain useful historical engineering but do not validate new-node BLE, mobile AR accuracy or production hardware.

## Demo-style recreation update — 17 September 2026

The demo-style recreation branch adds a shared visual workspace for manual recreation and practice, with top/side diagrams, current/saved comparisons and one correction at a time. Proposed package version is 0.1.3 / code 4; package identity and database schema remain unchanged. The existing installed release remains 0.1.2 until an updated APK is built and installed. See [scope, verification and limits](validation/DEMO_STYLE_RECREATION_2026-09-17.md); publication/CI status belongs to the delivery PR. Live AR/BLE remains unavailable.

## Photographer usability — 18 September 2026

Approved changes implemented for 0.1.4 / code 5: uncropped expandable/comparable photos, photo-first manual guidance, direct practice entry, library thumbnails, fraction-friendly camera capture, inventory return and explicit outcomes. SQLite v2 upgrade preserves existing records; one-time unfinished assessment reconfirmation replaces the earlier default. Exact CI/APK state is tracked in the delivery PR and [validation report](validation/PHOTOGRAPHER_UX_2026-09-18.md). This entry is implementation status, not a claim that a physical phone or live sensing has passed.


## Approved Android design — 28 September 2026

Candidate 0.2.0 / code 7 ports the approved design and the user's shoot-date/navigation feedback. Source is on codex/approved-mobile-design. TypeScript and 52 local domain/SQLite tests pass, including historical-data preservation and rollback on invalid backup. APK installation, signing/update compatibility, browser regressions and visual comparison are still pending. Do not distribute as verified until the exact candidate passes. Hardware PRs #20 and #21 are separate and unchanged.

Delivery [PR #22](https://github.com/V-Vekaria/LightGuide-v2/pull/22) remains draft: GitHub Actions failed before assigning runners or running build steps, including after one retry. No APK was produced. See the [validation and blocker record](validation/APPROVED_ANDROID_DESIGN_2026-09-28.md).

Local continuation on 28 September: the connected phone is already on 0.1.6 /
code 7, so the candidate advances to 0.2.0 / **code 8**. The installed signer
matches the existing evaluation key. Local TypeScript, all 52 mobile tests,
all 21 browser regressions, bundle exports, 412 legacy tests and 23 positioning
tests pass; both positioning and mobile APKs build. The ARM64 mobile APK passes
signature, installed-certificate comparison, package/version, bundle and alignment
checks. The authorized in-place update to code 8 succeeded and a cold launch passed without logged runtime errors. Detailed saved-data and native screen acceptance remains pending.
Windows test-harness fixes preserve
application storage behavior. See the [local Android delivery record](validation/LOCAL_ANDROID_DELIVERY_2026-09-28.md)
for exact artifact status, source identity, signing and remaining phone gates.

## Combined app integration - 29 September 2026

PR #21 is merged and integrated with #22 in candidate **0.2.1 / code 9**. TypeScript, all **57 mobile tests**, all **22 browser tests**, the local native release build and APK identity/signature/alignment verification pass. Package, database/schema and signing certificate are unchanged. The user chose to finish GitHub now and install build 9 later; the last verified phone installation is build 8. Full native acceptance and physical BLE checks remain pending. Firmware #20 stays open: its published head omits the existing local sensor-loop timing fix and lacks physical acceptance. See [combined evidence](validation/APP_PR_INTEGRATION_2026-09-28.md).
