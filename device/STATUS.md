# STATUS

**One question this file answers: what do I do next?**
Update it at the end of every session. Keep it short — detail belongs in `docs/`.

---

## Right now

**Phase:** ✅ **The device works.** It serves the app from its own flash, guides from a
target set either on the phone or by holding the button, and gives v1's feedback on the
OLED, the RGB LED and the buzzer. Setups persist across power cycles.

**Next action:** run the **conformance suite against the real board** (M5's formal check).
It has never run against this firmware and is the thing most likely to catch a contract
detail that is subtly wrong.

**Also open:** the switch's short press is unbound. v1 used it to label a data-logging run;
that is the natural binding and the one the data-collection step will want.

### Hard-won lessons from bring-up — all of them cost real time

1. **Device state must be visible ON THE DEVICE.** Safe mode announced itself only on
   serial, so a switch stuck LOW presented as "the Wi-Fi has stopped working". Capture
   confirmed only with a chirp, so a refused capture looked identical to a working one.
   Both are on the OLED now, and the idle screen shows the live switch state.
2. **A boot loop looks like a dead board** — no USB at all. `device/tools/watch_serial.py`
   reopens the port across resets, which is the only way to see a crash in `setup()`.
3. **Start Wi-Fi before the HTTP server.** AsyncTCP binds through lwIP, which does not
   exist until `WiFi.mode()` has run.

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
| 5 | Integration | 🟨 firmware done — **conformance not yet run** |

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
