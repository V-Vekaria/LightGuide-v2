# Android experiment source recovery — 10 September 2026

## Scope and provenance

Audited all five current branch heads: main, docs/professional-product-stack, docs/v1-architecture-freeze, feat/companion-app and experiment/phase-0-ar-positioning.

Main at `11cbf3ac5987bb4c0d236e451ba8e0022ca2c167` had only the experiment README. Branch `experiment/phase-0-ar-positioning`, commit `5bc532b0d1bfd94f8f554867eec94e7403d1a7ce`, contained Android implementation and exact marker assets. The claim that the project needed recovery from the laptop alone was incomplete.

Recovery imports the experiment's source/assets/build files with their existing Git blob IDs; the README is reconciled with current instructions. Obsolete branch-wide documents are not imported. The source branch remains available.

## Source inspected

- MainActivity.kt: Android lifecycle, target save/clear, setup controls, UI and export.
- ar/ArRenderer.kt: reference-relative marker poses and current-target deltas.
- ar/MarkerDatabase.kt: registered PNG assets and entered physical widths.
- data/ExperimentStore.kt: SharedPreferences/JSON target and settings.
- guidance/Guidance.kt and pose/Models.kt: direction calculations and tolerance defaults.
- PoseMathTest.kt: 18 JVM test methods in the recovered source.
- app/build.gradle.kts: compileSdk 37, targetSdk 36, Java 17 source/target and ARCore 1.54.0 dependency.
- markers/PRINTING.md: landscape 4:3 assets, full-image width measurement and historical marker observations.

The previous APK/test reports in conversation are historical reports, not a new test run. A source file containing tests does not prove those tests pass.

## Required hardening before new physical trials

| Finding | Source evidence | Required change and verification |
|---|---|---|
| Old tolerance defaults | Tolerances defaults are 4.0 cm and 2.5 degrees. Stored preferences override defaults. | Use 3 cm / 3 degrees for the agreed test profile. Preserve explicit experimental settings with visible active values; migrate or explicitly flag inherited values rather than silently treating them as the new profile. Check acceptance just inside/outside the boundary. |
| Arbitrary match score | Guidance computes a cosmetic percentage; MainActivity displays it. | Remove this score and use measured in/out/unverifiable states. Do not call unknown brightness/spectrum matched. |
| Inferred marker pose accepted as visible | Renderer checks TrackingState.TRACKING but not AugmentedImage.TrackingMethod.FULL_TRACKING. | Distinguish actually observed markers from inferred LAST_KNOWN_POSE. An inferred moving stand must not enable capture or measured Match. Test both conditions. |
| Camera/reference freshness not sufficient | Camera tracking is exposed but not used to suppress all capture/verdict calculations; reference age is logged without an expiry gate. | Define a conservative versioned validity policy for the experiment. Gate capture, guidance, verdict and logged in-tolerance flags consistently; use monotonic freshness and clear states after pause/loss/session change. Simulate freeze/loss/recovery. |
| Reference identity/config changes | Saved targets store frame mode and transform, without stable reference/configuration identity; reset clears a latched pose. | Invalidate comparison on reference replacement, changed marker dimensions or incompatible session/configuration. Require explicit reacquisition of the same physical reference; do not silently compare different origins. |
| Experiment coordinates differ from application schema | Marker-centred frame, centimetre exports and matrix persistence; the application schema uses a defined subject/floor reference and platform-neutral snapshots. | Keep historical experiment files self-describing. Introduce explicit unit/frame/orientation conversion when integrating; do not directly copy the experiment JSON into product tables. Unknown mounting/floor offsets must stay unknown. |
| No complete current physical result located | Validation log still lists VAL-001–003 as planned. Printing instructions describe earlier marker flipping and quality scores. | Preserve those historical observations. Collect missing raw/summary physical evidence; do not erase earlier work or claim ±3 cm validated. |

These findings are source-review results. Recovery intentionally preserves the source so a coding agent can make and test focused repairs; none of the repairs above is claimed complete by this commit.

## Verification performed for recovery

- Inspected complete, non-truncated branch file trees and selected implementation files.
- Compared Git blob IDs when assembling the recovered experiment; marker print and packaged asset identities can be verified without re-rendering them.
- Reviewed changed documentation links and scope.
- No Android build, JVM test suite, emulator or physical trial ran in this environment: Android SDK/adb, Gradle command and Kotlin compiler were unavailable. Build on the user's existing Android development environment using the wrapper.

Follow [the software delivery handoff](../engineering/CLAUDE_BUILD_HANDOFF.md). Keep test command outputs and environment limitations with the implementation commit.
