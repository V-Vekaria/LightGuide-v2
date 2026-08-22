# STATUS

**One question this file answers: what do I do next?**
Update it at the end of every session. Keep it short — detail belongs in `docs/`.

---

## Right now

**Phase:** ✅ Bring-up complete (M0 + M1). Hardware is done; firmware starts now.
**Next action:** **M2 — LittleFS store.** Contract-independent, so it can start immediately.

**⚠️ Read before touching the HTTP surface:**
`../.superpowers/sdd/device-contract-report.md` §1 is the **authoritative**
firmware spec. A second session is still building the app. Our own contract doc went stale
once already and wrongly reported two settled decisions as open — so re-read the source,
do not trust a local copy.

**Only real open decision we own:** **D6** — does the device make sound / does the switch
earn a device→app event path? Due before M4 freezes the WebSocket frame.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 0 | Board probe | ✅ **PASS** 20 Aug — ADC re-test owed |
| 0b | Display bring-up | ✅ **PASS** — SSD1306 128×64 @ `0x3C` |
| 0c | Peripherals (HC-SR04 / buzzer / switch) | ✅ **PASS** 20 Aug |
| 1 | Sensor check | ✅ **PASS** 20 Aug — LDR 99.8% of scale, ADC/Wi-Fi clean |
| 2 | LittleFS store | ⬜ **next** |
| 3 | SoftAP + HTTP | 🔒 gated on the **app contract freezing** (not D1/D2 — resolved) |
| 4 | Live WebSocket | ⬜ not started |
| 5 | Integration | ⬜ not started |

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
