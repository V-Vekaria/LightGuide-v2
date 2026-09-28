# Device workflow and visible recreation guidance — 24 September 2026

Base: main 176407e0fe42034dd4f128918f2a3e1c4c12d4e8. Candidate Android version 0.1.6, versionCode 7, package com.lightguide.codex unchanged.

## Changes

- Recreation displays the shared diagram and saved/current values without an expand button, before detailed instructions. Saved height has a labelled stand; missing coordinates remain unknown. Manual geometry is illustrative.
- DeviceController and root DeviceProvider retain foreground BLE ownership across navigation. The fixed, accessible device status opens connection management from app screens and warns on stale readings or disconnection.
- Scan ends after ten seconds. Delayed callbacks cannot restore a cancelled connection. Native connection requests MTU 517 for Protocol v2 JSON notifications; negotiated hardware behavior needs physical testing.
- Fresh readings can enter the existing capture workflow through the device button or device save event. Stale data cannot be captured. Saved setup schema and historical versions are unchanged.

## Local evidence

- TypeScript check passed.
- 53 automated unit tests passed, including shared session lifetime, stale/disconnected data, delayed handshake, duplicate save event, scan timeout and on-screen capture cases using a fake transport.
- Browser suite: 20 of 21 passed initially; final photo comparison was blocked by a missing local landscape fixture. Restoring the unchanged repository fixture and rerunning both usability tests passed. All 21 browser cases have passed; no assertions were removed.
- Web export passed. Android JavaScript export passed; this does not verify native compilation.
- Reviewed the 390px recreation first-view screenshot: fixed status and saved diagram appear directly. Existing narrow layout, input validation, photo and persistence checks remain active.
- Android smoke script syntax checked; expanded native assertions cover the fixed status and automatic saved diagram. Execution requires the Android CI/emulator gate.

## Remaining release gates

PR software, positioning, Android build and Android smoke must pass on the same head. Then verify main CI and the actual APK artifact before distributing it as a verified update. Local exports are not a native APK build or an emulator result.

Physical phone/ESP32 BLE, negotiated MTU, reconnect after power loss, sensor validity, calibration, spectral usefulness and positioning accuracy remain unverified. Firmware PR #20 is independent of these application changes.
