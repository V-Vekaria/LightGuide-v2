# LightGuide design QA — 29 September 2026

## Scope and evidence

- Reference set: `D:\LightGuide-v2-main\App Design\1-4.png` through `29-32.png` (screens 01–32).
- Implementation: Expo/React Native mobile app at 390 × 844 CSS pixels, dark theme, clean browser storage.
- Focused comparisons:
  - `docs/validation/design-qa-welcome-comparison.png`
  - `docs/validation/design-qa-home-comparison.png`
- Implementation captures:
  - `apps/mobile/artifacts/acceptance-welcome.png`
  - `apps/mobile/artifacts/acceptance-home.png`
  - `apps/mobile/artifacts/acceptance-example-details.png`

The reference panels were cropped from the supplied composite and normalized to 390 × 844 for side-by-side inspection. The implementation captures use the same viewport and a device scale factor of 1.

## Visual findings and resolutions

1. **P1 — first-use screen lacked the approved photographic anchor.** Resolved by bundling a fictional demo placement image and using it as the welcome hero. The image is explicit demo content, not user data.
2. **P2 — navigation used text glyphs rather than a coherent icon family.** Resolved with Material Community Icons for the brand, settings and bottom navigation.
3. **P2 — example content could be mistaken for user-created work.** Resolved with `EXAMPLE SETUP`, `DEMO`, and explanatory copy at onboarding, library and details touchpoints.
4. **P2 — home actions and state were visually undifferentiated.** Resolved with a clear page heading, offline-state badge, primary action card, distinct secondary demo action and stable bottom navigation.

## Rubric

| Area | Result | Evidence |
|---|---|---|
| Typography and hierarchy | Pass | Large task headings, restrained labels, consistent body sizes and readable line lengths. |
| Spacing and layout | Pass | Shared cards, gutters, vertical rhythm and 44 px-or-larger primary targets at 390 × 844. |
| Colour and states | Pass | Dark navy surfaces, mint primary actions, amber warnings, explicit disabled/stale states. |
| Images | Pass | Bundled demo result/placement pair; uncropped, expandable application media remains supported. |
| Icons | Pass | One vector icon family; no emoji/glyph navigation icons. |
| Copy and provenance | Pass | Simulation, example data, manual height and stale readings are never presented as live hardware facts. |
| Responsive behaviour | Pass | Acceptance suite covers the 390 × 844 phone viewport; content scrolls without horizontal overflow. |
| Accessibility | Pass with known follow-up | Semantic buttons/labels and target sizing are present; physical TalkBack testing remains a phone check. |
| Interaction states | Pass | Empty, failure, stale, disabled, recovery and success paths are covered in browser acceptance tests. |

## Interaction validation

- Clean-install onboarding persists photography type and experience.
- Guided demo works without hardware and exposes Reference / Lights / Camera / Check.
- The example opens into details, recreation, comparison and assessment.
- A user-created setup survives a reload.
- Browser acceptance tests fail on unexpected console/page errors in the covered critical journeys.

The capture experience intentionally keeps its data-entry sections available on one scrollable screen while also exposing the approved Photos / Lights / Camera / Review phases. This preserves the existing tested draft behaviour and is recorded as a deliberate product difference, not a visual defect.

**Final result: passed.** No unresolved P0, P1 or P2 design-QA findings remain in the tested acceptance path.
