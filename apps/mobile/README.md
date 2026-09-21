# LightGuide Codex — offline evaluation application

This is the maintained LightGuide application on `main`, selected by the user on 14 September 2026 after the independent Codex/Claude comparison. The original Codex implementation is retained intact; Claude's alternative is recovery history, not a second development target. See [the consolidation record](../../docs/validation/BRANCH_CLEANUP_2026-09-14.md).

- Android package: `com.lightguide.codex`; display name: **LightGuide Codex**.
- Separate positioning harness: `com.lightguide.codex.phase0`.
- Baseline: repository commit `56e9603`. No production backend, credentials or customer data are required.

## Working scope

Local SQLite capture and draft recovery; photographs stored on the device; equipment and shoots; multiple lights and optional camera settings; search; immutable setup versions and conflict preservation; archive; 30-day Trash/restore; manual recreation with original photographs, notes, active guidance time and photographer-reported outcomes; visibly simulated positioning; JSON notes export. Export explicitly excludes photo bytes and is not a complete backup/import facility.

The native AR experiment remains a separate measurement harness. Mobile live positioning, BLE, accounts, cloud sync, AI recommendations and iOS validation are unavailable in this build. Missing measurements stay unknown. A manual or simulated result never asserts a measured spatial match.

## Run and verify

Use Node 24 and npm. From this directory:

```bash
npm ci
npm run typecheck
npm test
npm run export:web
npm run preview
```

Open `http://127.0.0.1:4173`. Keep the origin/port the same to retain the browser workspace. The preview server supplies the isolation headers required by SQLite's experimental web support. Browser storage may be cleared or evicted; Android is the intended offline installation. This preview is not a service-worker-backed installable PWA.

Browser journey tests:

```bash
npx playwright install chromium
npm run test:e2e
```

The Linux-only `scripts/e2e-local.mjs` is an optional browser-download fallback; CI uses the normal Playwright installation.

Android development requires Android Studio/SDK, Java 17, an emulator or USB-debuggable Android phone:

```bash
npm run android
```

This uses an Expo development build. Expo Go is not the native test environment. For a standalone evaluation APK with bundled JavaScript:

```bash
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease
```

On Windows use `gradlew.bat`. The generated Expo evaluation project uses its debug signing key for this local release variant; this is not Play Store release signing. Verify the generated signing configuration before distributing beyond private evaluation. APK output: `android/app/build/outputs/apk/release/`.

The GitHub workflow `.github/workflows/codex-application.yml` runs software checks, native positioning tests, Android builds and emulator smoke on main pushes and pull requests. An unrun or failed workflow is not a successful APK build; consult its actual result/artifacts.

## Test on the phone

1. Create a real setup with a name, original/result photos and optional light/camera details.
2. Force-close the app, enable airplane mode, reopen and find the saved setup.
3. Edit a version; verify the old version remains readable.
4. Recreate the old version, add a test photo and record your assessment.
5. Archive/unarchive, then Trash/restore. Permanently delete only disposable test records.
6. Record the installed version/build and retest repeated Settings navigation: repeated taps must still require only one Back action. Preserve the existing package ID and local data when upgrading.

Then test physical positioning separately using the exact registered marker assets and independent measurements in the repository's test plan. Compilation and simulations do not validate 3 cm accuracy.

## Data and dependency notes

Seven domain tables plus drafts, local media and local settings. SQLite migrations and bound SQL live under `src/data/`; strict scene validation lives under `src/domain/`. Originals stay local; optimised JPEG copies remove metadata through re-encoding. Android backup is disabled. Uninstalling or clearing app storage destroys local data; there is no cloud backup yet.

The postinstall script applies two narrow, source-checked fixes to Expo SQLite's experimental web worker: a 32-bit response-length write and a wall-clock wait timeout. Native SQLite is untouched. Review this patch when upgrading Expo. Dependency overrides update the router's URL decoder and build tooling's UUID implementation; type checks, browser navigation and native bundling must remain green after upgrades.

## Demo-style recreation (0.1.3)

Manual recreation and the practice screen share the same light/teal guidance workspace: one instruction, current-versus-saved values and top/side views. Manual recreation preserves the saved version and lets you enter optional current distance/height for this visit only. Unknown positions stay unknown; a distance alone cannot draw a true top-view position. Practice runs Save → Move → Recreate → Check with clearly synthetic values, connection-loss controls and an optional system explanation. Neither mode activates AR or BLE. See [change and validation notes](../../docs/validation/DEMO_STYLE_RECREATION_2026-09-17.md).

## Photographer usability (0.1.4)

Home's guided demo is session-only. Manual recreation starts from the saved photograph, with optional height/measurement details. Photos open uncropped in a full-screen viewer; use zoom buttons and scroll to inspect, or switch original/new results. Library cards include thumbnails. Shutter speeds accept `1/200`; camera details can be included in capture and new equipment can be added without discarding the draft. Completing an attempt requires an explicit assessment, including Not evaluated.

Upgrade keeps package/data identity. SQLite v2 adds the unevaluated outcome while preserving previous completed records and photo references. Unfinished old assessment choices require reconfirmation once; steps/notes remain. See [validation](../../docs/validation/PHOTOGRAPHER_UX_2026-09-18.md) for checks and limitations.
