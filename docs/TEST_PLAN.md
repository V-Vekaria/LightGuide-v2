# LightGuide v2 — V1 Test Plan

## Current gate: Phase 0 AR positioning

Purpose: prove or reject the phone-AR positioning hypothesis before final commercial hardware decisions.

## Equipment

Required:
- Android phone with ARCore support;
- development laptop with Android Studio;
- light stand/tripod;
- printed known-size visual marker;
- tape measure or laser measure;
- floor tape/markers;
- angle reference if available.

No LightGuide electronics are required for Phase 0.

## Prototype requirements

The Phase-0 app must:
- initialise AR tracking;
- detect a known marker;
- expose current X/Y/Z;
- expose pitch/yaw/roll;
- save a target pose;
- compute live delta from target;
- present directional guidance;
- log timestamped measurements for analysis.

## Test matrix

Run repeated trials across:
- distances: approximately 1 m, 2 m, 4 m and the longest practical studio distance available;
- front, side and oblique marker views;
- different marker sizes if needed;
- bright, normal and dim studio lighting;
- stand moved by small, medium and large offsets;
- partial temporary marker occlusion;
- app/session restart and reference re-establishment.

Aim for at least 20–30 reposition trials before making the architecture decision.

## Metrics

Record per trial:
- true X/Y/Z displacement;
- AR-reported X/Y/Z displacement;
- absolute position error;
- true orientation change;
- AR-reported orientation change;
- orientation error;
- time to first detection;
- time to relocalise;
- marker size and distance;
- lighting condition;
- tracking failures/jumps;
- final user-guided return error.

Summarise:
- median error;
- 90th/95th percentile error;
- worst-case error;
- failure rate;
- scan/relocalisation time.

Do not validate the system using only average error; large outliers can make live physical guidance unsafe or frustrating.

## Initial gate

Preferred result:
- position repeatability about 3–5 cm for normal studio use;
- orientation about 2–3°;
- low failure/outlier rate;
- acceptable marker and scanning workflow.

The 3–5 cm range is a broad feasibility screen, not the application's match tolerance. The agreed application defaults are ±3 cm for distance/height and ±3 degrees for direction/tilt. Report error distributions and the fraction meeting the tighter target separately; passing the broader screen does not prove ±3 cm accuracy. Preserve original failed/outlier trials.

If results are materially worse, investigate reference/marker improvements first, then sensor fusion/UWB if needed.

## Later V1 system tests

After positioning is frozen and node hardware exists:
- BLE connection/reconnection;
- multi-node identity;
- ToF/spectral/IMU calibration;
- sensor liveness/staleness;
- save/recreate end-to-end latency;
- battery runtime;
- full setup reconstruction;
- baseline comparison against memory/manual diagram;
- repeated image similarity under recreated lighting.
