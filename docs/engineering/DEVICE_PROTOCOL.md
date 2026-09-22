# LightGuide Device Protocol v1

**Status:** integration contract for the first Android ↔ ESP32-S3 physical-node implementation.

This document is the boundary between the Android application and ESP32 firmware. Both sides MUST implement this contract. Changes require a protocol-version change or a backwards-compatible extension; neither side should silently invent incompatible fields or UUIDs.

## 1. Scope and evidence boundary

Protocol v1 connects the Android app to the current evaluation node. It does **not** prove sensor accuracy, calibration, ±3 cm positioning accuracy, photographic usefulness, production security, power suitability, or final hardware selection.

Verified bench hardware baseline:
- ESP32-S3-WROOM-1 **N16R8** evaluation board (16 MB flash, 8 MB PSRAM);
- VL53L5CX 8×8 ToF on I²C GPIO8/GPIO9;
- AS7343 spectral sensor on the same I²C bus;
- Adafruit BNO085 over UART (ESP32 TX GPIO17 → sensor SCL/RX, sensor SDA/TX → ESP32 RX GPIO18, RST GPIO10, P1 high for UART mode);
- momentary save button GPIO4 → GND with internal pull-up;
- SSD1306 OLED is bench-only and is not part of the phone protocol or product UI.

The existing sensor-bench evidence establishes combined operation only. BLE remains unverified until physical Android ↔ ESP32 testing is recorded.

## 2. Transport

- Bluetooth Low Energy GATT.
- Device advertises the local name `LightGuide-Node` and the LightGuide service UUID below.
- Android MUST identify a LightGuide node by service UUID, not by MAC address. BLE addresses may change.
- One phone ↔ one node is the v1 supported topology.
- No Wi-Fi dependency for the core Measure → Save → Recreate workflow.

### UUIDs

Use these UUIDs exactly for protocol v1:

| Item | UUID | Properties |
|---|---|---|
| LightGuide service | `7d6f0001-5a6b-4c47-9a41-4c6967687447` | primary service |
| Device info | `7d6f0002-5a6b-4c47-9a41-4c6967687447` | READ |
| Measurement | `7d6f0003-5a6b-4c47-9a41-4c6967687447` | NOTIFY |
| Event | `7d6f0004-5a6b-4c47-9a41-4c6967687447` | NOTIFY |
| Command | `7d6f0005-5a6b-4c47-9a41-4c6967687447` | WRITE |
| Status | `7d6f0006-5a6b-4c47-9a41-4c6967687447` | READ, NOTIFY |

## 3. Framing and encoding

To keep first integration inspectable, v1 application payloads are UTF-8 JSON. Each GATT value contains one complete JSON object. Firmware MUST keep payloads within the negotiated ATT payload; do not fragment JSON across notifications. If a future measurement representation cannot fit reliably, introduce a protocol extension rather than ad-hoc fragmentation.

Every payload that carries protocol data includes:

```json
{"v":1,"type":"...","seq":1,"uptime_ms":12345}
```

- `v`: integer protocol major version; v1 peers reject unsupported major versions.
- `type`: payload type.
- `seq`: unsigned monotonically increasing message sequence, wrapping is allowed.
- `uptime_ms`: ESP32 milliseconds since boot; not wall-clock time.

Unknown JSON fields MUST be ignored for forward-compatible v1 extensions. Missing required fields make that message invalid, not the whole connection.

## 4. Device info characteristic

READ returns:

```json
{"v":1,"type":"device_info","device_id":"lg-node-001","fw":"0.1.0","hw":"esp32s3-n16r8-eval","cap":["tof","imu","spectral","save_button"]}
```

`device_id` MUST be stable for that node and MUST NOT depend on a randomized BLE address. Do not embed personal data.

## 5. Measurement characteristic

Measurement notifications provide the latest coherent snapshot. Initial target rate is **5 Hz**; Android MUST tolerate slower or irregular delivery and MUST NOT treat the target rate as an accuracy guarantee.

Required v1 measurement:

```json
{"v":1,"type":"measurement","seq":42,"uptime_ms":12345,"distance_mm":812,"roll_deg":1.2,"pitch_deg":-3.4,"yaw_deg":87.6,"tof_valid":true,"imu_valid":true,"spectral_valid":true,"spectral":[12,18,25,31,40,52,61,70,65,58,49,37,28,21,16,11,8,5]}
```

