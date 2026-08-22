# M5 — Integration

**Sketch:** `05_integration.ino` *(not written yet)*

Merge M1–M4 into one firmware. Run the v2 conformance suite against the board.

**Acceptance:** conformance passes on hardware.

> The suite now runs against `HttpDeviceClient` (`../../../src/device/conformance.http.test.ts`)
> — D4 resolved. Still unproven against **real hardware**: it assumes a blank device and may
> leak state between tests, which a single physical board will expose. Expect to adjust it.
