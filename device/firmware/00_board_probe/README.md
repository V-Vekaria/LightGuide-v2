# M0 — Board probe

**Sketch:** `00_board_probe.ino` *(not written yet)*

Establish the board is healthy and learn its real parameters. Report over serial:
chip model/revision/CPU/MAC, flash size and **partition table**, PSRAM, an I²C scan
(expect nothing — no on-board sensors), and an analog read on the intended LDR pin
**with SoftAP running**.

**Acceptance:** all of the above printed, and the ADC still works with Wi-Fi up.

**Why the Wi-Fi-up ADC read:** ESP32 ADC2 is claimed by the radio and this design runs
SoftAP permanently. See `../../docs/00-BOARD.md` §3.2.
