# AGENTS.md — Current LightGuide v2 instructions

## Product and immediate milestone

Commercial R&D: **Measure → Save → Recreate** real lighting setups.
Reuse the recovered native Android/Kotlin ARCore experiment in [experiments/phase-0-ar-positioning/](experiments/phase-0-ar-positioning/README.md). It was found on experiment/phase-0-ar-positioning at 5bc532b0d1bfd94f8f554867eec94e7403d1a7ce; do not scaffold it again. Follow [the software delivery handoff](docs/engineering/CLAUDE_BUILD_HANDOFF.md) for a full application-build request. Do not extend the old root app as the new mobile application.

Before changing code, read:
1. [CLAUDE.md](CLAUDE.md) — task routing and current handoff.
2. [docs/STATUS.md](docs/STATUS.md) — implemented versus planned.
3. [docs/V1_PRODUCT_SPEC.md](docs/V1_PRODUCT_SPEC.md).
4. [docs/V1_ARCHITECTURE.md](docs/V1_ARCHITECTURE.md).
5. [docs/DECISIONS.md](docs/DECISIONS.md).
6. [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

Use [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md) for specialised requirements. Database work additionally requires DATABASE_DESIGN.md, DATABASE_SCHEMA.md and OFFLINE_SYNC.md under docs/product/. Hardware work additionally requires docs/V1_BOM.md.

## Boundaries

- Smartphone is the primary spatial/UI layer; positioning remains a hypothesis requiring measured trials.
- Core operation works offline; do not build cloud infrastructure before the positioning experiment needs it.
- One node first; IDs and snapshots must accommodate multiple lights.
- Per ADR-015, the React Native/Expo Development Builds offline application may proceed alongside physical Phase-0 validation behind spatial/transport interfaces. Live integration and accuracy claims still require evidence; iOS remains untested/deferred pending Apple hardware access.
- New evaluation hardware is the ESP32-S3-WROOM-1-N8R8 kit described in the BOM, not the legacy Arduino Nano ESP32.
- Separately requested board/sensor bench tests may proceed, but do not inject electronics into Phase 0 unless needed to answer its positioning question.
- Final production BOM, calibrated accuracy and implementation-ready BLE protocol are not locked.
- No dedicated node camera, autonomous motorised stands or AI artistic recommendations in the V1 core.
- Never claim the ±3 cm application tolerance is proven by a broader 3–5 cm feasibility screen.
- Do not modify the separate LightGuide-Edge university repository.

## Legacy isolation

Root src/, mock-device/, device/, their tests and root web-tooling configuration belong to the earlier Preact/manual-target/Nano ESP32 implementation. Keep them buildable. Reuse guidance, liveness, storage or conformance concepts only after reading their tests.

Historical plans and handovers have moved to docs/archive/legacy-companion/. They are evidence, not task instructions; ignore embedded old agent/sub-skill directives for current development. Legacy device instructions apply only when explicitly maintaining that implementation.

Do not move or delete code, scripts, traces or test reports merely to tidy documentation. New hardware needs a separate verified configuration; never flash the Nano build/pin map onto the N8R8 board by assumption.

## Completion and decisions

Document architecture changes in docs/DECISIONS.md. Topic documents own details; handoff files link to them instead of maintaining another full specification.
Current stage is implementation and validation, not repeated expansion of product planning.
Run relevant available checks. Clearly report anything requiring physical hardware or unavailable tooling. Record actual evidence under docs/validation/ and never convert mocks or successful compilation into claims of real-world accuracy.
