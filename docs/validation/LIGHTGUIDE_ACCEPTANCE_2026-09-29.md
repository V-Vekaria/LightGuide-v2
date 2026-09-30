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
| 26 | Data & backup | INTENTIONALLY DIFFERENT | Honest local-data summary/notes export; unavailable full restore is not presented as working. |
| 27 | Measurement help | MATCH | Height is manual; distance semantics and measurement points are explicit. |
| 28 | Photo viewer | MATCH | Full-screen viewer, saved/new comparison, zoom/inspection controls. |
| 29 | Record outcome | MATCH | Close enough / Needs adjustment / Not evaluated plus optional notes persist. |
| 30 | Resume recreation | MATCH | Progress and timestamped previous readings survive interruption and return stale. |
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
| `npm test` | Passed; 50/50 Node tests. |
| `npx expo-doctor` | Passed; 21/21 checks. |
| `npm run export:web` | Passed; production bundle and bundled demo assets exported. |
| `npm run test:e2e` | Passed; 20/20 Chromium journeys at a phone viewport, including clean-install acceptance. |
| `gradlew :app:assembleRelease` | Passed from a short Windows staging path with JDK 17; Android release lint-vital also passed. |
| `gradlew :app:lintRelease` | Blocked by an internal Android Lint crash in third-party `react-native-worklets` (`Cannot find a KaModule`), not by an app finding. |

## Boundaries

- Real ESP32 discovery, permission behaviour on a target phone, live packet parsing, disconnect timing, malformed sensor packets, calibration and accuracy require physical hardware.
- Absolute stand height remains manual. A device distance reading is never repurposed as height.
- Full database/media backup and import are not claimed. The current export is deliberately limited and labelled.
- Browser UI acceptance does not replace TalkBack, OEM Bluetooth permission, background lifecycle or installation testing on the intended phone.
- No Android phone or emulator was connected, so install/launch and native permission prompts remain manual acceptance steps.
- The capture form keeps all sections on one recoverable scroll surface while adding phase navigation; this preserves the existing tested draft model rather than reproducing four isolated routes.

## Visual evidence

- [Design QA](../../design-qa.md)
- `design-qa-welcome-comparison.png`
- `design-qa-home-comparison.png`

The APK source commit, file checksum and install artifact are reported in the final handoff so that the artifact can be tied to the exact committed tree.