Rules:
- `distance_mm`: integer millimetres derived from the node's defined ToF summary; it is not a ±3 cm claim.
- `roll_deg`, `pitch_deg`, `yaw_deg`: decimal degrees from the BNO085 rotation-vector path. Axis/mount convention MUST be fixed in firmware and documented before recreation accuracy testing.
- `tof_valid`, `imu_valid`, `spectral_valid`: explicit validity flags. Never substitute zero for unavailable data and call it valid.
- `spectral`: exactly 18 raw AS7343 channel readings in the driver order used by the verified bench firmware. Raw values are transported; interpretation/calibration remains experimental.

For v1, firmware SHOULD compute `distance_mm` from a robust valid-zone summary of the VL53L5CX rather than sending the entire 8×8 grid over every notification. Full depth maps can be added later if evidence shows they are needed.

## 6. Event characteristic

GPIO4 save-button press sends exactly one debounced event:

```json
{"v":1,"type":"event","seq":43,"uptime_ms":12500,"event":"save_pressed"}
```

The ESP32 does **not** store the setup. Android receives `save_pressed`, captures the latest valid measurement snapshot through the application's existing save workflow, and gives the user the app-side confirmation/error state.

Duplicate event handling: Android SHOULD de-duplicate an identical `(connection session, seq)` event. Firmware MUST preserve the verified button debounce behaviour and must not generate repeated events for one physical press.

## 7. Status characteristic

READ/NOTIFY example:

```json
{"v":1,"type":"status","seq":44,"uptime_ms":12600,"state":"ready","tof":true,"imu":true,"spectral":true,"error":null}
```

Allowed `state` values for v1: `booting`, `ready`, `degraded`, `error`.

A sensor failure MUST be visible as `degraded` or `error` plus its validity flag; firmware must not silently fabricate a measurement.

## 8. Command characteristic

Android WRITE payload:

```json
{"v":1,"type":"command","command":"request_status"}
```

Required v1 commands:
- `request_status` — firmware emits a status notification;
- `identify` — firmware may use the verified onboard RGB LED once that output has itself been physically verified. Until then it may return an unsupported-command status/error rather than pretending identification succeeded.

Do not add remote calibration, firmware update, cloud credentials, or arbitrary configuration to v1.

## 9. Connection lifecycle

Android:
1. scan for the LightGuide service UUID;
2. show discovered LightGuide node(s);
3. connect after user selection/approved app flow;
4. discover GATT service/characteristics;
5. read Device info and Status;
6. reject unsupported protocol major versions with a clear UI state;
7. subscribe to Measurement, Event and Status;
8. show `Connected` only after discovery and required subscriptions succeed;
9. on disconnect, mark readings stale immediately and retain saved setups locally;
10. allow reconnect without requiring app restart.

Firmware:
1. initialise sensors before advertising `ready`;
2. advertise BLE even in a diagnosable degraded state where practical;
3. restart advertising after disconnect;
4. never block BLE servicing indefinitely on a sensor read;
5. use watchdog/recovery behaviour for the BNO085 consistent with the verified UART bench work.

## 10. Security boundary for the prototype

Protocol v1 is an engineering prototype link, not a production security design. Do not transmit account credentials, cloud tokens, personal photos or other secrets through these characteristics. Before photographer/public deployment, pairing/bonding, authorization, privacy and threat-model requirements require a separate decision and validation.

## 11. Acceptance gates

Repository/software checks can establish that both implementations compile and conform structurally. They cannot establish the physical BLE link.

Physical integration is PASS only when evidence from the actual Android phone and actual ESP32-S3 shows, in one test session:
1. app discovers `LightGuide-Node` by service UUID;
2. connects and reports protocol v1/device info;
3. live distance/orientation/spectral values change plausibly when the bench is manipulated;
4. sensor invalid/degraded state is represented without fabricated valid data;
5. one GPIO4 press produces one app-side save event;
6. disconnect is detected and readings become stale;
7. reconnect succeeds without restarting the app or reflashing the ESP32;
8. a saved setup survives the connection cycle.

This still does not pass calibration, positioning accuracy, ±3 cm, spectral usefulness, power, enclosure or photographer-validation gates.

## 12. Ownership / change rule

- ESP32 firmware owns sensor drivers, sensor validity, sampling, BLE GATT server and button-event emission.
- Android owns discovery/connection UI, persistence, setup saving, recreation workflow and user-facing errors.
- This document owns the interface between them.
- Firmware and Android implementations MUST NOT independently change UUIDs, required field names, units or event semantics. Propose contract changes here first.
