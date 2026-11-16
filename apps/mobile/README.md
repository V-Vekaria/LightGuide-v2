# LightGuide — offline acceptance application

This is the maintained LightGuide application, selected by the user on 14 September 2026 after the independent Codex/Claude comparison and aligned with the approved 01–32 acceptance references on 29 September 2026. Claude's alternative is recovery history, not a second development target. See [the consolidation record](../../docs/validation/BRANCH_CLEANUP_2026-09-14.md) and [current acceptance record](../../docs/validation/LIGHTGUIDE_ACCEPTANCE_2026-09-29.md).

- Android package: `com.lightguide.codex`; display name: **LightGuide**; version 0.2.1 / versionCode 9.
- Separate positioning harness: `com.lightguide.codex.phase0`.
- No production backend, credentials or customer data are required.

## Working scope

Local SQLite capture and draft recovery; photographs stored on the device; equipment and shoots; multiple lights and optional camera settings; search; immutable setup versions and conflict preservation; archive; 30-day Trash/restore; manual recreation with original photographs, notes, active guidance time and photographer-reported outcomes; visibly simulated positioning; JSON notes export; and validated full workspace backup/import including optimised photo bytes.

The native AR experiment remains a separate measurement harness. The app implements a foreground BLE transport/controller, shared connection status and stale-reading handling; physical phone-to-node acceptance is still pending. Mobile live AR positioning, accounts, cloud sync, AI recommendations and iOS validation are unavailable in this build. Missing measurements stay unknown. A manual or simulated result never asserts a measured spatial match.

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

## Download and update

The current 0.2.1 / build 9 acceptance candidate is in [PR #24](https://github.com/V-Vekaria/LightGuide-v2/pull/24). [Run 36810719652](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/36810719652) tests application source `d2b28bf7f5e153afa208d7f1b110ae9aba827f3e`. On 1 October, software/browser checks, positioning checks and APK packaging passed; the Android smoke journey was still running when this documentation was updated. Read the run's final result before installing as a verified candidate.

After all four jobs pass, download **lightguide-codex-android** from that run's Artifacts section, extract the ZIP and open `app-release.apk`. Sign into GitHub with repository access if prompted. Back up important work through **Data & backup**, then choose **Update** over the existing app. Do not uninstall or clear storage: both destroy local data. If Android rejects the update, keep the installed app and report the exact error. The APK is for private evaluation, not Play Store distribution.

## Test on the phone

Use an in-place update for the existing installation. Check that saved setups, photographs and unfinished work survive before creating disposable test records. Clean-install onboarding must be tested on a separate emulator or a spare device with no valuable app data; do not remove the user's working installation for this test.

1. Install the verified candidate on that clean test environment.
2. Complete Welcome → Starting point and confirm the photography/experience choices survive restart.
3. Run the guided demo and confirm every synthetic value is labelled Simulation or Example data.
4. Open the bundled Soft portrait example, visit all four recreation phases and record an assessment.
5. Inspect recreation history, edit/version behaviour and photo comparison.
6. Create a separate real setup with optional light/camera details; force-close/reopen and verify it persists.
7. Archive/unarchive, then Trash/restore. Permanently delete only disposable test records.

Then test physical positioning separately using the exact registered marker assets and independent measurements in the repository's test plan. Compilation and simulations do not validate 3 cm accuracy.

## Data and dependency notes

Seven domain tables plus drafts, local media and local settings. SQLite migrations and bound SQL live under `src/data/`; strict scene validation lives under `src/domain/`. Originals stay local; optimised JPEG copies remove metadata through re-encoding. Android backup is disabled. Uninstalling or clearing app storage destroys local data; there is no cloud backup yet.

The postinstall script applies two narrow, source-checked fixes to Expo SQLite's experimental web worker: a 32-bit response-length write and a wall-clock wait timeout. Native SQLite is untouched. Review this patch when upgrading Expo. Dependency overrides update the router's URL decoder and build tooling's UUID implementation; type checks, browser navigation and native bundling must remain green after upgrades.

## Current recreation and recovery behaviour

The 0.2.1 acceptance candidate uses the approved dark workspace with independently navigable Reference, Lights, Camera and Check phases. Saved setup versions remain immutable. Interrupted readings persist locally and require rechecking; older migrated draft readings have no invented timestamp. Discarded attempts are read-only records.

The guided demo and bundled Soft portrait setup are labelled examples. Unknown positions remain unknown, and a scalar distance does not establish a full light pose. Absolute light height remains manual. Completing a recreation requires an explicit photographer assessment; this is not proof of a measured spatial match.

Photo import failures preserve the draft. Optional camera fields accept values such as `1/200` shutter speed. Setup edits preserve history, and workspace backup/import includes validated records and optimised photographs. Shoot grouping follows Europe/London calendar days.

See the [current screen parity and validation record](../../docs/validation/LIGHTGUIDE_ACCEPTANCE_2026-09-29.md) for checks and pending native/physical gates. The [0.1.3 demo notes](../../docs/validation/DEMO_STYLE_RECREATION_2026-09-17.md) and [0.1.4 usability notes](../../docs/validation/PHOTOGRAPHER_UX_2026-09-18.md) describe earlier iterations, not the current screen design.
