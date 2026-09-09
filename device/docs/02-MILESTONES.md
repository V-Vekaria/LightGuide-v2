> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../CLAUDE.md) and [BOM](../../docs/V1_BOM.md).

# 02 — Milestones

Six steps, in order. Each has a **single acceptance check** that must be *observed*, not
assumed. No milestone starts before the one below it passes.

The point of the ordering: each step adds exactly one source of new failure. When
something breaks at step 4, steps 0–3 are already known good, so the fault is in what
step 4 added. Skipping ahead destroys that property and turns debugging into guesswork.

---

## M0 — Board probe · `firmware/00_board_probe/`

**Goal:** establish the board is healthy and learn its real parameters.

Report over serial:
- Chip model, revision, CPU frequency, MAC
- Flash size and **partition table** (→ real bundle headroom, `docs/00-BOARD.md` §3.3)
- PSRAM present/size
- I²C scan on the default pins (expect **nothing** — this board has no on-board sensors)
- An analog read on the intended LDR pin **with SoftAP running**, to settle the ADC1
  question in `docs/00-BOARD.md` §3.2

**Acceptance:** all of the above printed, and the ADC keeps working with Wi-Fi up.

**Prerequisite:** `arduino-cli core install arduino:esp32` (~1 GB, not yet installed).

---

## M1 — Sensor check · `firmware/01_sensor_check/`

**Goal:** trustworthy distance and brightness, no networking involved.

- HC-SR04 distance in cm — **wire the divider first** (`docs/00-BOARD.md` §3.1)
- LDR raw brightness normalised to `0..1`
- A first ambient estimator
- Print both at ≥10 Hz

**Acceptance:** move a hand — distance tracks plausibly and monotonically; shade the LDR —
brightness falls. Missed ultrasonic reads report as **`null`, never `0`**
(`docs/01-API-CONTRACT.md` §3). Fill in the pin map in `docs/00-BOARD.md` §4 and freeze it.

---

## M2 — LittleFS store · `firmware/02_littlefs_store/`

**Goal:** the setup library survives power loss.

- Mount/format LittleFS
- Store `Setup` objects as JSON, ~200 B each
- Soft delete via the `deleted` flag — never erase the record

**Acceptance:** write setups, pull USB, reboot, read them back byte-identical.

---

## M3 — SoftAP + HTTP · `firmware/03_softap_http/` ⚠️ **freeze gate**

**Goal:** the app loads from the board and talks to it.

- SoftAP on a fixed address, no captive portal
- Serve the built v2 bundle from LittleFS at `/`
- Implement the `/api/*` routes in `docs/01-API-CONTRACT.md` §2

> **Do not start this milestone until `docs/03-OPEN-DECISIONS.md` is resolved.**
> This step is where the HTTP surface becomes real; changing it afterwards means
> reflashing and re-testing everything above.

**Acceptance:** a phone joins the AP, loads the app, and `GET /api/setups` returns the
stored library.

---

## M4 — Live WebSocket · `firmware/04_websocket_live/`

**Goal:** live guidance works end to end.

- WebSocket at `/live`, 10 Hz `Reading` frames
- Every field typed exactly per `docs/01-API-CONTRACT.md` §3

**Acceptance:** the app renders live guidance from the real board and the numbers respond
correctly to moving the stand. Remember a malformed frame is **dropped silently** — if the
app shows nothing, suspect the frame shape first.

---

## M5 — Integration · `firmware/05_integration/`

**Goal:** one firmware, and evidence it conforms.

- Merge M1–M4 into a single sketch
- Run the v2 conformance suite against the board

**Acceptance:** conformance passes on hardware.

> **Updated 20 Aug:** the app team has since added `../src/device/conformance.http.test.ts`,
> so the suite **does** now run against `HttpDeviceClient` — D4 is resolved. What remains
> unverified is whether it survives a *real* board: it was written assuming a blank device
> and may leak state between tests. Expect to adjust it here, and check
> `../.superpowers/sdd/device-contract-report.md` for what the app team already fixed before
> changing anything.
