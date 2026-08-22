# 00 — Board facts and hardware constraints

Everything in §1 was **observed on the actual board**, not read from a datasheet.
Everything in §3 is a constraint that must be checked during milestone 0/1.

---

## 1. Verified — 19 August 2026

| Field | Value | How it was established |
|---|---|---|
| Board | **Arduino Nano ESP32** | `arduino-cli board list` auto-identified it |
| SoC | **ESP32-S3 rev 0**, 2 cores @ 240 MHz | ✅ measured, M0, 20 Aug |
| Port | `COM10` | `Get-CimInstance Win32_PnPEntity` |
| USB ID | VID `0x2341` / PID `0x0070` | Device Manager PnP ID |
| Windows status | `OK` | PnP status field |
| FQBN | `arduino:esp32:nano_nora` | `arduino-cli board list` |
| Serial output | **silent** at 115200 | 6 s listen, DTR toggled, 0 bytes |

The silence is expected: a factory Nano ESP32 ships with a sketch that does not print.
It is **not** evidence of a fault. It is also not evidence of health — milestone 0
exists to establish that.

### Toolchain state

| Tool | State |
|---|---|
| `arduino-cli` | ✅ `C:\Users\vishn\Downloads\arduino-cli_1.5.1_Windows_64bit\arduino-cli.exe` |
| Core `arduino:esp32` | ✅ **2.0.18-arduino.5** — installed 19 Aug 2026 (note: 2.0.x, **not** 3.x) |
| Core `arduino:avr` | ✅ 1.8.8 (unrelated) |
| Core `arduino:mbed_nano` | ✅ 4.6.0 (this is the **v1** core, for the Nano 33 BLE) |
| `python` + `pyserial` | ✅ 3.5 |
| `esptool` | ✅ bundled at `Arduino15/packages/esp32/tools/esptool_py/4.5.1/esptool.exe` |
| `dfu-util` | ✅ bundled `0.11.0-arduino5` — **but see §5, the Windows driver is missing** |
| `pio` | ⛔ not found (not required) |

---

## 2. This is not the v1 board

`../LightGuide-Edge` runs on an **Arduino Nano 33 BLE Sense Lite** (nRF52840, Mbed core).
This is an **ESP32-S3**. They share a form factor and nothing else that matters here.

**Nothing carries over automatically:**

| v1 asset | Carries over? |
|---|---|
| Pin map (`../../../LightGuide-Edge/docs/02-HARDWARE.md` §2) | ❌ different GPIO numbering and ADC blocks |
| On-board sensors (LSM9DS1, APDS9960, LPS22HB on `Wire1`) | ❌ **the Nano ESP32 has no on-board sensors at all** |
| Mbed-core libraries | ❌ different core entirely |
| HC-SR04 voltage hazard | ✅ **still applies — see §3.1** |
| LDR divider approach | ✅ concept carries, pin and scaling do not |

> ⚠️ The APDS9960 ambient-light cross-check and the LPS22HB temperature channel that
> v1 relied on **do not exist on this board.** Any ambient estimate must come from the
> external LDR alone, and there is no on-chip temperature source for ultrasonic
> compensation. This is a real capability regression from v1 and must be designed around,
> not assumed away.

---

## 3. Constraints to verify in milestones 0–1

### 3.1 HC-SR04 supply and the ECHO divider

**20 Aug, first attempt: VCC on `3V3` — the module did not respond at all.**
Both pin orientations tested: `D2`→`D3` returned a **2 µs** blip (crosstalk; a real echo is
≥116 µs) and `D3`→`D2` timed out. Silent in both directions, so not a swapped wire.
This is the documented failure of a **standard HC-SR04 below 5 V** — it powers up and
accepts a trigger but cannot drive a usable burst. The **HC-SR04P** variant (3.0–5.5 V)
would have been fine; check the silkscreen.

**Fix: VCC to `VBUS` (5 V), and ECHO through a divider.** The module drives `ECHO` to its
own supply voltage, so at 5 V it must be divided before touching a GPIO — the ESP32-S3 is
**not 5 V tolerant**.

```
HC-SR04 ECHO ──[ 220 Ω ]──┬── D3
                          │
                      [ 330 Ω ]
                          │
                         GND
```

5 V × 330/(220+330) = **3.0 V** — comfortably above the ESP32-S3's ~2.48 V logic-high
threshold and safely under 3.3 V. Draws ~9 mA, which the module sources easily.

