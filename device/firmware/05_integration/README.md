> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M5 — Integration

**Sketch:** `05_integration.ino` *(source present; legacy Nano implementation)*

Merge M1–M4 into one firmware. Run the v2 conformance suite against the board.

**Acceptance:** conformance passes on hardware.

> The suite now runs against `HttpDeviceClient` (`../../../src/device/conformance.http.test.ts`)
> — D4 resolved. Still unproven against **real hardware**: it assumes a blank device and may
> leak state between tests, which a single physical board will expose. Expect to adjust it.
