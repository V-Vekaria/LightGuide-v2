# Demo-style recreation — 17 September 2026

## Scope

User requested the accepted interactive pitch demo's appearance and easy recreation workflow in the maintained Android-first application. Baseline main: `f429659ad6926992725dfc1754ea5389bc55bdfb`.

Implemented:
- Shared light/teal recreation workspace, large current instruction, current-versus-saved values and selectable top/side diagrams.
- Native React Native components shared by manual recreation and the app's practice screen; no embedded browser or new dependency.
- Practice sequence: Save → Move → Recreate → Check, one correction per tap, position/orientation/power comparisons, reference/Bluetooth/power failure controls and ambient-change warning.
- Existing manual Reference → Lights → Camera → Check flow retained. Each saved light is selected in turn. Optional entered distance/height yields one correction at a time; the user still confirms steps and judges the test photograph.
- Existing saved versions, photos, outcomes, interruption recovery, package identity and navigation preserved. No database schema changes. Current manual comparison inputs are deliberately session-only and labelled as such; stored recreation steps/notes/outcomes retain their existing durable behavior.
- Missing or cleared measurements remain unknown. A scalar range never supplies invented X/Z coordinates. Unknown top-view geometry has a photo-based fallback. Side spacing is explicitly illustrative.
- Proposed release config: version 0.1.3, Android versionCode 4, package `com.lightguide.codex`.

## Verification

- Mobile TypeScript check passed.
- 33 Node tests passed, including five new guidance cases plus existing real-SQLite durability, immutable target and photo-recovery tests.
- Web export and Android JavaScript/Hermes export passed. This is not an APK installation check.
- Initial local browser suite could not start: cached Chromium crashed at launch with SIGSEGV, before any app test ran. Do not count those failures as app assertions or a passing browser run. Subsequent results and GitHub CI are recorded in the delivery PR.
- Added browser journeys for save/move/recreate, all three connection failures, side view, ambient change, 320/390/1024 width checks, manual correction inputs, invalid entries and persisted recreation progress.

## Remaining limits

Live AR, BLE and calibrated sensing are still unavailable in the mobile app. All practice inputs are synthetic and cannot assert a measured match. Manual inputs are user-entered, not sensor measurements. 3 cm / 3° is a configured comparison tolerance, not demonstrated accuracy. Subject position, modifiers, power, camera settings and ambient conditions still require checking against actual photographs.

An updated APK requires the existing Android build and smoke workflow to pass for the delivered commit. Physical-phone large-font/keyboard checks and real hardware trials remain separate.

## Phone retest

1. Upgrade the same package without uninstalling. Verify existing setups and photographs remain.
2. Open a saved setup → Recreate. Follow reference, each light, camera and result checks. Enter optional current distance/height; check that only manual guidance appears.
3. Try top/side views; unknown positions must remain unknown. Verify readability with larger system text and the keyboard open.
4. Finish with a test photo and personal assessment. Restart offline and verify saved history.
5. Open practice guidance and run Save → Move → Recreate → Check. Test link/reference/node loss; no adjustment or restored claim should remain active during a failure.
