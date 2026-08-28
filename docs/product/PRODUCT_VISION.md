# LightGuide Product Vision

## Vision
LightGuide is a smart lighting-setup system for photographers that records the real physical state of a lighting setup and helps restore it later with measurable guidance.

## Core problem
Photographers can save camera settings and flash power, but the physical geometry of a lighting setup is still often recreated from memory, rough diagrams, tape measures, or repeated trial-and-error.

## Product promise
**Measure → Save → Recreate.**

LightGuide should make a lighting setup reproducible as a measurable physical configuration, not just a visual reference.

## Primary user
Photographers who regularly rebuild studio or location lighting setups and care about repeatability, speed, and consistency.

## Initial value proposition
- capture a real setup rather than manually documenting every measurement;
- restore light position and orientation with directional guidance;
- reduce setup time and repeated test shots;
- preserve useful setup data across shoots;
- support one light first while keeping the architecture extensible to multi-light workflows.

## Product principles
1. **Physical truth over guesswork.** Measurements and validated positioning should drive guidance.
2. **Simple photographer workflow.** AR, coordinate systems and sensor fusion should remain implementation details.
3. **Offline core workflow.** Save and recreate must not depend on cloud connectivity.
4. **Evidence before hardware lock-in.** Major sensor and positioning choices must be validated experimentally.
5. **Do not overclaim AI.** V1 is a capture-and-recreation product, not an automatic lighting-design oracle.
6. **Architecture should scale to multiple lights.** V1 may build one node, but its data model should not assume only one.

## V1 outcome
A user can record a light's spatial configuration, move the light away, and use LightGuide to return it to the saved configuration within validated positional and angular tolerances.

## Longer-term direction
After reliable capture/recreation is proven, LightGuide may add:
- multi-light coordinated setup recreation;
- richer illumination and spectral measurements;
- subject/background-aware adaptation;
- recommendation of new lighting setups;
- team/cloud setup libraries and sharing.

These are roadmap directions, not current V1 commitments.
