# LightGuide — Competitive Landscape

**Research baseline:** 28 August 2026; reuse/competitor update 10 September 2026.

See [the detailed reuse research](COMPETITOR_REUSE_RESEARCH_2026-09-10.md) for source links and adoption decisions.

## September findings

- Sidus Link Pro documents 3D fixture placement and exportable fixture reports containing X/Y/Z coordinates. A user-owned export importer is a later integration candidate; obtain a sample and verify format/units first.
- set.a.light 3D exports lighting plans containing positions, distances and settings. This is existing overlap with saved setup geometry, not evidence of automatic physical capture.
- Datacolor and PhotoRobot remain useful measurement and repeatable-workflow benchmarks.
- Use official ARCore and sensor libraries to reduce implementation work. OpenIllumination (CC BY 4.0) and Poly Haven assets (CC0) may help later AI/demo evaluation; neither replaces application storage or our own physical measurements.

These findings narrow the differentiation hypothesis to measured physical capture/recreation. No reusable proprietary competitor engine or directly equivalent sensor/pose dataset was verified.

This document tracks alternatives by the job they solve. It is not a claim of patent novelty or freedom to operate.

## LightGuide differentiation hypothesis
LightGuide is strongest when positioned around **automatic physical setup capture + measurable closed-loop recreation guidance**, rather than generic “AI lighting advice,” lighting control, or manual lighting diagrams.

## Category 1 — Light and colour measurement
### Datacolor LightColor Meter
- wireless Bluetooth meter paired with iOS/Android;
- measures incident/flash lighting, lux, CCT/chromaticity/DUV;
- supports simultaneous readings from multiple meters.

**Overlap:** local light/colour measurement and phone-connected hardware.

**Difference to validate:** it measures illumination but does not appear positioned as a system for automatically capturing a light stand's 3D physical configuration and guiding the stand back to that saved pose.

Official source: https://www.datacolor.com/spyder/products/lightcolor-meter/

## Category 2 — Remote light control
### Godox Light
- Bluetooth/NFC-connected control of compatible Godox lights;
- controls brightness, colour temperature and RGB-related parameters;
- supports groups and studio/list views.

**Overlap:** phone-to-light workflow, multi-light concepts and stored/electronic lighting parameters.

**Difference to validate:** controlling fixture output is different from measuring and restoring physical stand position/height/orientation.

Official source: https://www.godox.com/product-e/Godox-Light-App.html

## Category 3 — Lighting diagrams / setup documentation
Known adjacent products and workflows include lighting-diagram and virtual-studio tools that let photographers record or simulate setup geometry. These remain relevant because a sufficiently good manual diagram may solve part of the same job at much lower cost.

Research should continuously compare LightGuide against:
- manual tape-measure workflows;
- lighting diagrams;
- virtual studio planning tools;
- photo/reference-based setup records;
- saved fixture scenes/presets.

## Category 4 — AI lighting analysis/recommendation
AI tools increasingly infer lighting arrangements or suggest camera/lighting settings from reference images. This means “AI-powered lighting assistant” by itself is not a defensible product position.

LightGuide V1 therefore does **not** depend on automatic lighting design as its core differentiator.

## Competitive questions to test
For every relevant product, record:
1. Does it automatically measure physical light position?
2. Does it measure height?
3. Does it measure pitch/yaw/orientation?
4. Does it capture illumination/spectral data?
5. Can it save the setup?
6. Can it guide a user back to the saved physical pose in real time?
7. Does it work across different light brands?
8. Does the core workflow work offline?
9. How much manual measurement/setup is required?
10. What is the purchase/subscription cost?

## Current positioning statement
> **LightGuide is a smart light-stand system that automatically records and recreates real studio lighting setups.**

This statement remains a hypothesis until competitor research, user interviews and prototype validation support it.

## Prior-art warning
Existing photography patents cover combinations of light measurement, distance information, exposure recommendations and photography-environment control. Do not treat the broad concept “sensor + lighting recommendation” as novel. Any commercial patent strategy should focus on specific architecture/workflow claims and receive professional patent/FTO review.

## Maintenance
Update this file when:
- a new competitor/product is discovered;
- a competitor adds physical positioning or recreation guidance;
- user research reveals a more common substitute workflow;
- patent/prior-art research changes the differentiation thesis.
