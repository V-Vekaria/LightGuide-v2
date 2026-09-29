# ESP32-S3 evaluation-kit sensor bench

Bench bring-up of the new commercial R&D evaluation kit: board identity, verified pin map,
each sensor on its own, then all of them running together. Evidence and outcome are in
[ESP32S3_SENSOR_BENCH_2026-09-21.md](../../docs/validation/ESP32S3_SENSOR_BENCH_2026-09-21.md).

This is **bench/evaluation firmware**, not the product node firmware. It has no phone link:
BLE and its message contract are not implemented here. It does not establish sensor accuracy
or calibration. It is separate from the legacy Arduino Nano ESP32 firmware in `device/`; do
not reuse that pin map on this board.

## Hardware as received and verified

| Part | Identity | How it was verified |
|---|---|---|
| Controller | ESP32-S3 DevKitC-1-style board, silkscreen `ESP32-S3-DEV-KIT-NXRX`, module `ESP32-S3-WROOM-1` marked `N16R8` | `esptool flash-id`: ESP32-S3 (QFN56) rev v0.2, Wi-Fi + BT 5 LE, **16 MB flash**, 8 MB embedded PSRAM, MAC `44:1b:f6:ca:6e:64` |
| Distance | VL53L5CX 8×8 multi-zone ToF | ID registers: device `0xF0`, revision `0x02` at I²C `0x29` |
| Orientation | **Adafruit BNO085** 9-DoF breakout | Board silkscreen and photo; product IDs read over SHTP (part 10004148 sw 3.2.6, …) |
| Light/spectral | AS7343 | Enumerates at I²C `0x39`; all 18 channels read with the Adafruit driver |
| Bench display | SSD1306 128×64 OLED | Enumerates at `0x3C`; used only as a bench readout, not a product UI |
| Save button | Momentary push button | Press/debounce test (single, double-tap, rapid bursts) |

The board is an **N16R8**, not the N8R8 in the original order note, and the IMU is an
**Adafruit BNO085**, not the SparkFun BNO086 SEN-22857. See `docs/V1_BOM.md`.

The CH343 USB-UART port (UART0) is used for upload and serial. The same board also shows up
as a native-USB port. Opening the serial port can reset the board, and the serial link does
not keep output sent while no one is listening.

## Verified wiring

Left header, top to bottom: `3V3, 3V3, RST, 4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14, 5V, G`.

| ESP32-S3 | Connects to | Purpose |
|---|---|---|
| 3V3 | `+` rail | Power for every module |
| G | `−` rail | Common ground |
| GPIO8 | SDA bus row | I²C data (400 kHz) |
| GPIO9 | SCL bus row | I²C clock |
| GPIO4 | Save button → GND | Internal pull-up, pressed reads LOW; not a strapping pin |
| GPIO10 | BNO085 RST | IMU hardware reset |
| GPIO17 | BNO085 SCL | UART, ESP32 TX → sensor RX |
| GPIO18 | BNO085 SDA | UART, sensor TX → ESP32 RX |

| Module | Pins |
|---|---|
| OLED | VCC `+`, GND `−`, SDA/SCL on the bus rows |
| VL53L5CX | VIN `+`, GND `−`, SDA/SCL on the bus rows; LPn, INT, RST, PWREN unconnected |
| AS7343 | VIN `+`, GND `−`, SDA/SCL on the bus rows; 3Vo, INT, GPIO unconnected |
| BNO085 | VIN `+`, GND `−`, **P1 → `+`** (UART mode), SDA → GPIO18, SCL → GPIO17, RST → GPIO10; INT, 3Vo, CS, DI, P0, BT unconnected |

**The BNO085's SDA/SCL must never go on the I²C bus rows.** In UART mode they carry serial
data and would jam the other devices.

## Toolchain

- `arduino-cli` 1.5.1, core `esp32:esp32` 3.3.11, FQBN `esp32:esp32:esp32s3`
- Adafruit SSD1306 2.5.17, Adafruit GFX 1.12.6, Adafruit BusIO 1.17.4
- SparkFun VL53L5CX Arduino Library 1.0.3
- Adafruit AS7343 1.1.0
- Adafruit BNO08x 1.2.7 (SparkFun BNO08x Cortex Based IMU 1.0.6 is only needed by one historical diagnostic)

```bash
arduino-cli compile -b esp32:esp32:esp32s3 -u -p <PORT> experiments/esp32s3-sensor-bench/sketches/AllSensors_Live
```

## Sketches

| Sketch | What it does | Status |
|---|---|---|
| `AllSensors_Live` | All four devices plus the save button, with a live OLED dashboard. Streams a 10 Hz CSV row of every reading (see below), a 1 Hz status line and `EVENT save #n` on each press. AS7343 auto-gain. | Main bench build; verified with all parts connected |
| `Button_PinFinder` | Watches every free GPIO and shows on the OLED which one a button pulls LOW | Tool; found a button wired to `+` instead of GND |
| `BNO085_Uart` | BNO085 alone over UART, printing roll/pitch/yaw | Verified: 3/3 clean starts, 50 Hz |
| `VL53L5CX_Range` | 8×8 ranging with a depth map on the OLED | Verified |
| `VL53_Identify` | Reads the L0X / L1X / L5CX ID registers and names the part | Verified |
| `I2C_BusDisplay` | Live on-OLED list of which expected devices answer | Tool |
| `I2C_LiveMonitor` | Serial version: pull-up presence and which devices answer | Tool |
| `I2C_ScanID`, `I2C_Scanner` | Bus scan with device identification | Tool |
| `I2C_LineDiag` | Pull-up, stuck-line, short and SDA/SCL-swap checks | Tool |
| `I2C_PinFinder` | Tries every GPIO pair to find where a module is wired | Tool (ignore GPIO0 hits, see below) |
| `OLED_SSD1306_Test` | Border, text and counter on the OLED | Verified 2026-09-15 |
| `bno085-i2c-attempts/*` | The attempts to run the BNO085 over I²C | Historical evidence; I²C mode proved unreliable |