Chosen from the resistors actually to hand (10Ω, 100Ω, 220Ω, 330Ω, 10k, 1M). Alternatives
considered: `100+220` gives 3.44 V (over the rail), `330+330` and `10k+10k` give 2.5 V
(too close to the threshold to trust).

**TRIG needs no divider** — it is an input to the module, and 3.3 V reads as a valid high.

> ✅ **`VBUS` measured at 5.10 V, 20 Aug** (`firmware/00d_voltmeter`, 330/220 divider,
> tap 2041 mV). Unlike v1's Nano 33 BLE — where `VUSB` needed a solder bridge closed before
> it carried USB 5 V — the Nano ESP32's `VBUS` is live straight from USB. No rework needed.

### 3.2 ✅ ADC vs Wi-Fi — RESOLVED, `A0` is on ADC1

ESP32 ADC2 is claimed by the Wi-Fi radio, and this design runs SoftAP permanently, so the
LDR had to be proven to sit on ADC1. **Measured 20 August 2026 with the LDR fitted**
(`firmware/01_sensor_check`):

| cycle | Wi-Fi OFF | Wi-Fi AP up | delta |
|---|---|---|---|
| 1–3 | ~2854 | ~2856 | **worst ±7** |

**Worst deviation 7 counts out of 4095 — 0.17%, i.e. noise.** `A0` is unaffected by the
radio. The brightness channel is safe with SoftAP running.

The method matters: rather than one before/after pair — which ambient light drift could
fake — the test **toggles Wi-Fi off and on three times** and compares each pair. A real ADC2
conflict collapses readings whenever the radio is up and recovers when it is down,
repeatably; drifting daylight does not do that.

> M0's attempt at this test read 3994 → 122 and looked alarming. It was meaningless: `A0`
> was floating, with no LDR fitted. **A high-impedance pin measures nothing but noise** —
> never draw a conclusion from a floating input.

### 3.3 Flash budget — ✅ measured, M0

**16 MB flash, 8 MB PSRAM.** The `ffat` partition is **9.375 MB** against a 50 KB bundle
target (the app is 15.89 KB gzipped). Storage is a non-issue.

`app0`/`app1`/`otadata` are present, so **OTA firmware update is available** once M3 has
an HTTP server. Full layout in `reports/M0_board_probe_acceptance.md`.

---

### 3.4 ⚠️ Power the OLED from 3V3, not 5 V

SSD1306 breakout boards carry **I²C pull-up resistors tied to their own VCC**. Power the
module from 5 V and those pull-ups hold SDA and SCL at 5 V — which then feeds 5 V straight
into the ESP32-S3's GPIO, which is **not 5 V tolerant**.

The module itself is usually happy at either voltage, so this mistake *looks* like it
works. The damage is to the microcontroller, not the display, and it can present as a
slowly degrading pin rather than an immediate failure.

**Power the display from `3V3`.** Then the bus idles at 3.3 V and the whole hazard
disappears.

## 4. Pin map

Wired as below unless a row says otherwise. Canonical the same way v1's was:
**wire to the map, don't edit the map to match the wiring.**

| Signal | Pin | ADC block | Notes |
|---|---|---|---|
| LDR tap | `A0` | ✅ **ADC1, verified** | 10kΩ pulldown to GND, LDR to `3V3`. §3.2 |
| HC-SR04 TRIG | `D2` | — | v1 used `D2` too |
| HC-SR04 ECHO | `D3` | — | **via 220Ω/330Ω divider** — required now VCC is 5 V, §3.1 |
| HC-SR04 VCC | **`VBUS`** (5 V) | — | 3V3 was tried first and the module stayed silent, §3.1 |
| OLED SDA | `A4` | — | default `Wire` bus on the Nano form factor |
| OLED SCL | `A5` | — | default `Wire` bus |
| OLED VCC | **`3V3`** | — | ⚠️ **not 5 V / VBUS** — see §3.4 |
| OLED GND | `GND` | — | |
| Switch | `D7` | — | `INPUT_PULLUP`, other leg to `GND` — **no external resistor**. v1 used `D7` too |
| Buzzer | `D9` | — | ✅ **passive**, run at **3000 Hz** via LEDC. **No `tone()` on ESP32.** Quiet by nature at 3.3 V — see `reports/M0c_peripherals_acceptance.md` |

### Display — ✅ confirmed on the bench, 19 August 2026

**SSD1306, 128×64, at `0x3C`**, on `Wire` (`A4`/`A5`), powered from `3V3`.
Verified by flashing `firmware/00b_display_test` — see `reports/M0b_display_acceptance.md`.
Same panel and driver as v1, so `Adafruit_SSD1306` + `Adafruit_GFX` apply unchanged.

