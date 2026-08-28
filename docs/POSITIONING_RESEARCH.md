# LightGuide v2 — Positioning Research Baseline

## Problem

Distance alone cannot uniquely locate a light stand in 3D space. A commercial recreation system needs a stable reference frame plus position and orientation.

## Preferred V1 hypothesis

Use the smartphone as the spatial reference system:
- Android ARCore for the first prototype;
- phone visual-inertial tracking for local world pose;
- known-size high-feature visual marker/reference on each LightGuide node;
- stable subject/studio reference to make saved poses meaningful across recreation sessions.

The phone should hide AR complexity from the photographer. The user experience should be scan, save and follow movement instructions.

## Why test AR before UWB

Potential advantages:
- lower hardware BOM;
- no fixed RF anchor installation;
- phone already provides camera, IMU, compute, display and storage;
- easier one-node proof of concept;
- visual node identity can be integrated with positioning.

Risks:
- world tracking drift;
- sensitivity to scene texture and lighting;
- marker visibility and viewing angle;
- marker size required at realistic studio distances;
- relocalisation between sessions;
- pose jitter and orientation error.

## Acceptance gate

Initial engineering targets for Phase 0:
- position repeatability around 3–5 cm in normal studio distances;
- orientation around 2–3°;
- successful relocalisation after stand movement;
- acceptable detection/scan time;
- marker practical enough for a commercial node.

For close product-lighting work, later experiments should test tighter 2–3 cm position targets because small movements can matter more at short light-to-subject distances.

## Ground truth

AR measurements must not be evaluated against themselves. Use independent ground truth:
- tape/laser measurement for position;
- marked floor reference points;
- spirit level/protractor/digital angle reference for orientation where available;
- repeated trials rather than one successful demonstration.

## Fallback path

If AR alone is not sufficiently repeatable, investigate:
1. AR + better/fixed visual references;
2. AR + node IMU/ToF fusion;
3. AR + UWB ranging/anchors;
4. a different dedicated positioning architecture.

Do not add UWB merely because it sounds more precise; require evidence that the simpler system fails the product requirement.

## Phase-0 questions

The experiment should answer:
- How accurate is X/Y/Z at 1 m, 2 m, 4 m and longer realistic distances?
- How stable are pitch/yaw/roll measurements?
- What marker size is necessary at each range?
- How oblique can the view be before pose becomes unreliable?
- What happens under dim studio lighting and bright sources?
- How quickly can the app reacquire the node?
- Can a subject/studio reference be re-established reliably in a later session?
- Does accumulated AR drift make guidance misleading?
- Is the workflow acceptable while the photographer is physically moving a stand?

## Decision rule

Pass: AR is consistently near the target accuracy and usability across realistic scenarios; continue without UWB for V1.

Conditional pass: accuracy is acceptable only with procedural constraints (for example, larger marker or short rescan); decide whether those constraints are commercially acceptable.

Fail: repeated 10–20 cm-class errors, unstable orientation, poor relocalisation or impractical marker/scan UX; redesign positioning before final hardware selection.
