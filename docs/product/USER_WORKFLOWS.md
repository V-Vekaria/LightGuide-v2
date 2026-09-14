# LightGuide V1 — User Workflows

## Purpose
Define the photographer-facing workflow independently from the underlying AR, BLE and sensor implementation.

## Offline application journey

The evaluation app can be useful before live AR/node integration. Create a named setup with optional photos/equipment/manual details, save locally, restart offline, find the saved version, follow manual recreation and record the outcome. Missing measurements remain unknown. Manual completion and labelled simulation never assert a measured Match.

See [branch status](../STATUS.md) for delivered functionality. Workflows A–C below describe the live spatial capability and its failure rules; their presence here is not an implementation claim.

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
4. Previously completed lights retain their completion record while the next light is restored. A current measured Match still requires fresh valid data; historical completion is not proof that an unobserved light has remained in place.

This workflow is architectural preparation. The first prototype only needs one functioning node.

## UX principles
- one primary instruction at a time where practical;
- numeric deltas remain available for precision;
- do not claim a match using stale data;
- do not ask the photographer to reason about X/Y/Z axes;
- scanning should be guided and short;
- save/recreate should work offline;
- advanced diagnostics may exist behind a developer/debug view, not the normal workflow.

## Navigation and interaction rules

Keep the main navigation from [APP_MVP_PLAN.md](APP_MVP_PLAN.md): Home, Shoots, Create, Setups and Equipment. Settings is a secondary destination. Repeated Settings taps reuse the destination; one Back returns to the originating screen. Reselecting a primary tab adds no duplicate history and retains useful search/draft state.

| State | Required presentation/recovery |
|---|---|
| Empty library | Explain that no setups are saved and offer a create action. |
| Photo processing | Show progress and prevent duplicate submissions; preserve completed draft fields. |
| Photo import failure | Explain the error; offer retry/another photo without destroying the draft. |
| Tracking unavailable | Offer saved photos/details for manual recreation and label live guidance unavailable. |
| Tracking lost/stale | Withdraw Match and request reacquisition. |
| Unknown equipment specification | Allow omission; show Not recorded rather than a fabricated value. |
| Large text or keyboard | Keep labels/errors and primary actions readable and reachable. |

Equipment help should explain that inventory records what the photographer uses and can associate it with setups; it does not pair with or control the equipment. Keep unknown specifications optional. Node connection is a separate capability.

Use text/icons alongside colour for state. Preserve the implemented design system rather than restyling the app to satisfy a generic documentation checklist. Test these behaviours with [APP-01–11](../engineering/APP_ACCEPTANCE.md).
