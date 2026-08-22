# M0b — Display bring-up: **PASS**

**Date:** 19 August 2026
**Sketch:** `firmware/00b_display_test/00b_display_test.ino`
**Flashed via:** `tools/flash_rom.py` over the ROM bootloader (DFU unusable, see `docs/00-BOARD.md` §5)

---

## Evidence

The panel rendered the test pattern, and the on-screen text *is* the report:

```
LightGuide ESP32
OLED OK @ 0x3C
[display test]        <- inverted bar
128x64
```

| Acceptance criterion | Result |
|---|---|
| Display ACKs on I²C | ✅ **`0x3C`** — as assumed from v1 |
| `SSD1306` init accepted | ✅ pattern renders, so `display.begin()` returned true |
| Panel geometry | ✅ **128×64** — all four text rows render, bottom row at y=50 |
| Both pixel polarities | ✅ the inverted bar draws black-on-white correctly |
| Wiring | ✅ correct as built — VCC on `3V3`, SDA `A4`, SCL `A5` |

The controller is a genuine SSD1306, not an SH1106 — an SH1106 would have ACKed at the
same address and then failed or rendered offset.

## Finding: the panel is dual-colour, not uniform monochrome

Visible in the result — **the top ~16 rows are yellow, the remaining ~48 are blue.**
This is a physical property of the glass, not something software controls: the framebuffer
is still 1 bit per pixel and the driver has no concept of the split.

Consequence for any UI built on this display: **row 0–15 is a fixed-colour band.** It suits
a persistent title or status strip. A layout that ignores the split — a value straddling
y=16, say — will look like a rendering bug rather than a design choice.

Recorded in `docs/00-BOARD.md` §4.

## Not established here

- Nothing else on the I²C bus was enumerated in a way I could read back — the serial
  report runs once in `setup()` and had already finished before the monitor attached.
  **M0 board probe covers this properly** (it re-reports every 10 s).
- The `ambient`/ADC and Wi-Fi coexistence questions are M0, still unflashed.
