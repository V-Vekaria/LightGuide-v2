# STATUS

**One question this file answers: what do I do next?**
Update it at the end of every session. Keep it short — detail belongs in `docs/`.

---

## Right now

**Phase:** ✅ **M5 complete. The firmware conforms to the contract on real hardware** —
21/21, over real HTTP and a real WebSocket. `reports/M5_conformance_acceptance.md`.

**Next action:** nothing is blocking. The remaining item is the switch's **short press**,
still unbound; v1 used it to label a data-logging run, which is what the data-collection
step wants.

**To re-run conformance:** `device/tools/run_hardware_conformance.ps1` — unattended, joins
the board's network, tests, and restores the home network in a `finally` block.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 0 | Board probe | ✅ **PASS** 20 Aug — ADC re-test owed |
| 0b | Display bring-up | ✅ **PASS** — SSD1306 128×64 @ `0x3C` |
| 0c | Peripherals (HC-SR04 / buzzer / switch) | ✅ **PASS** 20 Aug |
| 1 | Sensor check | ✅ **PASS** 20 Aug — LDR 99.8% of scale, ADC/Wi-Fi clean |
| 2 | LittleFS store | ✅ setups survive a power cycle |
| 3 | SoftAP + HTTP | ✅ app served from flash, all routes answered |
| 4 | Live WebSocket | ✅ 10 Hz frames, app renders them |
| 5 | Integration | ✅ **PASS** 24 Aug — 21/21 on hardware |

## Hardware

| | |
|---|---|
| Board | Arduino Nano ESP32 (ESP32-S3) |
| Port | COM10 |
| FQBN | `arduino:esp32:nano_nora` |
| Last seen | 20 Aug 2026 — healthy, COM10, DFU `OK` |
| Wiring | ✅ complete — OLED, HC-SR04, buzzer, switch, LDR all verified |
| Firmware on board | **M0j switch test** (flashed 20 Aug 2026) |
| Upload | ✅ plain `arduino-cli upload` — DFU driver registered 20 Aug |

## Two things not to forget

1. **`ambient` is the shared zero for the brightness axis.** Getting it wrong breaks
   capture and guidance silently — as a disabled button, not an error.
   `docs/01-API-CONTRACT.md` §3.
2. **Missed distance reads are `null`, never `0`.** The app believes a `0`.
