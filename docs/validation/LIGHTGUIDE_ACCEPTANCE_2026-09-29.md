# LightGuide acceptance implementation — 29 September 2026

This record covers the existing `apps/mobile` Android application and the approved reference set `01–32`. It does not claim physical sensor accuracy, a final BLE protocol, cloud backup or iOS support.

## Screen parity matrix

| # | Reference | Status | Implemented evidence / note |
|---:|---|---|---|
| 01 | Welcome | FUNCTIONALLY PRESENT / UI DIFFERENT | First-use hero, offline/account-free copy, explicit example notice and clean-install gate. |
| 02 | Starting point | MATCH | Photography type and lighting experience are selectable and persisted. |
| 03 | Guided demo | FUNCTIONALLY PRESENT / UI DIFFERENT | Hardware-free four-phase simulation; all readings labelled simulation/example data. |
| 04 | Home | FUNCTIONALLY PRESENT / UI DIFFERENT | Primary save/demo/device actions, workspace state and persistent navigation. |
| 05 | Photos & basics | FUNCTIONALLY PRESENT / UI DIFFERENT | Name, category, result/placement images and notes; draft survives failures. |
| 06 | Light details | MATCH | Equipment, independent per-light height/distance/angle/output and add-light flow. |
| 07 | Camera settings | MATCH | Camera/lens/shutter/aperture/ISO/white balance and skip support. |
| 08 | Review & save | FUNCTIONALLY PRESENT / UI DIFFERENT | Review phase reports only recorded values before save. |
| 09 | Setup library | MATCH | Active/archive/trash, search, thumbnails and explicit example provenance. |
| 10 | Setup details | MATCH | Photos, light/camera facts, recreate/edit/history actions. |
| 11 | Edit setup | MATCH | Edits produce immutable versions rather than overwriting history. |
| 12 | Version history | MATCH | Earlier versions remain viewable and can be restored as a new current version. |
| 13 | Recreation — Reference | MATCH | Free phase navigation, saved image/placement context and notes. |
| 14 | Recreation — Lights | MATCH | Active-light switching and independent saved/current measurements. |
| 15 | Recreation — Camera | MATCH | Saved camera facts and manual confirmation remain available. |
| 16 | Recreation — Check | MATCH | Saved/new comparison, swap/expand support and assessment entry. |
| 17 | Equipment | MATCH | Searchable local inventory with typed equipment and no demo duplication. |
| 18 | Equipment details | MATCH | Add/edit equipment with optional brand/model/notes. |
| 19 | Shoots | MATCH | Upcoming/completed states are derived from date/status; past events are not shown as future. |
| 20 | Shoot plan | MATCH | Linked setup, checklist, notes and future-date validation. |
| 21 | Find device | FUNCTIONALLY PRESENT / UI DIFFERENT | Scan/disconnected/manual states are present without inventing a production protocol. |
| 22 | Permission needed | PARTIAL | Android permission flow and manual fallback exist; final wording varies by OS version. |
| 23 | Fresh device readings | PARTIAL | Fresh/current state and distance provenance are modelled; physical ESP32 data remains unverified. |
| 24 | Connection lost | MATCH | Stale values are timestamped and excluded from live guidance; manual continuation preserves work. |
| 25 | Settings | MATCH | Preferences, data, device, measurement help and about destinations. |
| 26 | Data & backup | MATCH | Full local workspace export/import includes validated records and optimised photo bytes, with confirmation before replacement. |
| 27 | Measurement help | MATCH | Height is manual; distance semantics and measurement points are explicit. |
| 28 | Photo viewer | MATCH | Full-screen viewer, saved/new comparison, zoom/inspection controls. |
| 29 | Record outcome | MATCH | Matched / Close enough / Adapted / Unsuccessful / Not evaluated plus optional notes persist. |
| 30 | Resume recreation | MATCH | Progress, notes and entered readings survive interruption; the user is prompted to recheck if equipment may have moved. |
| 31 | Photo import failure | MATCH | Failed preview is not saved; retry, choose another and continue-without preserve the draft. |
| 32 | Trash / restore | MATCH | Restore retains version links; destructive deletion remains confirmed. |

