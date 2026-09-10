# LightGuide mobile (offline application)

Expo/React Native/TypeScript offline application shell, built per ADR-015 and
[docs/engineering/CLAUDE_BUILD_HANDOFF.md](../../docs/engineering/CLAUDE_BUILD_HANDOFF.md)
milestones M1-M2. This is the application shell, not the AR positioning
harness - that is the separate, native Kotlin/ARCore experiment at
[experiments/phase-0-ar-positioning/](../../experiments/phase-0-ar-positioning/).
Passing that experiment's physical validation is not a prerequisite for this
app's local save/recreate/manual-guidance functionality; it is a prerequisite
for trusting *live* camera-based positioning, which this app does not yet have.

## What is implemented, simulated, tested and untested

**Implemented and tested (real automated evidence, see "Testing approach" below):**
- Local SQLite schema/migrations for a local-first subset of the seven-table
  design (`src/db`, `src/repositories`).
- Immutable setup versions: editing a setup publishes a new version rather
  than mutating an earlier one; a recreation's target version does not move
  under it (`__tests__/setups.repository.test.ts`, `__tests__/recreation.flow.test.ts`).
- Archive vs. Trash as distinct, non-overlapping views.
- Restart durability: closing the database and reopening it (a real file,
  not `:memory:`) preserves saved setups (`__tests__/db.restart-durability.test.ts`).
- Pose-delta/guidance maths and the authoritative MatchState
  (in_tolerance/out_of_tolerance/unverifiable) - an inferred observation,
  invalid reference or missing delta always reads UNVERIFIABLE regardless of
  the numbers (`__tests__/guidance.test.ts`).
- Scene-snapshot structural validation: array/size caps, quaternion
  normalisation, schema_version pinning (`__tests__/validation.test.ts`).

**Implemented, not automatically tested (would need a device/emulator):**
- Every screen under `app/` - navigation, forms, the recreation UI. These
  are thin views over the tested repository/service/guidance layer, but
  their own rendering and interaction have not been exercised. No emulator
  or physical device was available in this environment.
- `src/db/driver.expo.ts` - the on-device SQLite binding. Proven indirectly
  (the same repository code runs for real against `driver.node.ts` in the
  test suite - see "Testing approach"), but this specific binding has not
  itself been executed.
- The native Android debug build itself: `npx expo prebuild` succeeded, but
  `./gradlew :app:assembleDebug` did not complete in this environment
  (stopped after 30+ minutes with no forward progress for the last 20+;
  see "Running on a device" below and `docs/validation/VALIDATION_LOG.md`
  "Android native build of apps/mobile/"). No APK was produced for this app
  in this delivery. This is INCONCLUSIVE, not a build failure - no compile
  error occurred.

**Simulated, clearly labelled as such in the UI:**
- The recreation screen's "Simulated guidance demo" section
  (`app/setups/[id]/recreate.tsx`) exercises the live-guidance/MatchState
  display with an operator-controlled `SimulatedSpatialProvider`, not the
  setup's real geometry. `SpatialObservation.provenance` is `'simulated'`
  and is shown on screen; nothing simulated is ever persisted as a captured
  measurement.

**Not implemented (explicit gaps, not silent omissions):**
- No native Android/ARCore spatial adapter (`SpatialProvider` has only
  `Unavailable` and `Simulated` implementations). CLAUDE_BUILD_HANDOFF.md M3
  permits a thin adapter to be added later behind this same interface; none
  exists yet.
- No BLE/node sensor transport (`SensorTransport` has only `Unavailable`).
  No protocol is finalised (see V1_BOM.md and DECISIONS.md ADR-010).
- No photo capture UI wired up yet, though `images`/`registerImage` and
  `ImageRef` in the snapshot format exist and are ready for it.
- No equipment-picker UI wired up yet, though the `equipment` repository
  exists and is tested-ready.
