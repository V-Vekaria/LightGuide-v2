# Claude Code — offline application delivery handoff

**Decision baseline:** ADR-015, 10 September 2026.  
**Goal:** deliver a working, tested offline Android-first prototype for the user to try; then complete physical validation. A finished prototype is not a validated commercial MVP.

## Instructions to the coding agent

Work in V-Vekaria/LightGuide-v2. Read AGENTS.md, CLAUDE.md, docs/STATUS.md, docs/V1_ARCHITECTURE.md, docs/DECISIONS.md and the topic documents linked below before implementation.

Inspect the working tree, branches, existing source and toolchain. Preserve unrelated changes. Use a dedicated implementation branch and small reviewable commits. Continue through the software milestones below without pausing after each plan or asking the user to choose routine implementation details. Report genuine blockers, then continue independent work.

Do not create another Phase-0 scaffold. Source from experiment/phase-0-ar-positioning at 5bc532b0d1bfd94f8f554867eec94e7403d1a7ce is now in the baseline. Do not merge that branch's obsolete product documents over current requirements.

## M0 — Harden and verify the recovered Android harness

Read [the source audit](../validation/AR_SOURCE_AUDIT_2026-09-10.md) and [experiment instructions](../../experiments/phase-0-ar-positioning/README.md). Resolve every listed code gap needed for trustworthy capture/guidance:

- apply the 3 cm / 3 degree test profile, accounting explicitly for previously saved settings;
- remove the arbitrary match percentage;
- distinguish current image observations from inferred poses and reject invalid/stale camera/stand/reference states;
- handle pause/restart, reference reset, changed marker sizes and saved-target compatibility;
- keep capture, display and trial-log validity consistent;
- retain exact registered images and measured-width instructions.

Run meaningful tests for correction signs, unit/frame transforms, reference identity, stale/lost tracking, boundary acceptance and recovery. Use the existing Gradle wrapper; inspect its pinned AGP/SDK requirements instead of blindly upgrading dependencies.

From experiments/phase-0-ar-positioning/android:

```bash
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

On Windows use gradlew.bat with the same tasks. If the environment lacks the SDK, document the blocker and exact setup requirement. Do not call a failed/unrun build passed. Continue M1 independently with the spatial implementation unavailable.

**Exit:** fixes implemented with actual available test evidence, plus a debug APK when the native build can run. Physical accuracy remains pending.

## M1 — Create the offline application foundation

Use apps/mobile/ for React Native + TypeScript + Expo Router with Expo Development Builds. Preserve the root legacy Preact app and its tests; do not change root tooling just to replace it. Inspect any existing mobile implementation before scaffolding.

Use [DATABASE_DESIGN.md](../product/DATABASE_DESIGN.md) and [DATABASE_SCHEMA.md](../product/DATABASE_SCHEMA.md). Implement SQLite migrations, validated scene snapshots and repository/service boundaries. Keep cloud dependencies optional. The seven domain tables do not exclude necessary local infrastructure.

Create explicit SpatialProvider and SensorTransport interfaces, with native, simulated and unavailable states. Simulated measurements must be visibly labelled and persisted with simulation provenance; never present them as real captured geometry. The offline application must remain useful when native positioning is unavailable.

Implement readable navigation, accessible controls and concrete empty/error/loading states. Avoid exposing internal SDK, database or protocol details in ordinary photographer flows.

**Exit:** application starts, local storage works, migrations are repeatable and representative records survive restart.

## M2 — Complete the core offline user journey

Follow the V1 Must requirements in [APP_MVP_PLAN.md](../product/APP_MVP_PLAN.md). Deliver:

1. Short first-use explanation and a labelled demo.
2. Create and name a real local setup, with optional photographs, equipment and manual precision details. Missing measurements stay unknown.
3. Search/open/edit/archive saved setups offline; distinguish archive from Trash.
4. Preserve immutable target versions; editing a setup must not rewrite an earlier recreation's target.
5. Manual recreation with the saved photographs/settings when live tracking is unavailable.
6. Simulated recreation guidance for testing connected screens, including lost/relocalising/unavailable states.
7. Save recreation outcome, adjustments, timing and optional comparison photographs.
8. Local data-loss protection, recovery after interruption and the agreed Trash semantics.

Implement lightweight shoots/equipment records where the core flow needs them. Defer kits, global catalogues, EXIF expansion, accounts, cloud sync, collaboration, billing, AI recommendations and competitor imports. Do not install every library mentioned in old planning documents.

**Exit:** a user can save, restart in airplane mode, find a setup, follow manual recreation and record an outcome. Every reachable action works or is clearly unavailable; no fake success buttons.

## M3 — Verify software, package and hand over

Run type checks, relevant unit/integration tests and supported UI/emulator checks. Test durable local save, interrupted media handling, immutable targets, archive versus Trash, unknown data, stale guidance and the complete offline journey. Tests must assert user-visible behaviour or data preservation, not merely mirror implementation.

Use the real SQLite implementation for persistence checks where the test environment allows it. A memory mock alone does not establish restart durability. If emulator/native tooling is unavailable, record that limitation and provide the exact reproduction commands.

If M0 builds, a thin Android spatial adapter may be integrated behind the application contract with explicit units, reference identity and calibration context. Keep the measurement harness available. No sensor/BLE implementation is implied by this adapter; do not invent a protocol or silently substitute the legacy Wi-Fi API.

Deliver:

- changed files and commit IDs;
- test commands, outcomes and unresolved failures;
- Android debug build/install instructions and APK when actually built;
- brief user checklist: offline save/restart/recreation first, then exact-marker physical positioning tests;
- updated STATUS.md and evidence linked from the validation log.

Do not stop at screenshots or a screen mockup when runnable implementation is possible. Do not declare the entire product complete because automated tests pass.

## What the user must test

The user operates physical devices: print the exact assets, measure their actual widths, mount them consistently, save/restart/relocalise, move the stand and independently measure the return error. Follow [TEST_PLAN.md](../TEST_PLAN.md); use the 3 cm target and report outliers/failures.

Actual BLE pairing/reconnection, sensor calibration and combined node behaviour require the received hardware and a defined protocol. iOS AR/build validation requires Apple development/test access. These checks cannot be replaced by mocks.

## Reuse and scope rules

Use the [reuse research](../product/COMPETITOR_REUSE_RESEARCH_2026-09-10.md). Prefer official ARCore and manufacturer sensor libraries when their respective tasks begin. Preserve applicable licences and pin tested versions.

OpenIllumination, Poly Haven and Sidus export imports are later candidates; they are not dependencies of this delivery. AI-generated artistic recommendations remain outside V1 core. No paid infrastructure, public deployment, production migration, hardware flash or release signing is required by this software handoff.

When physical testing is pending, complete the independent software milestones and hand over a working prototype with honest limitations. A full commercial application with validated AR, BLE, iOS, cloud and AI is outside this first delivery.
