# LightGuide V1 — Product Requirements Document (PRD)

## 1. Product summary
LightGuide V1 is a lighting-setup capture and recreation system for photographers. It records the physical configuration of a light and later guides the user back to the saved state.

**Core workflow:** Measure → Save → Recreate.

## 2. Problem statement
Recreating a previous lighting setup is still partly manual. Camera settings and light power can be stored, but stand position, height, direction and tilt are often reconstructed from memory, diagrams or repeated testing. This creates setup delay and inconsistent results.

## 3. Target user
Primary: studio/location photographers who repeatedly recreate portrait, product or controlled-lighting setups.

Secondary future users: assistants, rental studios, content teams and small production crews.

## 4. V1 job to be done
When a photographer has a lighting setup they want to reuse, LightGuide should let them save its measurable physical configuration and later restore that configuration without manually re-measuring every dimension.

## 5. V1 must-have capabilities
- establish a repeatable subject/studio reference frame;
- identify the LightGuide node associated with a light;
- capture light position in 3D;
- capture light orientation sufficiently for practical recreation;
- save a named setup locally;
- load a saved setup later;
- compare current pose with target pose;
- show understandable correction guidance such as left/right, forward/back, raise/lower, rotate and tilt;
- show when the light is within accepted tolerance;
- operate without internet for the core workflow;
- preserve an architecture that can later support multiple light nodes.

## 6. V1 non-goals
V1 does **not** need to:
- automatically design the best lighting setup;
- infer the perfect lux level from subject colour;
- identify a subject and autonomously choose artistic lighting;
- control every third-party light brand;
- provide cloud collaboration;
- include a camera in the LightGuide hardware;
- ship with UWB unless Phase 0 demonstrates it is required;
- lock the final commercial sensor BOM before positioning feasibility is proven.

## 7. User experience requirements
The user should not need to understand AR coordinates, SLAM, sensor fusion or spatial mathematics.

### Save flow
1. Open LightGuide.
2. Establish/scan the subject or studio reference.
3. Detect the LightGuide node/light.
4. Capture the setup.
5. Name and save it.

### Recreate flow
1. Open a saved setup.
2. Re-establish the reference frame.
3. Detect the current light/node.
4. Receive live physical correction instructions.
5. Finish when all required dimensions are inside tolerance.

## 8. Product success criteria
V1 is successful only if the workflow is demonstrably better than manual recreation.

Key success metrics to validate:
- repeatable position/orientation accuracy;
- time to restore a setup;
- relocalisation reliability across repeated sessions;
- percentage of trials successfully restored without manual measurement;
- user comprehension of guidance;
- offline completion of the core workflow.

Initial engineering targets are hypotheses and are defined in `../engineering/ENGINEERING_REQUIREMENTS.md` and `../TEST_PLAN.md`.

## 9. Critical dependency
The first technical risk is spatial positioning. Android ARCore + known visual references must be validated before final commercial hardware is locked.

Phase 0 is therefore a feasibility gate, not a side experiment.

## 10. V1 release boundary
A V1 prototype is complete when one LightGuide-equipped light can be saved, physically moved, and restored to the saved pose with measured repeatability under defined supported conditions.

Multi-light support must be anticipated in the architecture, but proving one node is sufficient for the first integrated prototype.