- No pre-Save draft recovery: if the app is killed while filling in the
  "New setup" form before pressing Save, that in-progress text is lost. The
  Save action itself is atomic and durable once pressed (proven by the
  restart-durability tests) - this is a scoped decision ("save first, enrich
  later"), not a bug in the save path.
- No cloud sync, accounts, or the `sync_outbox`/`working_drafts` operational
  tables from OFFLINE_SYNC.md - explicitly deferred per ADR-015 and the M1/M2
  handoff ("do not build this full backend as a prerequisite").
- No automatic Trash purge worker. `purge_after` is recorded but nothing
  currently acts on it, so trashed setups remain recoverable indefinitely.

## Testing approach

Nothing in `src/db`, `src/domain`, `src/guidance`, `src/repositories` or
`src/services` imports React Native or Expo. Two SQLite drivers implement the
same `SqlDriver` interface (`src/db/driver.ts`):

- `driver.node.ts` - Node's built-in `node:sqlite`, used **only** by Jest.
- `driver.expo.ts` - `expo-sqlite`, used **only** by the app at runtime
  (`src/db/client.ts`).

The test suite runs the exact same schema/migrations/repository code as the
app, against a real, file-backed SQLite database - never `:memory:` for the
durability tests - which is how `__tests__/db.restart-durability.test.ts`
proves data survives closing and reopening the database file without needing
a device. This does not prove `driver.expo.ts` itself works; only a device or
emulator run can do that.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # jest - 40 tests as of this delivery, all against real SQLite
```

## Running on a device

Requires Android Studio's SDK (already configured for the Phase-0 experiment
- see the repo root) and a **JDK 17** specifically. The RN/Expo Android
template's Gradle wrapper (8.14.3 as of this delivery) cannot run on newer
JDKs (`Unsupported class file major version 69` on JDK 25) - unlike the
Phase-0 experiment, which pins a newer Gradle (9.7.1) that does support it.
If Android Studio's bundled JBR is JDK 25 (`Android Studio\jbr`), download a
JDK 17 separately (e.g. Temurin) and point `JAVA_HOME` at it for this build.

```bash
cd apps/mobile
npx expo prebuild --platform android   # generates android/ (gitignored)
# set android/local.properties sdk.dir if not picked up automatically
cd android
JAVA_HOME=/path/to/jdk-17 ./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**If this build is extremely slow or appears to stall** with no new Gradle
task output for many minutes despite the java process consuming CPU: this
was observed in this repository's own development environment, working
inside a OneDrive-synced folder, and is consistent with the OneDrive
file-locking/sync interference this repo's Phase-0 experiment already works
around (`experiments/phase-0-ar-positioning/android/build.gradle.kts`
redirects its build output outside OneDrive for exactly this reason; the
generated `apps/mobile/android` project has no equivalent redirect). If you
hit this, either exclude `apps/mobile/android/` and `apps/mobile/node_modules/`
from OneDrive sync (right-click > "Always keep on this device", or pause
sync during the build), or run the build from a checkout outside any synced
folder. This was not confirmed as the root cause in this delivery - the
build was stopped rather than left running indefinitely - so treat it as
the leading hypothesis to try first, not a certainty.

Or, for iterative development with Metro/fast refresh instead of a plain
debug APK: `npx expo run:android` (requires an emulator or connected device).
`expo start` alone is not sufficient - this app uses native modules
(expo-sqlite, expo-image-picker) that Expo Go cannot host; it needs a
Development Build (`expo run:android` or the assembled debug APK above).

## Known toolchain notes

- `.npmrc` sets `legacy-peer-deps=true`. `expo-router`'s peer dependencies
  (react-dom, radix-ui packages meant for its web target) conflict with the
  pinned React Native version under npm's default (non-legacy) resolver even
  though the resulting install is what `expo install`/`expo-doctor` expect;
  this project does not target web.
- Run `npx expo-doctor` after changing any dependency - it catches
  SDK/peer-dependency mismatches (`expo install --fix` corrects them) that
  `npm install` alone will not.
