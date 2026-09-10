# LightGuide v2 — Commercial R&D

**Current V1 objective: Measure → Save → Recreate real photographic lighting setups.**

LightGuide v2 is the commercial R&D project. The product direction is a smart light-stand system that automatically records the physical state of a lighting setup and later guides the photographer to recreate it.

This repository also contains an earlier commercial prototype that explored a different interaction model: manually entering a target distance/light level and using an ESP32 + ultrasonic/LDR node to guide the stand. That work is preserved because parts of its filtering, guidance, device abstraction, setup storage, testing and mock-device infrastructure may be reusable. It is **not** the current product architecture.

## Current V1 baseline

The current V1 is designed around:

- a smartphone as the spatial positioning and user-interface layer;
- phone AR / visual tracking to estimate light-node position and orientation relative to a subject/studio reference;
- a known visual marker/reference on each LightGuide node for identification and pose tracking;
- BLE communication between the phone and future LightGuide nodes;
- local node sensing for distance/depth, illumination/spectrum and orientation;
- offline core operation;
- multi-light architecture from day one, while building and validating one node first.

The intended workflow is:

1. **Measure** — scan the studio/subject and observe each LightGuide node.
2. **Save** — store each light's physical configuration and measured lighting state.
3. **Recreate** — later scan the scene again and receive live corrections such as move left/right, forward/back, raise/lower, rotate and tilt until the setup is within tolerance.

## Current engineering milestone

The next milestone is **Phase 0: AR positioning validation**. Before finalising production electronics or integrating the whole product, we must prove that phone-based spatial positioning is accurate and usable enough in a real studio. The already selected evaluation kit can be checked independently; it does not bypass this gate.

Initial acceptance targets for the experiment are approximately:

- normal studio positioning: repeatable error around **3–5 cm**;
- orientation: approximately **2–3°**;
- reliable relocalisation after moving the stand;
- usable marker detection at realistic studio distances and viewing angles.

These are broad feasibility-screening targets, not product claims. The application's tighter distance/height matching defaults are ±3 cm; passing a 3–5 cm screen does not establish that capability. See the schema and engineering requirements for the distinction. If phone AR cannot meet the requirement reliably, the positioning architecture will be augmented or replaced, with UWB/sensor fusion as a candidate fallback.

Start with [CLAUDE.md](CLAUDE.md), [current status](docs/STATUS.md) and [the documentation map](docs/DOCUMENTATION_MAP.md).

See:

- [`docs/V1_PRODUCT_SPEC.md`](docs/V1_PRODUCT_SPEC.md)
- [`docs/V1_ARCHITECTURE.md`](docs/V1_ARCHITECTURE.md)
- [`docs/POSITIONING_RESEARCH.md`](docs/POSITIONING_RESEARCH.md)
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)
- [`docs/DECISIONS.md`](docs/DECISIONS.md)
- [`CLAUDE.md`](CLAUDE.md)
- [`experiments/phase-0-ar-positioning/README.md`](experiments/phase-0-ar-positioning/README.md)

## Application and data specification

The offline application lives at [`apps/mobile/`](apps/mobile/README.md) - React Native/TypeScript with Expo Router and a local-first SQLite data layer, implemented alongside physical testing per ADR-015. It has a tested save/manual-recreate journey; live phone-AR-based positioning remains subject to validation and has no native adapter wired in yet. iOS awaits appropriate development/test hardware. See `apps/mobile/README.md` for exactly what is implemented, simulated, tested and untested.

The Android AR source and marker assets have been recovered from branch experiment/phase-0-ar-positioning and hardened per the source audit. Start with the [software delivery handoff](docs/engineering/CLAUDE_BUILD_HANDOFF.md), [source audit](docs/validation/AR_SOURCE_AUDIT_2026-09-10.md) and [current status](docs/STATUS.md) - not another AR scaffold.

- [Application scope and backlog](docs/product/APP_MVP_PLAN.md)
- [Seven-table database design](docs/product/DATABASE_DESIGN.md)
- [Fields and snapshot format](docs/product/DATABASE_SCHEMA.md)
- [Offline-sync procedures](docs/product/OFFLINE_SYNC.md)
- [Exact evaluation-kit status](docs/V1_BOM.md)

These are implementation plans, not claims of deployed databases, working new-node BLE or validated accuracy.

## Legacy commercial prototype

Old companion-app plans and dated handovers have been removed from active paths and placed in [the legacy archive](docs/archive/legacy-companion/README.md).

The existing Preact/TypeScript companion app, mock device, guidance logic and `device/` firmware work predate the current architecture. Preserve them as reference unless a later migration decision explicitly replaces them.

Important reusable areas include:

- `src/guidance/` — arrival, liveness, stability and verdict logic;
- `src/device/` and `src/contract/` — device abstraction and conformance concepts;
- `src/store/` — setup/state handling;
- `src/backup/` — export/import concepts;
- `mock-device/` — hardware-independent development/testing approach.

Do not treat the old ultrasonic + LDR + manual target workflow as the baseline for new V1 work.

## Relationship to LightGuide Edge

[`LightGuide-Edge`](https://github.com/V-Vekaria/LightGuide-Edge) is the separate university COM683 academic prototype. It must remain independent and should not be rewritten to match the commercial architecture.

## Development rule

For new work, use the documents above as the source of truth. When architecture changes, update the decision record first so future developers and AI coding agents do not silently revert to an older concept.