## Acceptance-build changes

- Added a three-stage, persisted clean-install onboarding flow.
- Seeded one idempotent, clearly labelled `Soft portrait — Example setup` with the approved light and camera facts, paired bundled demo imagery and fixed IDs. The one-time marker prevents re-creation after intentional deletion.
- Added truthful simulation/provenance labels and free recreation phase navigation.
- Persisted interrupted recreation measurements with timestamps, restored them as stale, and added discard/recheck recovery.
- Added explicit photo import failure recovery without losing a draft.
- Added truthful data/backup and measurement-help screens.
- Added future-date shoot validation and correct upcoming/completed classification.
- Hardened fresh/stale/sensor-error/manual device presentation without defining a speculative ESP32 protocol.
- Unified the dark visual system and replaced glyph navigation with vector icons.
- Added browser acceptance and repository regression coverage.

## Verified test commands

| Command | Result |
|---|---|
| `npm run typecheck` | Passed; TypeScript emitted no errors. |
| `npm test` | Passed; 59/59 Node tests. |
| `npx expo-doctor` | Passed; 21/21 checks. |
| `npm run export:web` | Passed; production bundle and bundled demo assets exported. |
| `npm run test:e2e` | Passed; 23/23 Chromium journeys, including clean-install acceptance and full backup round-trip. |
| `gradlew :app:assembleRelease` | Passed from a short Windows staging path with JDK 17; Android release lint-vital also passed. |
| `gradlew :app:lintRelease` | Blocked by an internal Android Lint crash in third-party `react-native-worklets` (`Cannot find a KaModule`), not by an app finding. |

Release artifact verified on 30 September 2026: `LightGuide-0.2.1-code9-acceptance.apk` (`com.lightguide.codex`, version `0.2.1`, versionCode `9`), SHA-256 `8fd663c367d81681a88c3bd3c551338514a95b2d0726d1f2cc52abd968fbc404`. APK Signature Scheme v2 verification and 16 KiB page zip alignment passed. The local evaluation release uses the existing Android debug certificate; it is not Play Store signing.

## Boundaries

- Real ESP32 discovery, permission behaviour on a target phone, live packet parsing, disconnect timing, malformed sensor packets, calibration and accuracy require physical hardware.
- Absolute stand height remains manual. A device distance reading is never repurposed as height.
- Backup/import validates its schema, references, photo integrity and size limits before replacing the local workspace; users should still keep a separate copy of important photographs.
- Browser UI acceptance does not replace TalkBack, OEM Bluetooth permission, background lifecycle or installation testing on the intended phone.
- No Android phone or emulator was connected, so install/launch and native permission prompts remain manual acceptance steps.
- The capture form keeps all sections on one recoverable scroll surface while adding phase navigation; this preserves the existing tested draft model rather than reproducing four isolated routes.

## Visual evidence

- [Design QA](../../design-qa.md)
- `design-qa-welcome-comparison.png`
- `design-qa-home-comparison.png`

The APK source commit and pull request are reported in the final handoff so that this checksum can be tied to the exact committed tree.

## PR #24 review fixes — 30 September 2026

- Migrated unfinished manual readings from the prior `workspace:<id>` record to `attempt-readings:<id>` without replacing newer readings or removing the old camera draft. Legacy readings have no invented timestamp and require explicit rechecking before guidance uses them. Discard/purge also removes legacy workspace state.
- Restored Europe/London calendar-day shoot grouping and the `Date passed` label. Today's noon-UTC plan remains Upcoming until London midnight.
- Publish the native repository singleton only after first-run seeding succeeds. A seed failure closes SQLite; a later concurrent-safe retry opens a fresh connection.
- Discarded attempts open as read-only terminal records rather than exposing controls that cannot save.

