# App PR integration — 28–29 September 2026

## Scope and source

PR #21 (`3925e20064698f09c8d8c4ea4421211853dcd28e`) is integrated into PR #22
at `fdd4e1de854aaa26551d7fc8efc9a29bd6486c70` on `codex/approved-mobile-design`. Build source is `a7b762762899e25b8454c0016ffa9277dd0b2cb8`, which additionally bounds Metro bundling to two workers. The combined candidate is
**0.2.1 / versionCode 9**, package `com.lightguide.codex`.

The approved navy/mint layout, staged capture, independently navigable
Reference/Lights/Camera/Check flow, retained drafts, London shoot dates and
backup/restore remain. The root DeviceProvider now retains the foreground
connection across navigation, and shared screen chrome shows fresh/waiting/stale/
disconnected states. The Lights stage directly displays the saved/current height
diagram. Unknown position remains unknown; side-view spacing is illustrative.
ADR-021 records the shared session separately from ADR-020's approved design.

No database schema, package identity, signing key or existing phone data changed.
No emulator was launched. GitHub Actions quota/storage is exhausted; local checks
are the evidence, and `[skip ci]` prevents unnecessary workflow attempts. Existing
failed/skipped GitHub jobs are not represented as passing checks.

## Combined software validation

- Mobile TypeScript: PASS.
- Mobile domain, SQLite and device-controller tests: **57 passed**, no failures.
- Web export: PASS.
- Browser regressions on the exported app and real local SQLite: **22 passed**.
  Includes persistent device status after navigation/failed discovery, draft
  retention, visible height diagram, four-stage navigation, saved camera/readings,
  photos, backup restore, historical dates and immutable setup versions.
- Unchanged legacy and positioning code retains the prior local evidence:
  **412 legacy tests passed, 1 existing skip; 23 positioning JVM tests passed**,
  and both associated builds passed. See LOCAL_ANDROID_DELIVERY_2026-09-28.md.
- Combined native APK verification is recorded in the completion entry below.

## Phone boundary

Build 8 (0.2.0) was previously verified and installed with `adb install -r`;
its cold launch succeeded without captured runtime errors. No uninstall or data
clear was used. The phone is now disconnected. The user explicitly chose
**Continue GitHub; install later** for combined build 9. Consequently this record
does not claim build 9 native runtime, per-record/photo preservation, largest-font
acceptance or a physical BLE session. Use an in-place upgrade for later installation.

## Firmware PR #20 review

Reviewed published head `19e65549630d14c6ef45f74ca7adb884c93091f6` without modifying
the separate firmware checkout or flashing a board. Recompiled host tests with
the existing Zig C++ toolchain: **81 checks, 0 failures**. All **11** emitted payloads
pass the combined app's own Protocol v2 parsers; **7** GATT identifiers and the
spectral channel order agree. Payload limits: measurement 338 bytes, status 229
bytes; a full measurement needs ATT MTU at least 341. Zig emitted library-header
warnings during toolchain setup; the tests and conformance run completed.

**Keep #20 open.** The separate local firmware checkout contains unpublished
commit `cc281696497cec426838eff119724fccf10e37ff`, fixing a BNO085 UART drain loop
that could stall the shared sensor loop. This fix is not on the published PR.
The software tests do not exercise that driver timing. Review, publish and validate
the fix before merging; physical discovery, MTU, fresh readings, disconnect/stale,
reconnect and save-event behavior still need recorded acceptance. The combined app
requests MTU 517; this supersedes the firmware report's historical statement that
only the node requests negotiation, but does not establish the physical outcome.

## Local build recovery

The regenerated Android build encountered read-only generated Expo assets and
Reanimated/Worklets headers/log directories. Cleared read-only attributes only
under generated Android build outputs (1,661 entries); source and signing keys
were untouched. Native compilation then progressed, but the overnight process
ended during Metro bundling with no final success result. Resumed on 29 September
with the cached Java 17/SDK and two Metro workers. No emulator or CI runner ran.

## Verified APK completion - 29 September 2026

Build source: a7b762762899e25b8454c0016ffa9277dd0b2cb8. BUILD SUCCESSFUL in 15m 59s.
The Windows init script now clears read-only DOS attributes on generated task outputs within their project build directories, before Gradle refreshes those outputs. This resolved the recurring OneDrive-generated-folder failures.

- Verified package/version: com.lightguide.codex / 0.2.1 / code 9.
- ARM64 APK: 44327748 bytes; bundled Hermes asset: 3107760 bytes.
- apksigner verification, recorded installed-certificate comparison and 16 KB zip alignment: PASS.
- APK SHA-256: 80e84e1eebb6652c095f31767aa3e0a74952876ecd4e4f896d71a3a606b70909.
- Signer certificate SHA-256: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c (same as installed build 8).
- Local artifact: lightguide-0.2.1-9-arm64.apk. No GitHub artifact upload or emulator.
- Installation and native runtime of build 9 are deferred at the user request.

Phone-size browser Home and Equipment screenshots were inspected after integration; visible device status and primary controls fit the viewport. This is not largest-font or native-device acceptance.

PR #21 merged on 29 September at e9c276a840d01550c36d425d967355623eb94b05. PR #22 carries the tested combined implementation and this evidence. Firmware #20 remains open.