> ⚠️ **The glass is dual-colour: the top ~16 rows are yellow, the remaining ~48 blue.**
> This is physical, not addressable — the framebuffer is still 1 bpp and the driver knows
> nothing about it. Treat rows 0–15 as a fixed-colour title/status band. A layout that
> straddles y=16 with one element reads as a rendering bug rather than a design choice.

---

## 4b. ⚠️ The breadboard − rail was never bonded to board GND

Found 20 August 2026, and it was the root cause of **two** separate failures.

**Evidence.** With a divider from `VBUS` to `A0`, the tap read exactly **3149 mV**
(the ADC ceiling) — and it read *the same 3149 mV after the two resistors were swapped*.
A working divider must change its output when the ratio changes: 220/330 gives 3.0 V,
330/220 gives 2.0 V. An identical clipped reading both ways means no current is flowing,
which means **there is no path to ground at all**. With no current there is no drop across
the top resistor, so `A0` simply sat at full `VBUS`.

**Consequence.** Anything grounded to that rail was floating:

- the divider never divided
- **the HC-SR04 never worked** — a sensor with no shared ground reference cannot return
  an echo no matter how correct the rest of the wiring is. Every "all timeout" result
  traces back here.

The display kept working throughout because its ground goes to a board `GND` pin directly
rather than through the rail — which is exactly why the fault stayed hidden.

**Fix:** jumper a board `GND` pin to the − rail.

> v1 lost hours to the same class of fault — there the breadboard `−` rail was sitting at
> 3.3 V (`../../../LightGuide-Edge/AGENTS.md` §13.4). **Rails are not grounded until you ground
> them.** Check this first when a sensor is silent but its wiring looks right.

---

## 4c. ✅ HC-SR04 works — and why it looked dead for so long

Resolved 20 August 2026. **Two independent faults stacked**, and the second one hid the
first being fixed.

**Fault 1 — the floating − rail** (§4b). Real, and it genuinely stopped the module working.

**Fault 2 — a `pulseIn()` timeout shorter than the module's "no target" pulse.**
When an HC-SR04 gets no echo back it does **not** stay silent: it holds `ECHO` HIGH for a
long "nothing there" period, then drops it. On this module that period is **130 ms**, measured
and rock-steady to within ±50 µs.

The test used `pulseIn(..., 30000)`. A 30 ms timeout expires **mid-pulse**, and `pulseIn()`
returns `0` for that — the exact same value it returns when nothing happens at all. So a
perfectly healthy module reported `0 real, 12 timeout`, which reads as "dead".

**What broke the deadlock** was watching the pin directly instead of asking `pulseIn()` for a
width: `firmware/00e_echo_probe` showed `ECHO` rising a steady **468 µs** after every trigger.
A dead or disconnected module cannot produce that.

### Rules this leaves behind

1. **Treat a long echo as NO TARGET, never as a failure.** `>25000 µs` (~430 cm) means nothing
   is in range. Firmware must map that to `distance_cm: null`, which is what the device
   contract already requires — *never* `0`.
2. **The watch window must exceed 130 ms**, or a no-target reading is indistinguishable from a
   dead sensor.
3. **A "0 valid readings" result is a claim about the test, not the hardware.** Prove the pin
   moves before concluding anything about the part.

> Cost of this lesson: several rewiring cycles chasing a module that was working the whole time.

---

## 4d. The OLED does not come back on its own after a power blink

Seen 20 August 2026, while moving the display's ground to the rail.

An SSD1306 keeps its entire configuration — charge pump, contrast, display-on — in volatile
registers. Interrupt its power or ground for even an instant and it resets to a blank,
display-off state. `Adafruit_SSD1306::begin()` normally runs **once in `setup()`**, so
restoring the wire brings back power but nothing ever re-sends the init sequence: the panel
stays dark and looks broken.

**Immediate fix:** press `RST`, or reflash — either re-runs `setup()`.

**Better fix, now in `firmware/00j_switch_test`:** poll for `0x3C` once a second and call
`begin()` again whenever the panel reappears. That makes the display hot-pluggable, which is
worth having on a bench where wires get moved. Any later firmware should keep this — a
display that never recovers from a glitch is a bad failure mode in a finished product too.

> **Related trap:** breadboard power rails are frequently **split at the midpoint**, with no
> connection between the two halves. Grounding one half leaves the other floating. If a
> device dies when moved to "the rail", check for the break in the painted line before
> suspecting the device. This is the same class of fault as §4b.

---

