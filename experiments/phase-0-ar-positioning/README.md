# Phase 0 — AR Positioning Validation

## Objective

Determine whether Android ARCore + known visual references can provide sufficiently repeatable light-stand position and orientation for LightGuide V1.

This experiment comes **before** final commercial node electronics.

## Minimum proof of concept

Build an Android app that can:
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

## First implementation sequence

1. Create minimal Android/ARCore project.
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
