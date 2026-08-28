# LightGuide v2 — V1 Product Specification

## Product objective

LightGuide V1 helps photographers **measure, save and recreate** real studio-lighting setups with less guesswork and less repeated setup time.

The V1 product is not an AI lighting designer. Its core job is repeatability of a setup that physically existed.

## Primary user problem

A photographer can create a good setup, but later recreating the exact physical light positions, heights, angles and measured illumination from memory or diagrams is slow and inconsistent.

## V1 value proposition

A smart light-stand system that automatically records a physical lighting configuration and later gives live directional guidance to restore that configuration.

## Core workflow

### Save setup
1. User opens the LightGuide app.
2. User defines or scans a subject/studio reference.
3. Phone observes LightGuide node(s) and establishes their spatial pose.
4. Future node telemetry supplies local sensing data.
5. App stores the setup.

### Recreate setup
1. User opens a saved setup.
2. User re-establishes the subject/studio reference.
3. App observes the current node pose.
4. App compares current state with saved state.
5. App gives corrections such as left/right, forward/back, raise/lower, rotate and tilt.
6. User receives a matched/within-tolerance state when the setup is sufficiently close.

## V1 scope

Included:
- one-node prototype first;
- architecture compatible with multiple nodes;
- position and orientation capture/recreation;
- saved setup library;
- live physical correction guidance;
- local/offline core workflow;
- phone-led spatial positioning;
- future BLE sensor-node integration.

Not required for V1 core:
- automatic creation of a new artistic lighting design;
- subject-based 'optimal lux' recommendations;
- cloud dependency;
- dedicated camera on each node;
- autonomous motorised movement of light stands.

## Future roadmap

- V1: capture and recreate one or more real setups.
- V1.5: stronger multi-light workflows and collaborative setup handling.
- V2: adapt saved setups when subject/background/material changes.
- V3: recommend or create new lighting configurations.

## Initial success criteria

The V1 architecture must demonstrate that a user can save a real light pose, move the stand, and restore it more reliably than memory/manual placement.

Phase-0 positioning targets:
- approximately 3–5 cm repeatable positional error in normal studio use;
- approximately 2–3° orientation error;
- reliable relocalisation;
- practical marker detection range and scan time.

These values are engineering targets pending validation.

## Validation demo

A strong V1 validation experiment is:
1. create a portrait lighting setup;
2. record it;
3. move the light(s);
4. have another person recreate the setup using LightGuide;
5. compare setup time and resulting image similarity with memory/manual methods.