## 5. ✅ Uploading — solved 20 August 2026

> **Resolved.** Registering `nanoesp32.inf` fixed this; plain `arduino-cli upload` now
> works with no jumper. The history below is kept because the dead ends are worth not
> repeating.

Found on the first upload attempt, 19 August 2026.

`arduino-cli upload` fails with:

```
Cannot open DFU device 2341:0070 found on devnum 5 (LIBUSB_ERROR_NOT_FOUND)
No DFU capable USB device available
```

**This is not a board fault.** The Nano ESP32 is a USB *composite* device with two
interfaces, and Windows has bound a driver to only one of them:

| Interface | Device | Windows status |
|---|---|---|
| `MI_00` | **Arduino DFU** | ⛔ **Error, `ConfigManagerErrorCode 28`** — *drivers not installed* |
| `MI_01` | USB Serial Device (COM10) | ✅ OK |

`dfu-util` finds the right VID:PID but cannot *open* the interface, because nothing is
bound to it. Hence `LIBUSB_ERROR_NOT_FOUND`.

### Why the 1200-baud touch does not help

`boards.txt` for this variant sets:

```
nano_nora.upload.tool=dfu-util
nano_nora.upload.use_1200bps_touch=false
```

The Arduino ESP32 core uploads to this board **only** over DFU, and explicitly disables
the reset-to-bootloader touch. There is no serial upload fallback inside `arduino-cli`
for this FQBN.

### The three ways out, cheapest first

1. **Double-tap the white RESET button** on the board — two quick presses. The green LED
   should breathe/pulse, which is bootloader mode. Windows enumerates a *different*
   DFU device there, which often binds correctly. Then upload immediately.
2. **Install the Arduino IDE 2.x** — it ships and registers the Nano ESP32 DFU driver.
   The heaviest option but the one that stays fixed.
3. **Flash with `esptool` over the ROM bootloader**, bypassing DFU entirely.
   ✅ **This is the route that works on this machine** — proven 19 Aug 2026.

### ⛔ Option 1 does not work on this board, and option 3 is the answer

**Double-tapping RESET achieves nothing here.** The Nano ESP32 exposes its DFU interface
*continuously*, as `MI_00` of a composite device, alongside the running sketch's CDC port
on `MI_01`. There is no DFU mode to enter, so no button sequence creates one. Verified:
the USB enumeration after a double-tap was byte-identical, same instance ID.

**`B1` is a pin on the bottom header, not a button.** The board has exactly one button
(`RST`). `B1` sits between `VBUS` and `VIN`, and it is the boot pin.

### ✅ Root cause, found 20 August 2026: the driver ships with the core, unregistered

`arduino:esp32` **includes the correct driver** and simply never registers it:

```
Arduino15/packages/arduino/hardware/esp32/2.0.18-arduino.5/drivers/
    nanoesp32.inf + .cat          <- the one we need
    USB_JTAG_debug_unit.inf + .cat
    dpinst-amd64.exe              <- Arduino's own installer
```

`nanoesp32.inf` targets **`USB\VID_2341&PID_0070&MI_00`** — exactly the interface sitting
at error 28 — and binds **WinUSB** to it (`Include = winusb.inf`, `Needs = WINUSB.NT`).
Signed by Arduino, `DriverVer 08/08/2023`.

So it does officially what Zadig would do by hand. Zadig is unnecessary here.

**Installing Arduino IDE does not fix this** — the IDE was already installed on this machine
and ships no `.inf` of its own. Verified: no `*.inf` anywhere under either IDE install root.

**Fix** (needs an elevated shell — driver installation requires admin):

```
pnputil /add-driver "%LOCALAPPDATA%\Arduino15\packages\arduino\hardware\esp32\2.0.18-arduino.5\drivers\nanoesp32.inf" /install
```

Then replug the board. `MI_00` should move from `Error / 28` to `OK`, after which plain
`arduino-cli upload` works and no jumper is needed again.

### ✅ The working procedure

1. Jumper **`B1` → `GND`**
2. Tap **`RST`**
3. The board re-enumerates as **VID `303A` PID `1001`** — *USB JTAG/serial debug unit*,
   which Windows binds with its **inbox driver**, no install needed
4. Flash with `python tools/flash_rom.py <sketch>`
5. **Remove the jumper**, tap `RST` — the new sketch runs

`GPIO0` is sampled only at boot, so the jumper may be removed any time after step 2 and
the board stays in download mode until the next reset.

Use `--after no_reset` while the jumper is still fitted — otherwise esptool's closing
reset just re-enters download mode.
