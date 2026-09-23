# ESP32-S3 Protocol v2 node firmware — 2026-09-23 (software evidence only)

**Question:** Does the node firmware for LightGuide Device Protocol v2 build for the exact
evaluation board, and do its payloads conform to the Android app's Protocol v2 parsers?

**Scope:** Compilation, host unit tests and conformance only. **No hardware was flashed.**
This establishes nothing about the physical BLE link, sensor values over BLE, the save event
over BLE, reconnect behaviour, calibration, distance/orientation/spectral accuracy, ±3 cm or
spectral usefulness.

**Artifacts:** [firmware/esp32s3-node/](../../firmware/esp32s3-node/README.md) (firmware,
design notes, host tests, physical acceptance procedure).

## Build

| Item | Value |
|---|---|
| Toolchain | `arduino-cli` 1.5.1, core `esp32:esp32` 3.3.11 (BLE library on the NimBLE host) |
| FQBN | `esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,FlashMode=qio` (ESP32-S3-WROOM-1 N16R8: 16 MB flash, 8 MB octal PSRAM) |
| Libraries | SparkFun VL53L5CX 1.0.3, Adafruit AS7343 1.1.0, Adafruit BNO08x 1.2.7, Adafruit BusIO 1.17.4, Adafruit Unified Sensor 1.1.15, ArduinoJson 7.4.3; core BLE/Wire/SPI 3.3.11 |
| Result | Success with `--warnings all`, no compiler warnings. Program 747,399 bytes (23% of 3,145,728); globals 34,476 bytes (10% of 327,680) |

## Host tests

`firmware/esp32s3-node/test/run_host_tests.sh`, compiled with zig 0.16.0 `c++` (clang, from
the `ziglang` PyPI package, because this PC has no system C++ compiler) with
`-Wall -Wextra -Werror`:

| Check | Result |
|---|---|
| Unit tests: payload builders, command parser, state derivation, ToF median summary, auto-gain rule, debouncer | 81 checks, 0 failures |
| Worst-case payload sizes | measurement 338 bytes (needs ATT MTU ≥ 341); status 229 bytes |
| Samples parsed by `apps/mobile/src/device/protocol.ts` (the app's own parsers, unchanged) | 11/11 accepted; `v:3` rejected |
| GATT name and UUIDs vs the app's constants | 7/7 equal |
| Spectral channel order vs `DEVICE_PROTOCOL.md` | equal (names and driver channel array) |
| Conformance check fails on bad input (12-channel spectrum, invalid state) | yes, exit 1 |

## Findings that matter for the physical test

- **ATT MTU.** A measurement is up to 338 bytes, but the precompiled NimBLE default MTU is 256
  and the Android app never requests a larger MTU. The firmware sets its preferred MTU to 517
  and starts the MTU exchange itself after connecting. Whether the phone accepts this is
  unverified. Oversize payloads are never truncated: they are not sent, the serial log says so
  and Status reports `ble:mtu_too_small`.
- **identify** is reported unsupported, because the onboard RGB LED is unverified.
- The ToF summary, freshness windows and health thresholds are engineering choices, not
  validated values. The IMU axis convention is documented; the mount convention is not yet
  defined.

## Not established

Everything in protocol section 11: discovery, connection, live values, degraded-state display,
save event, disconnect/stale, reconnect, and saved-setup persistence. Run the
[physical acceptance test](../../firmware/esp32s3-node/README.md#physical-acceptance-test-protocol-v2-section-11)
and record it here or in a new report.