## Recording data and making figures

`AllSensors_Live` prints three kinds of serial line: `H,...` (CSV header, at start-up and
every 10 s), `D,...` (one row per ToF frame, about 10 Hz: press count, ToF centre/nearest/
valid-zone count, roll/pitch/yaw with the BNO085's calibration status and accuracy estimate,
AS7343 gain and 13 gain-normalised bands, and all 64 ToF zones) and human-readable status.

The save button doubles as a "measure now" marker: set up a step, press, keep still.

```bash
python tools/capture.py --name tof_distance --presses 8
python tools/plot_bench.py tof data/<run>.csv --truth-cm 10,20,30,50,75,100,150,200
python tools/plot_bench.py light data/<run>.csv --labels off,10%,25%,50%,75%,100%,3200K,4400K
```

`capture.py` waits for the board to restart, records until the given number of presses
(plus `--tail` seconds) and survives a USB drop by reconnecting and carrying the press count
over. `plot_bench.py` cuts the recording at each press and draws figures in the style of the
LightGuide-Edge coursework. `data/` and `figures/` are git-ignored; runs cited as evidence are
added with `git add -f`.

**AS7343 auto-gain.** A fixed high gain saturates under a photo light and a low one loses a
dark room, so the firmware steps the gain to keep the brightest channel between 10% and 90%
of full scale, discards the first reading after each change, and reports `raw / gain`. The
same light therefore reads about the same at any gain: in the torch check the room read 1.9
at both 2048× and 1024×. Whether every gain step is that exact has not been measured; it
matters against a ±10% brightness tolerance and belongs in the calibration session.

## Lessons from bring-up

- **Breadboard gaps.** Each breadboard's centre channel splits every row into two separate
  5-hole groups, and two joined breadboards have separate power rails. A wire across either
  gap connects to nothing. That caused a complete bus blackout (no pull-ups on any GPIO) until
  fixed.
- **The DevKitC-1 leaves one free hole per pin.** Run one jumper from each pin to a bus row
  or a rail, and plug the modules in there.
- **The BNO08x does not work reliably over I²C with the ESP32-S3.** It enumerates, reports
  its firmware IDs and accepts configuration, but streaming stalls, and the first probe is
  intermittently NACKed. Adafruit lists the BNO085 as clock-stretching and violating I²C
  timing, and says it does not work well with the ESP32 or ESP32-S3. An extra 2.2 kΩ SDA
  pull-up gave one clean run that could not be reproduced. UART mode (P1 high) works every
  time. It also keeps the shared bus free of the timing violation.
- **After `wasReset()`, wait about 50 ms before re-enabling reports**; an immediate re-enable
  is lost while the chip is still booting. `AllSensors_Live` also re-arms the IMU after 3 s
  of silence as a safety net.
- **The VL53L5CX is not an L0X or L1X**: those ID registers return nothing, so generic "VL53"
  examples silently fail. `begin()` uploads about 84 KB of firmware to the sensor, so set
  400 kHz or it takes about 10 s. Zones aimed at open space report invalid, so a partial
  valid count is normal.
- **GPIO0** is the BOOT strapping pin with an onboard pull-up, and phantom-ACKs every I²C
  address during pin sweeps. **GPIO38 reads low permanently**: it is the onboard RGB LED's
  data line on this board.
- **The save button is sampled by its own 5 ms FreeRTOS task** with a 20 ms stable-level
  debounce, because the main loop blocks for hundreds of milliseconds during spectral
  integration and would miss quick taps.
- **The SSD1306 library silently drops the I²C bus to 100 kHz.** Its constructor takes the
  clock to use during *and after* each display update, and the default "after" is 100 kHz, so
  every redraw undid `Wire.setClock(400000)`. Each ToF frame read took 138 ms and the sensor
  delivered only about 4 frames/s. Passing `400000, 400000` fixed it: 37 ms per read, about
  10 frames/s. Until 2026-09-23 `AllSensors_Live` therefore actually ran at 100 kHz.
- **Opening the serial port restarts the board** and the serial link keeps nothing sent while
  no one is listening, so start a capture before pressing, not after.

## Not established

Distance, orientation or spectral **accuracy and calibration**; magnetometer calibration and
magnetic interference; power draw; the onboard RGB LED. The BLE contract is defined in
`docs/engineering/DEVICE_PROTOCOL.md` and implemented by the node firmware in
[`firmware/esp32s3-node/`](../../firmware/esp32s3-node/README.md), which reuses this bench's
drivers; these bench sketches still report a save press only on the serial link and the OLED.
