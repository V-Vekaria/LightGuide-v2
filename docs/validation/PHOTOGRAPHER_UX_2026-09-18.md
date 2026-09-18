# Photographer usability update — 18 September 2026

## Implemented

- Whole-image previews and full-screen photo viewer with 1–4× button zoom, scrolling/panning and fit reset. Compare original and new images in one viewer. Photos remain local.
- Compact saved reference in the active manual instruction. Optional measurements/height view and saved details collapse. Manual mode does not present an impossible top-view position. Practice keeps top/side views.
- Home opens interactive practice directly; no sample is published into the library. Setup cards show photo thumbnails or a no-photo placeholder.
- Accept fractional or decimal shutter speeds; display familiar fractions. Optional camera settings during capture; add inventory then return to the existing draft.
- Explicit assessment, including Not evaluated; no positive default. Resume explains that current manual readings must be re-entered. Measurement reference instructions and ordinary-language status copy.
- Version 0.1.4 / Android code 5; package com.lightguide.codex unchanged.

## Data preservation

SQLite v2 adds not_evaluated through one transactional leaf-table rebuild. Existing rows, target versions, photos, completed outcomes, index and immutability protections are preserved. Legacy unfinished assessment choices are cleared once to require reconfirmation; notes and steps remain. A newer database cannot be opened by the old APK. Do not uninstall or clear storage when upgrading.

## Available checks

Local typecheck and 37 Node tests passed, including real SQLite v1→v2 preservation/rollback, draft camera durability, immutable settings, explicit assessment and shutter parsing. Web/Android export and exact GitHub CI results are recorded with the delivery commit. Browser tests now exercise direct demo entry without library pollution, inline inventory return, portrait/landscape fit and zoom, comparison switching, thumbnails and explicit outcome selection.

Android smoke includes installation over the previously verified 0.1.3 APK with an existing setup, followed by offline restart and manual recreation. This check must pass on the delivery commit before an upgrade is claimed verified.

## Limits and follow-up

No new physical-phone or photographer trial is claimed. Native gallery/camera permissions, keyboard/large-font usability and actual photo bytes across a physical-phone upgrade remain phone checks. The viewer uses stored optimised images (up to 1600 px), with explicit button zoom and scroll; it is not an original-resolution RAW editor or a pinch-gesture implementation. Real AR/BLE and accuracy remain unavailable. Broader categories and shoot scheduling remain deferred as agreed in the prioritised plan.

Initial implementation `aab6a76338a8046874e22b92450709203ab659ce`: software/browser suite and positioning checks passed in [run 35381205952](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/35381205952). Follow-up separates camera inventory from lighting selections and exposes photo comparison on completed attempts; that revision requires its own full CI result. Final build results/artifact identity are recorded in the delivery PR.
