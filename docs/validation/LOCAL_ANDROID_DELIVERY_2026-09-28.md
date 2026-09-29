# Local Android delivery continuation — 28 September 2026

PR: https://github.com/V-Vekaria/LightGuide-v2/pull/22  
Branch: `codex/approved-mobile-design`  
Build source: `4991260f2a94db73f1dff285c926b5bb6457d699`  
Application changes: `4b9fb87bda418b0c8dfdffacacced7ac9e479b09`

The user reports exhausted GitHub Actions minutes and storage. This continuation
uses the existing Windows Android SDK and does not launch an emulator. Earlier
cloud-environment SDK limitations in APPROVED_ANDROID_DESIGN_2026-09-28.md do not
describe this machine.

## Identity and preservation

- Candidate: `com.lightguide.codex`, version `0.2.0`, versionCode **8**.
- Read-only adb inspection of the connected Samsung SM-S948B, Android 16, found
  installed version `0.1.6`, versionCode **7**, ARM64. Its first installation was
  11 September and last update 25 September. Therefore the PR's initial code 7
  was advanced to 8; the package ID, database and schema are unchanged.
- Installed base APK SHA-256:
  `966dc86743ba23337aee62bed65c47ecc124d1f33cf40843379c8cfbdcd54172`.
- Installed APK passes `apksigner verify --verbose --print-certs` (v2 signature).
- Installed signer certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
  This exactly matches the existing Expo template evaluation key used by the
  generated release signing configuration. No key was replaced or regenerated.
- The machine's separate `~/.android/debug.keystore` was left untouched and is
  not the mobile release signing key. The separate positioning harness has a
  different application ID and is not an upgrade for the main app.
- Before the authorized installation below, no uninstall, clear-data, phone installation, or data-changing phone test had
  been performed. Pulling the installed base APK backs up code, **not app data**.

## Software evidence

| Check | Result |
|---|---|
| Mobile TypeScript (`npm run typecheck`) | PASS |
| Mobile domain/SQLite (`npm test -- --test-concurrency=1`) | 52/52 PASS |
| Web export (`npx expo export --platform web --output-dir dist-web --max-workers 2`) | PASS |
| Android JS/Hermes export (same command with android/dist-android) | PASS |
| Browser (`npm run test:e2e`) | 21/21 PASS on local loopback Chromium |
| Legacy tests (`npm test -- --maxWorkers=1`) | 412 PASS, 1 existing skip |
| Legacy web (`npm run build`) | PASS |
| Positioning `:app:testDebugUnitTest :app:assembleDebug` | PASS; 23 JVM tests, 0 failures/errors |

The original Windows mobile run failed three media harness cases because its
import-removal regex only recognised LF endings, and one migration test left an
open SQLite handle after expected constructor rejection. Tests now accept CRLF
and close the rejected handle without changing application/migration code.
Two browser assertions matched retained navigation screens or tab text as well
as visible headings; they now target the relevant accessible heading. The full
suite passes after these fixes. Initial legacy worker timeouts under load were
resolved by one-worker execution, without increasing assertion timeouts.

Browser tests cover first use, staged capture, date validation, backup restoration,
photo handling, persisted drafts/readings, immutable targets, manual outcomes and
navigation. Phone-size web screenshots were inspected for Home and Equipment;
this is not a native screenshot comparison or a largest-font phone acceptance test.

## Native build environment

- Node 24.15.0 / npm 11.12.1, pinned package lockfiles (`npm ci`).
- SDK: `%LOCALAPPDATA%/Android/Sdk`; API 36, build-tools 36.0.0,
  NDK 27.1.12297006, CMake 3.22.1 already installed.
- Mobile Gradle wrapper 9.3.1. Use the cached Temurin Java 17.0.20.1 at
  `%USERPROFILE%/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2`.
- Android Studio's JBR 25 built the positioning harness, but the mobile build
  stalled while probing an automatically provisioned JDK. Cancelled that attempt
  and selected cached Java 17 explicitly. An earlier overlapping build also hit
  a Gradle journal-cache lock timeout; native builds are now sequential.
