# ESP32-S3 evaluation-kit sensor bench — 2026-09-20 to 2026-09-21

**Question:** What evaluation parts were actually received, what pin map works on the actual
board, and can every sensor run at the same time on one controller?

**Scope:** Identity, wiring and combined operation only. This is not an accuracy, calibration,
power, BLE or product-suitability test. It follows the BOM's bring-up rule (identify the board,
record a new pin map, test each sensor alone, then combine).

**Method:** Firmware and procedures in
[experiments/esp32s3-sensor-bench/](../../experiments/esp32s3-sensor-bench/README.md). Each
device was probed by I²C address and ID registers, run on its own, and then run together in
`AllSensors_Live`. Results were read from serial output and the bench OLED.

**Equipment:** ESP32-S3 DevKitC-1-style board; VL53L5CX; Adafruit BNO085; AS7343; SSD1306
OLED; momentary push button; breadboards and jumper wires. `arduino-cli` 1.5.1, `esp32:esp32`
3.3.11, library versions in the experiment README.

**Environment:** Indoor desk, board held or resting, room lighting. No ground truth.

## Results

### Received parts (differences from the BOM)

| BOM entry | Actually received | Evidence |
|---|---|---|
| ESP32-S3-WROOM-1-**N8R8** | ESP32-S3-WROOM-1-**N16R8** (silkscreen `ESP32-S3-DEV-KIT-NXRX`) | `esptool flash-id`: ESP32-S3 (QFN56) rev v0.2; Wi-Fi, BT 5 LE, dual core 240 MHz; embedded PSRAM 8 MB; **detected flash 16 MB**; module marked `N16R8` |
| VL53L5CX 8×8 ToF | VL53L5CX | ID registers `0x0000 = 0xF0`, `0x0001 = 0x02` at `0x29`; the L0X (`0xC0`) and L1X (`0x010F`) ID registers do not match |
| **SparkFun BNO086 SEN-22857** | **Adafruit BNO085** 9-DoF breakout | Board silkscreen (photo); SHTP product IDs: part 10004148 sw 3.2.6, part 10003606 sw 1.2.230, part 10003254 sw 4.4.485, part 10003171 sw 4.2.548 |
| Adafruit AS7343 ADA6477 | AS7343 | Enumerates at `0x39`; 18 channels read with the Adafruit driver. Breakout SKU not photographed. |

### Verified pin map

I²C at 400 kHz on GPIO8 (SDA) / GPIO9 (SCL) with OLED `0x3C`, VL53L5CX `0x29` and AS7343 `0x39`.
BNO085 on UART: P1 → 3.3 V (UART mode), sensor SDA/TX → GPIO18, sensor SCL/RX ← GPIO17,
RST ← GPIO10, Serial1 at 3 Mbaud. Save button GPIO4 → GND with internal pull-up. Full tables
are in the experiment README.

### Observations

| Item | Observation | Outcome |
|---|---|---|
| Shared I²C bus | OLED, VL53L5CX and AS7343 all answer at once; no stray addresses | PASS |
| VL53L5CX | Ranges at 8×8 / 10 Hz. A fixed target at about 81 mm read 77–85 mm over roughly 100 frames (±2 mm around the mean; no ground truth). Zones facing open space report invalid. | PASS for operation; accuracy not measured |
| AS7343 | All 18 channels read about once per second at gain 256×, readings stable while static | PASS for operation; photographic usefulness not measured |
| BNO085 over I²C | Enumerates and returns product IDs; report enable is ACKed, but zero reports arrive (SparkFun 1.0.6 and Adafruit 1.2.7 drivers, 100 and 400 kHz). With a 2.2 kΩ extra SDA pull-up: one clean 20 s run, not reproducible (initial probe NACKed on the next two starts). Bisection with only OLED + BNO085 on the bus also gave zero reports. | **FAIL** — consistent with Adafruit's listing of the BNO085 as violating I²C timing and not working well with ESP32/ESP32-S3 |
| BNO085 over UART | 3/3 clean starts; about 401 rotation-vector reports per 8 s (50 Hz as configured); angles track hand movement | PASS |
| All four together (`AllSensors_Live`) | All init OK; IMU streaming alongside ToF and spectral reads. On one start the first post-reset re-enable was lost and the 3 s watchdog restored reporting. | PASS |
| Save button | 6/6 presses counted (edge-interrupt version). After switching to 5 ms polling with a 20 ms debounce: 18 events including a double tap 300 ms apart and a 6-tap burst about 300–400 ms apart, no events closer than 280 ms; OLED counter matched what the user saw | PASS |

