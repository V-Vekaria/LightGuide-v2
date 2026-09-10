# Phase 0 — AR Positioning Validation

## Objective

Determine whether Android ARCore + known visual references can provide sufficiently repeatable light-stand position and orientation for LightGuide V1.

This experiment comes **before** final commercial node electronics.

## Implemented experiment and remaining validation

The source is recovered from branch experiment/phase-0-ar-positioning, commit 5bc532b0d1bfd94f8f554867eec94e7403d1a7ce. Do not create another scaffold. Before physical trials, address [the source audit](../../docs/validation/AR_SOURCE_AUDIT_2026-09-10.md); stale tracking and older defaults remain in the recovered source.

The experiment implements:
1. start an AR session;
2. detect a known-size marker attached to a stand;
3. display current X/Y/Z and pitch/yaw/roll;
4. save the current pose as a target;
5. allow the stand to be moved;
6. calculate current-vs-target deltas;
7. show simple movement guidance;
8. log measurements for later comparison with ground truth.

Example guidance output:

```text
LEFT      18 cm
UP         7 cm
FORWARD   11 cm
ROTATE     6°
TILT       4°
STATUS     NOT MATCHED
```

The exact UI is not important for the first technical test. Do not invent a percentage match/confidence score. Use explicit matched/not-matched/unverifiable states and show stale or lost tracking.

## Coordinate-frame requirement

Do not assume AR world coordinates from one arbitrary session are reusable later. The experiment must test a stable subject/studio reference strategy so saved light poses are relative to something physically reproducible.

## Validation

Use independent tape/angle measurements. Run 20–30+ repeated reposition trials across different distances, viewing angles and lighting conditions.

Initial gate:
- around 3–5 cm position repeatability in normal studio use;
- around 2–3° orientation;
- acceptable relocalisation and detection time;
- practical marker size/visibility.

The 3–5 cm range is only a feasibility screen. The application uses ±3 cm distance/height tolerances; separately evaluate whether the measured system supports them. Do not claim a tighter capability from a looser screening result.

See [TEST_PLAN.md](../../docs/TEST_PLAN.md), [POSITIONING_RESEARCH.md](../../docs/POSITIONING_RESEARCH.md) and the [current handoff](../../CLAUDE.md) before implementation.

## Resume sequence

1. Inspect and harden the existing Android/ARCore project using the source audit.
2. Verify device compatibility and camera permission.
3. Add known-marker detection/tracking.
4. Display marker pose.
5. Save target pose locally.
6. Implement delta calculations.
7. Add basic directional guidance.
8. Add CSV/JSON trial logging.
9. Run physical validation.
10. Record measured evidence in [VALIDATION_LOG.md](../../docs/validation/VALIDATION_LOG.md) and the resulting decision in [DECISIONS.md](../../docs/DECISIONS.md).

## Non-goals for Phase 0

Do not add BLE, ESP32 firmware, ToF, spectral sensors, cloud accounts, AI subject analysis or production UI unless required to answer the positioning question.


## Recovered implementation details


The recovered proof-of-concept lives in `android/`, with matching printable assets in `markers/`. Source provenance and current gaps are recorded in the [audit](../../docs/validation/AR_SOURCE_AUDIT_2026-09-10.md).

## What the app does

Single screen, deliberately plain. It is a measuring instrument, not product UI.

- tracks two ARCore **augmented images** of known printed width;
- reports the stand marker's X/Y/Z and pitch/yaw/roll;
- expresses that pose relative to the reference marker, not the AR world origin;
- saves the current pose as a target, and reloads it on next launch;
- computes current-vs-target deltas;
- shows LEFT/RIGHT, UP/DOWN, FORWARD/BACK, ROTATE, TILT, ROLL corrections;
- flags in/out of configurable position and orientation tolerances;
- logs timestamped readings and exports CSV + JSON.

## Frames and sign conventions

ARCore gives an augmented image a pose with `+X` along the image's right edge,
`+Y` along its outward normal and `+Z` down the image. Every marker pose is
remapped once into a **studio frame**: `+X` right, `+Y` up, `+Z` out of the
marker face. Angles are intrinsic Y-X-Z, reported as pitch up positive, yaw
right positive, roll clockwise positive (seen from behind, looking along `+Z`).

The reference marker defines the origin. While it is visible its world pose is
re-latched every frame, so a measurement taken with both markers in view is
invariant to a common rigid change of world frame (not immune to tracking or image-pose error); when it leaves view the last known pose is
reused and `reference_age_ms` records how stale it was for every logged row.

**Answering the coordinate-frame requirement above:** the app will not save a
target while the frame is `AR_WORLD`. An AR world origin is wherever the
session happened to start, so a pose saved against it would look correct and
then be meaningless in the next session. The reference marker must be scanned
first, the active frame is shown on screen at all times, and the frame is
recorded with every logged row and with the saved target.

## Build and deploy