- The first Java 17 attempt found stale generated autolinking JSON with an empty
  `project` object. A fresh autolinking command correctly returned
  `project.android.packageName = com.lightguide.codex`. Removing only the generated
  `android/build/generated/autolinking/autolinking.json` and rerunning regenerated
  the correct metadata; package-list and entry-point generation then passed.
- Mobile build targets the connected phone's `arm64-v8a` ABI with one worker,
  no parallel Gradle projects, and bundled release JavaScript. No emulator ran.
- Deep OneDrive checkout paths caused Ninja to report `build.ninja still dirty
  after 100 tries`: a generated prefab CMake dependency path exceeded Windows
  limits. The checked-in `scripts/windows-native-build.gradle` init script uses
  `%LOCALAPPDATA%/lg22-cxx/<module>` staging and two C++ compile jobs. Worklets and
  Reanimated subsequently compiled successfully and the app C++ build proceeded.
  The script changes build output paths/concurrency only, not app IDs or signing.

```powershell
# From apps/mobile after npm ci and the software checks:
npx expo prebuild --platform android --no-install
$env:JAVA_HOME = "$env:USERPROFILE/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2"
$env:ANDROID_HOME = "$env:LOCALAPPDATA/Android/Sdk"
$env:NODE_ENV = 'production'
Set-Location android
./gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a `
  -Porg.gradle.java.installations.auto-download=false `
  "-Porg.gradle.java.installations.paths=$env:JAVA_HOME" `
  --init-script ../scripts/windows-native-build.gradle `
  --no-daemon --no-parallel --max-workers=1 --console=plain
```

## Outstanding device gates

The finished mobile APK passed artifact verification. `:app:assembleRelease`
completed successfully in 22m 56s with 795 actionable tasks, including release
vital lint. The final file is 44,318,972 bytes and contains a 3,098,984-byte bundled
Hermes/JavaScript asset at `assets/index.android.bundle`.

| Finished APK check | Result |
|---|---|
| Package/version/code from `aapt dump badging` | `com.lightguide.codex` / `0.2.0` / **8** |
| Native ABI | `arm64-v8a`, matches the connected phone |
| `apksigner verify --verbose --print-certs` | PASS, signer matches installed APK |
| `zipalign -c -P 16 -v 4` | PASS |
| Bundled application JavaScript | Present |
| SHA-256 | `3ee3bbc469d17657a96187bfe299053f678dca8c36bd20c4b557b97bb3478ddb` |

Delivered locally as `lightguide-0.2.0-8-arm64.apk` alongside this report and
`apk-verification.json`. Build timestamp: 28 September 2026, 12:29 BST.
No GitHub artifact storage or Actions runner was used. The authorized in-place installation and launch are recorded below.

The basic native launch and in-place upgrade checks passed as recorded below; detailed phone acceptance remains pending. Do not
use the destructive fresh-install portions of android-smoke.py on the user's
phone. After explicit installation authorization, retain the existing data and
verify saved setups, photographs, immutable versions and recreation identities;
then test offline reopen, navigation, media, largest font/keyboard and actual
screens. Certificate equality establishes signing compatibility, not a successful
upgrade or complete runtime/data-preservation acceptance.

Real AR accuracy, calibration and combined hardware acceptance remain separate.

## Authorized phone installation follow-up — 28 September 2026

At the user's request, rechecked the exact APK checksum and signer, then ran
`adb install -r` on the connected Samsung SM-S948B. Result: **Success**.
The installed package is `com.lightguide.codex`, version **0.2.0**, code **8**.
The original first-install timestamp (11 September 2026, 17:30:45, phone-reported)
was retained; the phone reports the new update at 28 September, 21:36:50.
No uninstall, app-storage clear, downgrade flag or signing-key replacement occurred.

`am start -W` returned `Status: ok`, `LaunchState: COLD`; a subsequent PID check
confirmed the app process was running, with no AndroidRuntime error or React
Native JavaScript error output for that process. The user had Chrome foreground
at the subsequent screen check, so no claim of a full native visual walkthrough
is made. Detailed saved-setup/photo/recreation checks and full offline acceptance
remain pending; successful in-place installation does not alone verify every row.
