# LightGuide node firmware (ESP32-S3, Device Protocol v2)

Firmware for the evaluation node: an ESP32-S3-WROOM-1 **N16R8** board with a VL53L5CX, an
AS7343, an Adafruit BNO085 over UART and a GPIO4 save button. It implements
[LightGuide Device Protocol v2](../../docs/engineering/DEVICE_PROTOCOL.md) as a BLE GATT
server for the Android app.

**Status:** compiles for the exact target and passes host unit tests and a conformance check
against the app's own protocol parser. **It has not been flashed or tested on hardware.** The
BLE link, the sensor values it sends and the save event over BLE are unverified until the
physical acceptance test below is run and recorded. Nothing here establishes calibration,
distance/orientation/spectral accuracy, ±3 cm, or spectral usefulness. Evidence:
[ESP32S3_NODE_FIRMWARE_2026-09-23.md](../../docs/validation/ESP32S3_NODE_FIRMWARE_2026-09-23.md).

This is separate from the legacy Nano ESP32 firmware in `device/`; never flash that build or
its pin map onto this board. The sensor drivers, pin map, auto-gain, BNO085 UART recovery and
button debounce are reused from the verified bench sketch
[`AllSensors_Live`](../../experiments/esp32s3-sensor-bench/sketches/AllSensors_Live/AllSensors_Live.ino).

## Hardware