Requires the Android SDK and a JDK 17+ (Android Studio's bundled JBR works).
Set `sdk.dir` in `android/local.properties` if it is not already there.

```bash
cd experiments/phase-0-ar-positioning/android && ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

```bash
adb install -r experiments/phase-0-ar-positioning/android/app/build/outputs/apk/debug/app-debug.apk
```

The pose maths, frame handling and guidance sign conventions are covered by JVM
unit tests in `android/app/src/test/`. They need no device. Sign errors in
guidance are invisible in a screenshot and would silently corrupt every
recorded trial, so run them before trusting field numbers.

## Running a trial

1. Print both markers (see `markers/PRINTING.md`) and enter their measured
   widths under SETUP. Mis-stated width scales every distance proportionally.
2. Mount the reference marker at the subject/backdrop, facing the shooting area.
   Leave it there for the whole session.
3. Attach the stand marker to the light head, facing the way the light points.
4. Open the app, point it at the reference marker until `ref` reads SEEN, then
   at the stand marker.
5. Measure the stand position independently — tape, floor marks, angle finder.
6. `SAVE TARGET`, then `REC` on.
7. Move the stand away. `MARK TRIAL`, then use the guidance to bring it back.
8. When the app reads IN TOLERANCE, measure again with the tape. The gap
   between the app's claim and the tape is the result; the app's own numbers
   are not evidence about the app.
9. Repeat for 20-30+ trials across distances, viewing angles and lighting.
10. `EXPORT`, then record the outcome per `../../docs/validation/VALIDATION_LOG.md`
    (VAL-001) and `../../docs/DECISIONS.md`.

## Log format

`EXPORT` writes both formats to `Android/data/com.lightguide.phase0/files/logs/`
on the device, retrievable with:

```bash
adb pull /sdcard/Android/data/com.lightguide.phase0/files/logs/
```

Every length is in **centimetres**, on screen and in both exports, matching the
tape measure used for ground truth. ARCore works in metres internally; the
conversion happens once, at the display and logging boundary.

CSV columns: `timestamp_iso, timestamp_ms, session_id, event, trial,
frame_mode, tracking_state, reference_age_ms, camera_distance_cm, x_cm, y_cm,
z_cm, pitch_deg, yaw_deg, roll_deg, dx_cm, dy_cm, dz_cm, d_pitch_deg,
d_yaw_deg, d_roll_deg, position_error_cm, orientation_error_deg,
in_position_tol, in_orientation_tol, match_state, note`.

`in_position_tol` and `in_orientation_tol` are blank rather than true/false
whenever `match_state` is not `in_tolerance`/`out_of_tolerance` - an inferred
stand pose, a stale reference, lost camera tracking or an incompatible saved
target all read as `unverifiable`, and a blank flag cannot be misread later as
a real pass/fail. See "Hardening" below.

`camera_distance_cm` is the phone-to-marker distance. It does not depend on
either frame, so it is the one reading that can be checked against a tape
immediately - which makes it the fastest way to catch a wrong printed marker
width, since a width wrong by some ratio scales this distance by the same
ratio.

`event` is one of `SESSION_START`, `TARGET_SAVED`, `TARGET_CLEARED`,
`TRIAL_MARK` or `SAMPLE`. Samples are recorded at 10 Hz only while `REC` is on,
so a log holds deliberate trials rather than every second the app was open. The
JSON export carries the same rows plus device model, Android version, marker
widths, tolerances and unit definitions, so an exported file is self-describing
without this README.

## Hardening (M0, 2026-09-10)

The [source audit](../../docs/validation/AR_SOURCE_AUDIT_2026-09-10.md) gaps are addressed in source, with JVM tests in `android/app/src/test/`:

- **Tolerance profile.** Defaults are now 3 cm / 3 degrees. A value from before this change (most notably the old 4 cm / 2.5 degree default) is only still in effect if it was explicitly saved via SETUP > Apply on a device that had this app installed previously; the status line marks it `(INHERITED - not the 3cm/3deg profile)` rather than silently presenting it as current. A fresh install reads `(profile)`.
- **No cosmetic match percentage.** The verdict is one of `IN TOLERANCE`, `OUT OF TOLERANCE` or `UNVERIFIABLE`, logged as `match_state` on every row. There is no arbitrary percentage anywhere in the UI or exports.
- **Inferred vs. observed pose.** ARCore reports `TrackingState.TRACKING` for a while after an augmented image leaves view, via `TrackingMethod.LAST_KNOWN_POSE`. The app now distinguishes that from `FULL_TRACKING`; an inferred stand pose can still be displayed (useful for the operator) but cannot arm `SAVE TARGET` and always reads `UNVERIFIABLE`, never a numeric pass.
- **Reference freshness.** A reference marker's last *actual* detection (not an inferred one) must be under 5 seconds old (`REFERENCE_MAX_AGE_MS` in `pose/Models.kt`) or the frame is `UNVERIFIABLE` and capture is blocked, even though `frame` may still read `REFERENCE`.
- **Reference/configuration identity.** A saved target now records the marker widths in effect when it was captured. Comparing it against a reading taken under different SETUP widths - or a pre-hardening save with no recorded widths at all - is refused (`targetConfigMismatch`) exactly like the existing different-frame case, with an on-screen reason. A pre-hardening saved target fails to load and must be re-saved.
- **Pause/session-change clearing.** The last on-screen reading is cleared on `onPause` so a resume cannot briefly show pre-pause data as current, and a reference latched under a since-replaced `Session` (camera error recovery, or a marker-width change) is discarded rather than reused.

None of this is a physical accuracy result. It makes the numbers the app already produced trustworthy to log; VAL-001-003 in [VALIDATION_LOG.md](../../docs/validation/VALIDATION_LOG.md) remain planned until real trials run.

## Deliberately not included

No BLE, ESP32, ToF, spectral sensing, IMU fusion, accounts or production UI, per
the non-goals above. No 3D overlay is drawn on the camera feed either: the point
is to read numbers and compare them against a tape measure, and a rendered
augmentation invites judging accuracy by eye instead.
