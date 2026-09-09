# device/ — Legacy Nano ESP32 maintenance only

This folder contains the earlier Arduino Nano ESP32, HC-SR04/LDR, Wi-Fi HTTP/WebSocket implementation. It is not the new ESP32-S3-WROOM-1-N8R8 sensor-node project.

Follow root [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md) and [V1_BOM.md](../docs/V1_BOM.md). Do not select unfinished items from old milestone notes as the next commercial task.

## If explicitly maintaining this legacy implementation

- Read [STATUS.md](STATUS.md) and the relevant source/tests before changing behaviour.
- Verify the connected board and wiring against [legacy board records](docs/00-BOARD.md); historic COM ports and installed firmware are not current observations.
- Preserve liveness, per-axis staleness, null readings, ambient-baseline and conformance semantics unless a scoped change requires otherwise.
- Existing API code and conformance tests describe the legacy HTTP/WebSocket implementation; they do not define the new BLE contract.
- Do not delete or move code, tools or acceptance evidence to tidy this folder.
- The separate LightGuide-Edge university repository stays untouched.

The original detailed progress log is preserved verbatim in [the archived firmware handover](../docs/archive/legacy-companion/FIRMWARE_HANDOVER.md). Its old app-first product scope, skeleton status and unfinished milestones no longer govern new V1 work.

For the N8R8 evaluation kit, use a separate board configuration/bench experiment after exact hardware verification. Never reuse Nano firmware targets, pin labels or flashing procedures by assumption.