Wiring is exactly the verified bench wiring in the
[sensor-bench README](../../experiments/esp32s3-sensor-bench/README.md#verified-wiring):

| ESP32-S3 | Connects to |
|---|---|
| GPIO8 / GPIO9 | I²C SDA / SCL at 400 kHz: VL53L5CX `0x29`, AS7343 `0x39` and the bench OLED `0x3C` (status screen) |
| GPIO17 (TX) | BNO085 SCL/RX |
| GPIO18 (RX) | BNO085 SDA/TX |
| GPIO10 | BNO085 RST |
| BNO085 P1 | 3V3 (UART mode) |
| GPIO4 | Save button to GND (internal pull-up) |

The SSD1306 OLED shows a status screen (state, BLE link, ToF/IMU/spectral health, save count, error text); the node runs normally if it is absent. The onboard RGB LED
(GPIO38) is not verified and is not touched.

## Toolchain (as compiled)

- `arduino-cli` 1.5.1
- Core `esp32:esp32` **3.3.11** (ESP-IDF 5.5 based; its BLE library uses the NimBLE host on
  the ESP32-S3)
- FQBN: **`esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,FlashMode=qio`**
  (16 MB flash, 8 MB octal PSRAM, QIO 80 MHz, 3 MB app partition; USB CDC on boot disabled, so
  `Serial` is UART0 on the CH343 port)
- Libraries: SparkFun VL53L5CX Arduino Library 1.0.3, Adafruit AS7343 1.1.0, Adafruit BNO08x
  1.2.7, Adafruit BusIO 1.17.4, Adafruit Unified Sensor 1.1.15, ArduinoJson 7.4.3; `BLE`,
  `Wire`, `SPI` from the core

If `ArduinoBLE` is also installed, arduino-cli reports two candidates for `BLEDevice.h` and
uses the core's `BLE` library, which is the correct one.

## Build and flash

From the repository root, with the board on the CH343 USB-UART port (`COM5` on the bench PC;
check with `arduino-cli board list`):

```bash
arduino-cli compile -b esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,FlashMode=qio firmware/esp32s3-node/LightGuideNode
arduino-cli upload -b esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,FlashMode=qio -p COM5 firmware/esp32s3-node/LightGuideNode
arduino-cli monitor -p COM5 -c baudrate=115200
```

Opening the serial port resets the board. The first boot takes a few seconds while the
VL53L5CX firmware (~84 KB) is uploaded over I²C; the node already advertises as `booting`
during that time.

## Protocol v2 implementation

### GATT

Advertised local name `LightGuide-Node`. The 128-bit service UUID is in the advertising
packet (Android scans filter on it) and the name is in the scan response, because both do not
fit in 31 bytes. One phone at a time; advertising restarts after a disconnect.

| Characteristic | UUID | Properties | Content |
|---|---|---|---|
| Service | `7d6f0001-5a6b-4c47-9a41-4c6967687447` | primary | |
| Device info | `7d6f0002-…` | READ | `{"v":2,"type":"device_info","device_id":"lg-node-<efuse MAC>","fw":"0.1.0","hw":"esp32s3-n16r8-eval","cap":["tof","imu","spectral","save_button"]}` |
| Measurement | `7d6f0003-…` | NOTIFY | 5 Hz snapshot |
| Event | `7d6f0004-…` | NOTIFY | `save_pressed` |
| Command | `7d6f0005-…` | WRITE | `request_status`, `identify` |
| Status | `7d6f0006-…` | READ, NOTIFY | node state and sensor health |

`device_id` comes from the factory MAC in eFuse, so it is stable and independent of the BLE
address. Every payload has `"v":2`. `seq` is one counter shared by measurement, event and
status payloads (it only increments when a payload is built, so gaps are normal).

### ATT MTU and payload size

Each GATT value is one complete JSON object; nothing is fragmented. A measurement is at most
338 bytes, so it needs an ATT MTU of at least 341. The precompiled NimBLE default MTU is 256
and the Android app does not request a larger one, so the node:

1. sets its preferred MTU to 517, and
2. starts the ATT MTU exchange itself right after connecting (either side may; Android answers
   with 517).

Before every notification the node checks the negotiated MTU. A payload that does not fit is
**not sent** (the core library's `notify()` would silently truncate it, so notifications go
through the NimBLE host API instead). The serial log then says so and Status reports
`ble:mtu_too_small`. Device info and Status READs work at any MTU (Android uses long reads).

### Measurement

```json
{"v":2,"type":"measurement","seq":42,"uptime_ms":12345,"distance_mm":812,"roll_deg":1.20,"pitch_deg":-3.40,"yaw_deg":87.60,"tof_valid":true,"imu_valid":true,"spectral_valid":true,"spectral_gain":2048,"spectral":[0.446,0.871,1.404,1.405,1.514,0.528,1.937,1.556,1.489,1.797,1.122,2.777,3.445]}
```

Measurements are built by a separate task every 200 ms from the latest readings. The sensors
are read in `loop()`, where a spectral read blocks ~150 ms and any driver call can stall, so a
slow or failed sensor never stops BLE: its reading just goes stale and becomes invalid.

**Validity.** A flag is true only if the sensor produced a real reading recently enough:

| Field | Valid when | Fresh within |
|---|---|---|
| `tof_valid` | the latest frame has ≥ 4 valid zones in the central 4×4 block | 500 ms (ranging at 10 Hz) |
| `imu_valid` | a rotation-vector report arrived | 250 ms (reports at 50 Hz) |
| `spectral_valid` | the latest AS7343 read succeeded, was not saturated and was not the first read after a gain change | 2 s (read every 500 ms) |

When a flag is false the matching fields are placeholders, never data: `distance_mm` 0,
`roll_deg`/`pitch_deg`/`yaw_deg` 0, and `spectral` thirteen 0s (the app's parser requires the
fields to exist). A non-finite value also forces its flag false.

**`distance_mm`** is the median of the valid zones (target status 5 or 9) in the central 4×4
block of the 8×8 map (rows 2–5, columns 2–5), rounded to the nearest mm. It is valid only
with at least 4 of those 16 zones valid. The median ignores a minority of outlier zones and
the central block keeps the value on what the sensor points at. This is a defined summary, not
a calibrated distance, and there is no ±3 cm claim.

**`spectral`** is the 13 AS7343 channels in protocol order `f1_405, f2_425, fz_450, f3_475,
f4_515, f5_550, fy_555, fxl_600, f6_640, f7_690, f8_745, nir_855, clear` (driver channels F1,
F2, FZ, F3, F4, F5, FY, FXL, F6, F7, F8, NIR, VIS_TL_0), each as the raw count divided by the
gain of that acquisition. `spectral_gain` is that gain (0.5 to 2048). Auto-gain is the bench
rule: keep the brightest of the 13 channels between 10% and 90% of full scale
((ATIME+1)·(ASTEP+1) = 18000 counts), step one gain index at a time, and mark the first read
after each change invalid. Values are not calibrated irradiance, lux, CCT or CRI.

**Orientation axis convention.** `roll_deg`, `pitch_deg` and `yaw_deg` are computed from the
BNO085 `SH2_ROTATION_VECTOR` quaternion (r, i, j, k) exactly as in the bench sketch, as a ZYX
(yaw-pitch-roll) Tait-Bryan decomposition:

- `roll_deg = atan2(2(ri + jk), 1 − 2(i² + j²))`: rotation about the BNO085 **X** axis, −180 to 180
- `pitch_deg = asin(2(rj − ki))`: rotation about the BNO085 **Y** axis, −90 to 90
- `yaw_deg = atan2(2(rk + ij), 1 − 2(j² + k²))`: rotation about the BNO085 **Z** axis, −180 to 180

The axes are the BNO085's own body axes as marked on the Adafruit breakout; angles are
right-handed and relative to the BNO085 rotation-vector reference frame (gravity and magnetic
north, so yaw depends on magnetometer calibration and local interference). How the node is
mounted on a light, and therefore which axis is the light's tilt, is not defined yet: it must be
fixed and checked physically before recreation accuracy testing. The BNO085 calibration status
(0–3) is printed on the serial log but does not gate `imu_valid`. Orientation accuracy is not
established.

### Event

Each debounced press of the GPIO4 button sends exactly one
`{"v":2,"type":"event","seq":…,"uptime_ms":…,"event":"save_pressed"}`. The debounce is the
verified bench rule (5 ms sampling task, level stable for 20 ms, only a settled HIGH → LOW
change counts). If the host has no free buffer the same payload (same `seq`) is retried for up
to 1 s. A press with no connected phone subscribed to events is dropped and logged, not queued:
replaying it later would save a setup the user did not ask for. The node never stores setups.

### Status and commands

Status `state`: `booting` until sensor start-up has been attempted, then `ready` (all three
sensors healthy), `degraded` (one or two) or `error` (none). `tof`/`imu`/`spectral` are sensor
health: initialised and producing data within 2 s / 3 s / 3 s. Health is not the same as a
valid measurement: a ToF aimed at open space is healthy but `tof_valid` is false.

`error` is `null` or comma-separated codes: `tof:init_failed`, `tof:no_frames`,
`imu:init_failed`, `imu:no_reports`, `spectral:init_failed`, `spectral:read_failed`,
`ble:mtu_too_small`, and for a command reply one of `unsupported_command:identify`,
`unknown_command:<name>`, `unsupported_version`, `bad_command` (listed first).

Status is notified when the state, health or error codes change, when the phone subscribes,
and in reply to a command. A Status READ always builds a fresh payload.

| Command | Behaviour |
|---|---|
| `request_status` | Status notification |
| `identify` | **Unsupported**: Status notification with `error` `"unsupported_command:identify"`. The onboard RGB LED output has not been physically verified, so the node does not pretend to identify. |
| anything else | Status notification with `unknown_command:<name>`, `unsupported_version` or `bad_command`; the connection stays up |

### Recovery

- BNO085: the verified behaviour is kept. After `wasReset()` wait 50 ms and re-enable the
  rotation vector; if no report arrives for 3 s, re-enable it again. A BNO085 that fails at
  boot is not re-initialised (its SH-2 driver cannot be reopened) and needs a reset.
- VL53L5CX and AS7343: if initialisation failed, it is retried every 10 s.
- BLE: advertising restarts on disconnect, and the BLE task re-checks it every second.

### Serial log (115200 baud)

Start-up lines (`VL53L5CX init OK`, `device_info {...}`), then once per second:

```
NODE ready | BLE conn mtu 517 sub m1 e1 s1 | sent m1234 skip 0 ev 3 drop 0 | ToF ok 812mm | IMU ok r1.2 p-3.4 y87.6 | AS ok g2048 clear 3.445 | err none
```

plus `BLE connected/disconnected`, `STATUS (...) sent: {...}` and `EVENT save_pressed sent: {...}`.

## Host tests

The protocol payloads, command parser, ToF summary, auto-gain step and debouncer are plain C++
in `LightGuideNode/src/`, so they are tested on a PC:

```bash
CXX=g++ firmware/esp32s3-node/test/run_host_tests.sh
# or, without a system compiler: pip install ziglang, then
CXX="python -m ziglang c++" firmware/esp32s3-node/test/run_host_tests.sh
```

`run_host_tests.sh` builds `test/host_tests.cpp`, runs the unit tests, then
`test/conformance.mjs` feeds sample payloads to the Android app's own parsers in
`apps/mobile/src/device/protocol.ts` (read-only), checks the GATT name/UUIDs against the app's
constants and the channel order against `DEVICE_PROTOCOL.md`, and checks every payload fits one
517-MTU notification. It needs Node ≥ 22.18 and ArduinoJson 7 (found via arduino-cli).

## Physical acceptance test (Protocol v2, section 11)

Not yet run. Record the result in `docs/validation/` with the phone model, Android version,
app version/commit, firmware commit and a serial log. Before starting: flash as above, keep
the serial monitor open, place the node with the ToF facing a wall about 50–100 cm away, and
have a phone torch available.

1. **Boot.** The serial log shows `NODE booting`, then `NODE ready | BLE adv` with `err none`.
   If a sensor is missing, note the `err` codes and continue: steps 4–5 still apply.
2. **Discover.** In the app, open *Connect LightGuide* → *Find LightGuide node*. PASS if a
   card named `LightGuide-Node` appears (the app scans by service UUID only).
3. **Connect.** Tap *Connect*. PASS if the app shows *LIVE SENSOR SNAPSHOT* with
   `Status: ready`, and the serial log shows `BLE connected`, `mtu 517` and `sub m1 e1 s1`.
   If the MTU stays below 341 the log says `does not fit ATT MTU`: record it as FAIL (MTU).
4. **Live values.** Move a hand or card in front of the ToF: the distance changes and shows
   *Distance unavailable* when nothing is in range. Tilt the node about each axis: roll,
   pitch and yaw change (note which physical tilt moves which angle). Shine the torch on the
   AS7343: *Spectral* briefly shows *unavailable* while the gain steps, then returns with a
   lower gain, and the `clear` value on the serial log rises. PASS if all three respond; this
   is plausibility only, not accuracy.
5. **Degraded without fabricated data.** Disconnect in the app, power the board off, unplug
   the AS7343's SDA wire, power on and reconnect. PASS if the app shows `Status: degraded`,
   *Spectral unavailable*, and the serial log shows `err spectral:init_failed` while distance
   and angles still update, and the phone link stays up. Power off, reconnect the wire,
   power on and reconnect: `Status: ready` again. (Optionally repeat with the ToF's SDA
   wire: *Distance unavailable* and `tof:init_failed`.)
6. **Save button.** Press GPIO4 once. PASS if the app shows exactly one *Device event* /
   "Save button received" and the serial log shows exactly one `EVENT save_pressed sent`.
   Then do five separate presses and one quick double tap: the number of app events equals
   the number of presses. Tap *Open setup capture* and save the setup.
7. **Refresh status and identify.** Tap *Refresh status*: the serial log shows
   `STATUS (request_status) sent`. (`identify` has no app button; if tested with a generic
   BLE tool, writing `{"v":2,"type":"command","command":"identify"}` must give a status with
   `"error":"unsupported_command:identify"`.)
8. **Disconnect detected.** With the app connected, power the board off (or walk out of
   range). PASS if the app leaves the connected state and stops showing live readings
   (stale), without the app crashing.
9. **Reconnect.** Power the board on again (no reflash). Without restarting the app, tap
   *Find LightGuide node* → *Connect*. PASS if live readings return. Also tap *Disconnect* in
   the app and reconnect: PASS if the serial log shows `BLE disconnected`, advertising
   resumes and the reconnect works.
10. **Saved setup survives.** Open the setup saved in step 6. PASS if it is still there with
    its sensor snapshot after the disconnect/reconnect cycle.

Overall PASS needs steps 2–4, 5, 6, 8, 9 and 10 in one session. Even a PASS does not
establish calibration, positioning accuracy, ±3 cm, orientation accuracy or spectral
usefulness.

## Known limitations

- Not run on hardware yet (see above).
- `identify` is unsupported until the onboard RGB LED is verified.
- The measurement needs an ATT MTU ≥ 341. This relies on the node-initiated MTU exchange
  being accepted by the phone; the Android app itself never requests a larger MTU.
- A BNO085 that fails at boot needs a reset (the running-state recovery is automatic).
- The ToF summary, validity windows and health thresholds are engineering choices, not
  calibrated or validated values.
- The IMU mount convention (which axis is the light's tilt) is still to be defined physically.
- No pairing/bonding or encryption: an engineering prototype link only (protocol section 10).
- `uptime_ms` wraps after about 49.7 days of continuous uptime.
