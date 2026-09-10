# LightGuide Product Roadmap

## Phase 0 — Spatial feasibility
**Goal:** prove whether phone-based AR positioning is good enough for V1.

Deliverables:
- Android ARCore proof of concept;
- known-reference/marker detection;
- saved pose and live delta guidance;
- X/Y/Z + orientation logging;
- 20–30+ measured trials;
- repeatability, relocalisation and usability results;
- decision: keep phone AR, augment it, or replace it.

Exit gate:
- spatial accuracy and orientation repeatability are sufficient for a practical recreation workflow.

## Parallel software delivery (ADR-015)

Reuse the recovered Android experiment and address its source-audit gaps. While the user completes physical validation, implement the offline application shell, durable setup storage, photographs, manual recreation and labelled simulated spatial states. Execute available automated checks and prepare the device handover. See [CLAUDE_BUILD_HANDOFF.md](../engineering/CLAUDE_BUILD_HANDOFF.md).

This parallel track does not pass the positioning gate or advance final electronics decisions.

## Phase 1 — One-node engineering prototype
**Goal:** integrate the first physical LightGuide node with the validated spatial architecture.

Likely work:
- finalise MCU/connectivity choice;
- define BLE protocol;
- add local ToF/depth sensing;
- add orientation support where needed;
- add spectral/light sensing only where a validated use case exists;
- battery/power prototype;
- basic enclosure/stand mounting;
- integrate node identity with the mobile app.

Exit gate:
- one physical light can be saved, moved and restored using the integrated phone + node system.

## Phase 2 — V1 recreation validation
**Goal:** prove end-to-end usefulness, not only sensor accuracy.

Deliverables:
- repeated setup recreation trials;
- time-to-recreate benchmark vs manual methods;
- image/setup similarity evaluation;
- portrait and close-range/product scenarios;
- workflow testing with photographers;
- requirements verification matrix.

Exit gate:
- evidence that LightGuide improves repeatability or setup time enough to justify the product.

## Phase 3 — Multi-light prototype
**Goal:** extend from one node to a real multi-light setup.

Deliverables:
- stable node identity;
- Key/Fill/Rim role assignment;
- sequential or coordinated recreation;
- setup-level match status;
- multi-node BLE/connection reliability testing.

## Phase 4 — Productisation
**Goal:** convert the engineering prototype into a manufacturable product.

Likely work:
- custom PCB;
- production enclosure and mounting system;
- battery/runtime optimisation;
- thermal/power testing;
- supplier/BOM optimisation;
- firmware update strategy;
- mobile UX refinement;
- compliance planning (UKCA/CE/FCC/radio/battery as applicable);
- EVT/DVT/PVT-style validation stages.

## V1.5 / V2 roadmap candidates
- richer multi-light workflows;
- cloud backup/team setup sharing;
- camera settings integration;
- subject/background-aware adaptation;
- material/reflectance assistance;
- AI recommendations for modifying or creating lighting setups.

These are not V1 commitments and should not delay proof of Measure → Save → Recreate.
