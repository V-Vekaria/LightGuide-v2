> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M0 — Board probe

**Sketch:** `00_board_probe.ino` *(source present; legacy Nano implementation)*

Establish the board is healthy and learn its real parameters. Report over serial:
chip model/revision/CPU/MAC, flash size and **partition table**, PSRAM, an I²C scan
(expect nothing — no on-board sensors), and an analog read on the intended LDR pin
**with SoftAP running**.

**Acceptance:** all of the above printed, and the ADC still works with Wi-Fi up.

**Why the Wi-Fi-up ADC read:** ESP32 ADC2 is claimed by the radio and this design runs
SoftAP permanently. See `../../docs/00-BOARD.md` §3.2.
