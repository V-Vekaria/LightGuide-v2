# Application audit — 12 September 2026

## Scope and baseline

Audited the independent Codex application, not Claude's branch or the university device. Baseline source: 1d8348404005b945434647f2f523e4e28a996ee0. GitHub run 34650679069 completed successfully, including the existing Android install/save/offline-reopen/manual-recreation checks. Local baseline: 26 unit tests and 5 browser tests passed. Passing baseline tests did not cover the new defects below.

## Findings and changes

| Priority | Finding | Change and evidence |
|---|---|---|
| High | Removing an inventory item left its ID in shoot packing lists. The item disappeared from the selection UI and saving the plan failed. | Removal now transactionally removes the ID from future packing lists while leaving captured snapshots untouched. A SQLite regression failed before the fix and passes afterward; the browser edits an affected shoot successfully. Older packing lists with deleted references are also repaired when saved; the form explains the removal. |
| Medium | A selected recreation outcome was lost on restart and reverted to close enough. | Persist the choice with progress; note/step updates preserve it. SQLite regression failed before repair; reload test now retains adapted. |
| Medium | An existing Home screen did not refresh its draft card when returning from Capture. | Refresh on navigation focus with a stable store callback. Browser reproduction failed before repair and now resumes the saved draft. |
| Medium | Recreation active time continued while another in-app screen was open. | Start/stop timing on route focus as well as app activity. Browser clock test spends two minutes on simulation and verifies those minutes are not added. |
| Medium | Other pages retained the wrapped native flex pattern that caused Home overlap; Photo also used vertical flex sizing. | Use natural-height stacked columns below 760 points or at larger font scales in Capture, Setup, Recreation and Simulation. Photos have natural-height full-width containers. Geometry and photo-retention checks pass at 360-point width; native runtime remains a separate gate. |
| Low | Exclusive-choice buttons had no exposed pressed state on the web. | Expose aria-pressed alongside native selected state; restart test asserts the selected outcome. |
| Low | Settings hardcoded 0.1, making installed builds hard to identify. | Read the embedded version/build metadata. New release configuration: 0.1.1, Android versionCode 2; package remains com.lightguide.codex. |

The preceding repair already awaits file copies and moves before registering native photographs. Its delayed filesystem/rollback regression remains in this suite.

## Verification

- TypeScript: pass on final source.
- Unit/regression: 28/28 pass, including real SQLite persistence, transactional rollback, version immutability, SQL bound-parameter and invalid-path rejection, shared-image protection, deleted equipment references, outcome persistence and delayed native-file doubles.
- Browser workflows: 9/9 pass with Chromium using normal multiprocess flags. Covers save/edit/history, archive/Trash/restore, photo capture and reload, cleanup retaining draft photos, equipment search/filter/deletion, camera settings, multiple lights, exports, invalid routes, simulation labels, Home/capture geometry, draft navigation and paused timing.
- Browser suite was rebuilt and rerun after the final changes, including older packing-list repair and version metadata. CI will build the complete revision.
- Web export: pass. Native APK compilation and Android smoke gate for this new revision are pending CI.
- Inspected a phone-width capture screenshot; no overlap in the visible photo panel. Geometry assertions cover panel ordering beyond the viewport.

## Security and validation limits

Application source audit found no application HTTP upload/client, authentication/token storage or HTML-evaluation surface in the offline workflow. Photos are local; SQL input is parameterised; paths are validated; Android configuration disables OS backup and blocks audio/video media permissions. This is a bounded source/test review, not a penetration-test certification or a claim of no vulnerabilities. No new dependency advisory scan was performed.

Real Android gallery/camera and vendor-specific permission behaviour, old-APK-to-new-APK upgrade/data retention, low-storage recovery, large photo libraries, accessibility with Android font scaling, BLE hardware, AR positioning accuracy and iOS remain unverified by this audit. Native photo doubles prove ordering and rollback, not device functionality. Setup-note export still excludes photos and is not a full restorable backup.
