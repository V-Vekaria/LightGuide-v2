# LightGuide Codex — offline evaluation application

This is the independent Codex implementation on `codex/offline-mobile-app`. Do not merge it into `main` or Claude's implementation until the user compares both.

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

The branch-only GitHub workflow `.github/workflows/codex-application.yml` runs software checks and separate Android builds. An unrun or failed workflow is not a successful APK build; consult its actual result/artifacts.

## Test on the phone

1. Create a real setup with a name, original/result photos and optional light/camera details.
2. Force-close the app, enable airplane mode, reopen and find the saved setup.
3. Edit a version; verify the old version remains readable.
4. Recreate the old version, add a test photo and record your assessment.
5. Archive/unarchive, then Trash/restore. Permanently delete only disposable test records.
6. Compare this journey with Claude's app using separate test data. The apps must not share a package ID or database.

Then test physical positioning separately using the exact registered marker assets and independent measurements in the repository's test plan. Compilation and simulations do not validate 3 cm accuracy.

## Data and dependency notes

Seven domain tables plus drafts, local media and local settings. SQLite migrations and bound SQL live under `src/data/`; strict scene validation lives under `src/domain/`. Originals stay local; optimised JPEG copies remove metadata through re-encoding. Android backup is disabled. Uninstalling or clearing app storage destroys local data; there is no cloud backup yet.

The postinstall script applies two narrow, source-checked fixes to Expo SQLite's experimental web worker: a 32-bit response-length write and a wall-clock wait timeout. Native SQLite is untouched. Review this patch when upgrading Expo. Dependency overrides update the router's URL decoder and build tooling's UUID implementation; type checks, browser navigation and native bundling must remain green after upgrades.
