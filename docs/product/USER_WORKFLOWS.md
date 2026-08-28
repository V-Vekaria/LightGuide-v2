# LightGuide V1 — User Workflows

## Purpose
Define the photographer-facing workflow independently from the underlying AR, BLE and sensor implementation.

## Workflow A — Save a setup
1. User opens LightGuide and selects **New Setup**.
2. App asks the user to scan the subject/studio reference area.
3. App confirms the spatial reference is established.
4. App detects or asks the user to select the LightGuide node/light identity.
5. App confirms tracking quality is sufficient.
6. User taps **Capture Light**.
7. App stores the pose and available node measurements.
8. User optionally adds a role/name such as Key, Fill or Rim.
9. User saves the setup locally.

### Failure states
- reference not found;
- marker/node not visible;
- tracking quality insufficient;
- node disconnected;
- pose unstable;
- user moves before capture completes.

The UI should state the recovery action rather than expose implementation jargon.

## Workflow B — Recreate a setup
1. User selects a saved setup.
2. App asks the user to scan/re-establish the reference frame.
3. App identifies the relevant node/light.
4. App compares current pose with saved pose.
5. App shows corrections in photographer-friendly terms:
   - move left/right;
   - move forward/back;
   - raise/lower;
   - rotate left/right;
   - tilt up/down.
6. Corrections update continuously as the light moves.
7. Dimensions entering tolerance become confirmed.
8. App shows **Matched** only when all required dimensions are within validated tolerance.

## Workflow C — Temporary tracking loss
1. App immediately stops presenting stale pose as current.
2. User sees a clear tracking-lost state.
3. App requests a short rescan/reacquisition.
4. Guidance resumes only after the reference/node pose is trustworthy again.

## Workflow D — One setup with multiple lights (architecture target)
1. Setup contains multiple named node records.
2. User can restore lights sequentially.
3. App clearly identifies which light is active.
4. Completed lights remain marked as matched while the next light is restored.

This workflow is architectural preparation. The first prototype only needs one functioning node.

## UX principles
- one primary instruction at a time where practical;
- numeric deltas remain available for precision;
- do not claim a match using stale data;
- do not ask the photographer to reason about X/Y/Z axes;
- scanning should be guided and short;
- save/recreate should work offline;
- advanced diagnostics may exist behind a developer/debug view, not the normal workflow.