**Outcome:** PASS for received-part identity, the verified pin map and combined operation of all
four devices plus the save button. FAIL for the BNO085 on I²C with this controller, which is why
it now uses UART.

## Decisions

- Run the BNO085 over UART, not the shared I²C bus. This also protects the other I²C devices
  from its timing violations. No soldering needed: P0/P1 are header pins on the Adafruit board.
- A momentary save button (GPIO4) is added to the bench prototype at the user's request. A press
  is an event for the phone app, which does the actual storing; the device does not store setups.
- The OLED stays a bench readout only; it is not a product UI.

## Not established

Distance, orientation and spectral accuracy against ground truth; calibration (including
magnetometer calibration and interference); latency; power; the onboard RGB LED; the BLE link
and its message contract. None of the VAL-001–004 phone-positioning gates are affected by this
bench work.

**Artifacts:** [experiments/esp32s3-sensor-bench/](../../experiments/esp32s3-sensor-bench/README.md).
Adafruit I²C troublesome-chip list:
<https://github.com/adafruit/I2C_Addresses/blob/main/troublesome_chips.md>.

## Follow-up — 2026-09-23 per-sensor checks

The rig was moved onto a light stand next to an LED photo panel, and a CSV logging path,
AS7343 auto-gain and capture/plot tools were added (see the experiment README).

**Correction to the pin-map section above:** the I²C bus did not actually run at 400 kHz. The
SSD1306 library resets the clock to 100 kHz after every display update, which silently undid
`Wire.setClock(400000)`. Found by timing: each VL53L5CX frame read took 138 ms, limiting it to
about 4 frames/s. Fixed in `AllSensors_Live` (37 ms per read, about 10 frames/s). The earlier
results are unaffected apart from speed.

| Check | Observation | Outcome |
|---|---|---|
| VL53L5CX on a wall | 10 s at a wall: all 64 zones valid in every frame, centre 98.2 cm, sd 3 mm, smooth 95–103 cm gradient across the map (the sensor was slightly tilted). The user compared the display with a tape at 10, 20, 35 and 40 cm and found it correct; those comparisons were not recorded. A recorded 8-distance run was not completed: two attempts ended in USB drops (cable weight on the connector while on the stand), and the third had no button presses because the button had been rewired to `+` instead of GND. | PASS for stable operation; accuracy graph not produced |
| Save button after rewiring | No presses registered. `Button_PinFinder` showed no pin changing; the wire was on `+` instead of GND. After the user fixed it: 10/10 presses on GPIO4. | PASS after the wiring fix |
| AS7343 torch check | A phone torch about 5 cm away, on/off twice: the reading rose about 25× (1.9 → about 45) each time and returned to the same 1.9 baseline; auto-gain stepped 2048× → 256× and back, and the settling readings were correctly excluded. | PASS: sensor and auto-gain respond |
| AS7343 with the LED panel | Two runs (8 brightness/colour steps; and panel on/off) showed no response to the panel: the gain stayed at 2048× and the level drifted slowly with room light. The torch check rules out the sensor, so the panel's light was not reaching the sensor window. | INCONCLUSIVE: aiming; repeat in a controlled room |
| BNO085 tilt of a light | Not run. The IMU measures only what it is fixed to, and in the bench layout it hangs on wires and the breadboard is clamped to the pole, which does not tilt with the light's ball head. | Deferred until the node is mounted on the light |

**Decision:** brightness, colour-temperature and tilt accuracy need a controlled room or studio,
with the node fixed to the light and a known reference (a light meter or lux/CCT reference for
light, and a phone inclinometer for tilt). Home tests stop at "does it respond".

**Protocol note for the BLE work:** `DEVICE_PROTOCOL.md` specifies raw AS7343 channel values. With
auto-gain, a raw value only has meaning together with the gain that produced it (the same light
gives values 8× apart at 256× and 2048×). The protocol owner should decide whether to add a gain
field or send gain-normalised values before the firmware implements the measurement characteristic.

Evidence runs kept in the repository (`git add -f`, the rest stay local): `data/*_tof_diag.csv`,
`data/*_light_onoff.csv` and `data/*_light_torch.csv` with their trace figures.