Local verification: TypeScript passed; 62/62 Node tests passed; 25/25 Chromium journeys passed; web and Android Hermes exports passed. Added real SQLite upgrade-preservation coverage, initialization failure/retry coverage, and browser regressions for midnight grouping and discarded-attempt reopening.

Windows Playwright shutdown stalled after all 25 tests reported success. Terminating only that run's worker released teardown; Playwright printed `25 passed (5.7m)` and exited 0. This cleanup did not terminate the user's browser or change application data.

The APK checksum above belongs to the earlier acceptance commit `05bf27b6c1932c01263ac55a2830e7c29bc235cc`; that APK does not contain these review fixes. Native APK rebuild/install and emulator smoke for the follow-up revision remain pending. GitHub Actions remains blocked by account billing/spending limits; local results are not passing GitHub check results.

## Local CI continuation — 30 September 2026

At the user's direction, continue validation locally without waiting for GitHub Actions credits. The application source at `06171e15dd6347cffbebc49c6eb1b07f00e33cd2` includes all four review fixes. The follow-up smoke-driver changes do not alter the application bundle.

### Rebuilt release APK

- `:app:assembleRelease` passed in 21m 48s: 807 actionable tasks, 82 executed, 725 up-to-date. Release lint-vital passed; the separate third-party full-lint limitation recorded above is not claimed resolved.
- Build used the existing `C:\lgb` short staging directory, cached Java 17, existing Windows SDK, one Gradle worker and the checked-in Windows init script. Staged application files were copied from the current application branch.
- Package `com.lightguide.codex`, version `0.2.1`, versionCode `9`; ABIs `arm64-v8a` and `x86_64`.
- APK Signature Scheme v2 and 16 KiB page zip alignment passed. Signer SHA-256 remains `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (existing evaluation/debug certificate).
- Artifact: `apps/mobile/artifacts/LightGuide-0.2.1-code9-reviewed.apk`, 73,430,338 bytes.
- APK SHA-256: `bf3366e872e14e970167f0016521107dba61383342e2e731916bbc6396e8f81c`.

Initial Gradle attempts failed because four native dependency files in three specific generated transform caches were cloud reparse placeholders rather than regular files. Copied each file to a regular local file, verified identical SHA-256 bytes, and retained the original placeholders outside the active cache under `C:\lgb\cache-backups`. No dependency versions, application source or signer changed during this repair.

### Native smoke attempt and remaining gate

Updated `scripts/android-smoke.py` for current onboarding, capture measurements, phase accessibility labels and outcome controls. It now explicitly targets an emulator and refuses physical-phone serials. Python syntax compilation passed. The full updated journey remains unverified.

Started the existing Pixel_6 AVD in a temporary read-only, hidden session on `emulator-5580`, with no snapshot save. The available image is API 37.2 / x86_64 / 16 KiB pages, not CI's API 35 image. Installed the prior verified acceptance APK as an upgrade baseline; its cold activity launch returned `Status: ok`. The first accessibility dump failed with UiAutomation connection timeout / exit 137. A subsequent dump and system meminfo query also stalled. Windows reported 8,227,444 KiB total RAM and only 110,460 KiB free during the attempt. The test stopped before installing/testing the new candidate, and only this test emulator's process tree was terminated to release resources.

This is an emulator/environment failure, not passing native journey evidence. Logs, failure JSON and baseline screenshot remain in `C:\lgb\artifacts\android-smoke`. Retry the emulator journey only when sufficient memory is available, or perform the separately authorized later phone acceptance. No phone was installed, cleared or otherwise modified.

TypeScript, 62 mobile tests, 25 browser journeys and both exports retain the review-fix evidence above. Legacy root and positioning sources are unchanged by PR #24; their prior local build/test evidence remains applicable (412 legacy passes / one existing skip; 23 positioning JVM passes). Hosted GitHub checks remain billing-blocked and are not represented as passing local checks.
