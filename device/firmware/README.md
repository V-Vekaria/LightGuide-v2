> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../CLAUDE.md) and [BOM](../../docs/V1_BOM.md).

# firmware/

Two kinds of sketch live here.

## Historical milestones — not the current task queue

These sketches belong to the earlier Nano ESP32 implementation. Consult the [dated M5 report](../reports/M5_conformance_acceptance.md) for completed integration evidence; do not restart this sequence for the N8R8 kit.

| Dir | Milestone | Status |
|---|---|---|
| `00_board_probe/` | M0 — chip, flash, partitions, I²C, ADC/Wi-Fi | ✅ pass |
| `00b_display_test/` | M0b — OLED bring-up | ✅ pass |
| `00c_distance_buzzer/` | M0c — HC-SR04 + buzzer + switch | ✅ pass |
| `01_sensor_check/` | M1 — distance + light, ADC/Wi-Fi retest | ✅ pass |
| `02_littlefs_store/` | M2 — persistence | Historic placeholder; integrated implementation is in 05_integration |
| `03_softap_http/` | M3 — SoftAP + HTTP | Historic placeholder; integrated implementation is in 05_integration |
| `04_websocket_live/` | M4 — live frames | Historic placeholder; integrated implementation is in 05_integration |
| `05_integration/` | M5 — one firmware + conformance | 21/21 legacy hardware conformance recorded on 24 Aug 2026 |

## Diagnostics — written to answer one question each

Kept rather than deleted: each one exists because something looked broken and these are what
proved otherwise. They are the cheapest way to re-check a single subsystem later.

| Dir | Answers |
|---|---|
| `00d_voltmeter/` | Is that pin live, and at what voltage? Reuses a divider into `A0`. Found `VBUS` = 5.10 V, and **detects its own ADC saturation** rather than reporting a clipped value as fact. |
| `00e_echo_probe/` | Does `ECHO` move *at all*? Watches the pin directly instead of trusting `pulseIn()`. **This is the one that proved the HC-SR04 was alive** when every other test called it dead. |
| `00f_distance_display/` | Live distance on the OLED, hands-free. |
| `00g_all_live/` | Distance + display + buzzer together, buzzer mode named on screen. |
| `00h_buzzer_resonance/` | Where is the buzzer loudest? Sweeps 500–5000 Hz. |
| `00i_buzzer_ab/` | A/B two fixed pitches — loudness is far easier to judge by comparison. |
| `00j_switch_test/` | Debounced press counting, plus **hot-plug recovery for the OLED**. |

## Building

See `../RUN.md`. Short version:

```bash
arduino-cli compile --fqbn arduino:esp32:nano_nora firmware/<dir>
```

```bash
arduino-cli upload -p COM10 --fqbn arduino:esp32:nano_nora firmware/<dir>
```
