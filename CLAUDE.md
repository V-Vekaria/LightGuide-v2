# LightGuide v2 — Current Build Handoff

## Start here

Read [AGENTS.md](AGENTS.md), [current status](docs/STATUS.md) and the [documentation map](docs/DOCUMENTATION_MAP.md). This file is a short entry point; topic documents own the details.

Current product: **Measure → Save → Recreate** real photographic lighting setups, Android first, offline core, one physical node initially.

Planning is sufficient to begin bounded implementation. It is not evidence that positioning, the new sensors, BLE or cloud sync work.

## What to work on next

Use [the software delivery handoff](docs/engineering/CLAUDE_BUILD_HANDOFF.md) for the exact scope, milestones, tests and user handover.

1. Identify the implementation branch and installed version through [current status](docs/STATUS.md) and [branch evidence](docs/validation/BRANCH_STATUS_2026-09-14.md). Both Codex and separate comparison apps already exist; preserve them until the user compares them.
2. Read that branch's apps/mobile/README.md and validation reports. Main's missing mobile directory and original source-audit findings are not instructions to repeat completed work.
3. Run or reuse evidence for the exact revision being delivered. Record package/version, commit, artifact identity and results using [app acceptance criteria](docs/engineering/APP_ACCEPTANCE.md).
4. Complete remaining phone checks and demonstrated fixes, including repeated navigation, durable local storage, media and manual recreation. Do not attribute emulator results to a physical phone.
5. Reuse the chosen branch's hardened native experiment for physical trials; keep real AR accuracy, BLE, sensor calibration and iOS checks explicitly pending.
6. Continue independent software or separately requested bench work while preserving the offline core and native harness boundaries.

ADR-015 permits the offline application to proceed alongside Phase 0. It does not pass the positioning gate or authorise the entire cloud/AI roadmap. Preserve the native experiment as a separate measurement harness. See [architecture](docs/V1_ARCHITECTURE.md).

## Hardware work

For an explicitly requested hardware task, use [V1_BOM.md](docs/V1_BOM.md):
- evaluation controller: ESP32-S3-WROOM-1-N8R8 DevKitC-1-compatible board;
- evaluation sensors: VL53L5CX, BNO086 SEN-22857 and AS7343 ADA6477;
- only the controller order is screenshot-verified; exact received sensor variants still need verification;
- verify the exact board, pin map, voltage requirements and each sensor before combined wiring;
- use the onboard programmable RGB LED if confirmed working; do not add a separate LED by default;
- do not assume OLED, buzzer, battery measurement or a suitable user-confirmation button exists;
- keep new-board work separate from the legacy Nano ESP32 firmware and wiring.

Component bench tests can proceed as a separately requested task, but do not replace the phone-positioning gate. BLE behaviour is planned; its implementation-ready GATT/security/message contract and firmware are not finished. Production hardware remains unselected.

## Database implementation handoff

Seven core domain tables with validated scene snapshots:
- [logical design](docs/product/DATABASE_DESIGN.md);
- [fields, relationships and snapshot format](docs/product/DATABASE_SCHEMA.md);
- [offline sync, conflicts, media and deletion](docs/product/OFFLINE_SYNC.md).

These are specifications; branch-specific implementations and evidence are linked from STATUS.md. Local database tests do not prove full cloud sync. Internal sync records are additional infrastructure. Do not make a full backend a prerequisite for Phase 0.

Application distance/height matching defaults are ±3 cm; direction/tilt ±3 degrees; brightness ±10%; spectral comparison experimental. These are tolerances, not proven accuracy. The broader historical 3–5 cm Phase-0 screening range does not prove the tighter application target; evaluate both separately.

## Legacy boundary

Root src/, mock-device/ and device/ contain the earlier manual-target Preact + Nano ESP32 implementation. Preserve their code, tests and recorded evidence; reuse only after checking fit. Root npm build/test success is not an Android/AR/BLE validation result.

Old plans and handover history are in [the archive](docs/archive/legacy-companion/README.md); do not execute them as current instructions. Do not modify the separate LightGuide-Edge university repository.

## Decision and delivery discipline

Use [DECISIONS.md](docs/DECISIONS.md) and the topic owners in the map to resolve old conflicting prose. If authoritative current requirements genuinely conflict, flag the conflict rather than guessing.

Work in small reviewable milestones. Preserve unrelated work. State implemented, simulated, untested and blocked items separately. Update current status and validation evidence after real work; a planning decision never counts as a passed test.
