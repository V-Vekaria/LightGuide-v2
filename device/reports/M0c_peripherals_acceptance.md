# M0c–M0i — Peripherals bring-up: **PASS**

**Date:** 20 August 2026 · board: Arduino Nano ESP32

---

## Summary

| Part | Pin(s) | Result |
|---|---|---|
| OLED SSD1306 128×64 | `A4`/`A5`, `3V3` | ✅ working, `0x3C` |
| HC-SR04 | `D2`/`D3`, `VBUS` | ✅ working — live distance verified |
| Buzzer | `D9` | ✅ working — **passive**, run at **3000 Hz** |
| Switch | `D7` | ✅ working — debounced count verified on the bench |

## Buzzer — passive, 3000 Hz

**Passive, established by ear, not assumption:** during the sweep the pitch audibly rose
and fell. An active buzzer has a fixed internal oscillator and cannot track a swept
frequency — only a passive element does.

Consequences for firmware:

- Must be driven with **LEDC** (`ledcSetup` / `ledcAttachPin` / `ledcWriteTone`).
  **The ESP32 Arduino core has no `tone()`** — any example using it will not compile.
- **Use 3000 Hz.** Chosen by A/B against 2000 Hz (`firmware/00i_buzzer_ab`); 3000 was the
  clearer of the two.

**It is quiet**, and that is expected rather than a fault: a piezo driven single-ended from
a 3.3 V GPIO gets only 3.3 V peak-to-peak, and most of these parts are specified at 5 V+.
If it ever needs to be louder, in increasing order of effort:

1. Re-run the 500–5000 Hz sweep (`firmware/00h_buzzer_resonance`) to find the true resonant
   peak — 3000 Hz was picked from a two-point comparison, not a full search
2. **Differential drive** — move the ground leg to a second GPIO and drive both in
   antiphase: 6.6 V p-p, about **+6 dB**, costs one wire and no parts
3. Transistor switching a 5 V feed from `VBUS`

## HC-SR04

Working. The full diagnosis of why it appeared dead for so long — a floating `−` rail plus a
`pulseIn()` timeout shorter than the module's 130 ms "no target" pulse — is in
`docs/00-BOARD.md` §4b and §4c. Those two sections are the most reusable thing this
bring-up produced.

## Switch

`D7` with `INPUT_PULLUP` — idles HIGH, pressed reads LOW, no external resistor. Verified on
the bench with `firmware/00j_switch_test`: count increments once per press and the live
state tracks the finger. 25 ms debounce.

One implementation note for M1 onward: **a distance ping blocks for ~130 ms when nothing is
in range**, which is long enough to miss a quick tap. The test sketch samples the switch
either side of each ping and during the idle gap. Any firmware that polls both must do the
same, or move to an interrupt.

## Still open

- **Buzzer scope** — whether the device makes sound at all is still `docs/03-OPEN-DECISIONS.md`
  **D6**. This report proves the hardware works; it does not decide that it should be used.
