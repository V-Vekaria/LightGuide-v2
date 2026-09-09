> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M0b — Display bring-up

**Sketch:** `00b_display_test.ino`

Confirms the I²C OLED is wired correctly and turns it on.

**Expected wiring** (`../../docs/00-BOARD.md` §4):

| OLED | Board |
|---|---|
| VCC | **`3V3`** — ⚠️ not 5 V, see `../../docs/00-BOARD.md` §3.4 |
| GND | `GND` |
| SDA | `A4` |
| SCL | `A5` |

**Acceptance:** serial prints `PASS: initialised`, and the panel shows a bordered test
pattern with an inverted bar. The border blinks once a second, so a frozen panel is
distinguishable from a live one.

**Reading the failure modes:**

| Symptom | Meaning |
|---|---|
| Empty I²C scan | not powered, SDA/SCL swapped, wrong pins, or bad ground |
| ACKs but init rejected | probably an SH1106, not an SSD1306 |
| Only the top half lit | it is a 128×32 panel — set `SCREEN_H` to 32 and re-flash |
