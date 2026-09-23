# LightGuide Device Protocol v2

**Status:** integration contract for the first Android ↔ ESP32-S3 physical-node implementation.

This document is the boundary between the Android application and ESP32 firmware. Both sides MUST implement this contract. Protocol v2 supersedes the unimplemented physical v1 measurement contract because the verified AS7343 bench firmware uses auto-gain and gain-normalised channels; v1's 18 raw-channel payload would be ambiguous under auto-gain. The GATT UUIDs remain unchanged so discovery does not need a second service, while the payload major version is now `v:2`. Peers MUST reject unsupported major versions.

## 1. Scope and evidence boundary

Protocol v2 connects the Android app to the current evaluation node. It does **not** prove sensor accuracy, calibration, ±3 cm positioning accuracy, photographic usefulness, production security, power suitability, or final hardware selection.

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
- Android MUST identify a LightGuide node by service UUID, not by MAC address.
- One phone ↔ one node is the v2 supported topology.
- No Wi-Fi dependency for the core Measure → Save → Recreate workflow.

### UUIDs

Protocol v2 deliberately retains the established UUIDs:

| Item | UUID | Properties |
|---|---|---|
| LightGuide service | `7d6f0001-5a6b-4c47-9a41-4c6967687447` | primary service |
| Device info | `7d6f0002-5a6b-4c47-9a41-4c6967687447` | READ |
| Measurement | `7d6f0003-5a6b-4c47-9a41-4c6967687447` | NOTIFY |
| Event | `7d6f0004-5a6b-4c47-9a41-4c6967687447` | NOTIFY |
| Command | `7d6f0005-5a6b-4c47-9a41-4c6967687447` | WRITE |
| Status | `7d6f0006-5a6b-4c47-9a41-4c6967687447` | READ, NOTIFY |

## 3. Framing and encoding

Application payloads are UTF-8 JSON. Each GATT value contains one complete JSON object. Firmware MUST keep payloads within the negotiated ATT payload and MUST NOT fragment JSON ad hoc.

Every sequenced payload includes `v`, `type`, `seq`, and `uptime_ms`, for example:

```json
{"v":2,"type":"measurement","seq":1,"uptime_ms":12345}
```

- `v`: integer protocol major version. Protocol v2 requires `2`.
- `type`: payload type.
- `seq`: unsigned monotonically increasing message sequence; wrapping is allowed.
- `uptime_ms`: ESP32 milliseconds since boot, not wall-clock time.

Unknown JSON fields MUST be ignored for forward-compatible v2 extensions. Missing required fields make that message invalid, not the whole connection.

## 4. Device info characteristic

READ returns:

```json
{"v":2,"type":"device_info","device_id":"lg-node-001","fw":"0.1.0","hw":"esp32s3-n16r8-eval","cap":["tof","imu","spectral","save_button"]}
```

`device_id` MUST be stable for that node and MUST NOT depend on a randomized BLE address. Do not embed personal data.

## 5. Measurement characteristic

Measurement notifications provide the latest coherent snapshot. Initial target rate is **5 Hz**; Android MUST tolerate slower or irregular delivery and MUST NOT treat the target rate as an accuracy guarantee.

Required v2 measurement:

```json
{"v":2,"type":"measurement","seq":42,"uptime_ms":12345,"distance_mm":812,"roll_deg":1.2,"pitch_deg":-3.4,"yaw_deg":87.6,"tof_valid":true,"imu_valid":true,"spectral_valid":true,"spectral_gain":2048,"spectral":[0.446,0.871,1.404,1.405,1.514,0.528,1.937,1.556,1.489,1.797,1.122,2.777,3.445]}
```

Rules:
- `distance_mm`: integer millimetres derived from the node's defined ToF summary; it is not a ±3 cm claim.
- `roll_deg`, `pitch_deg`, `yaw_deg`: decimal degrees from the BNO085 rotation-vector path. Axis/mount convention MUST be fixed in firmware and documented before recreation accuracy testing.
- `tof_valid`, `imu_valid`, `spectral_valid`: explicit validity flags. Never substitute zero for unavailable data and call it valid.
- `spectral_gain`: positive AS7343 gain multiplier used for the represented acquisition. It is diagnostic acquisition metadata, not a calibration factor.
- `spectral`: exactly 13 finite gain-normalised values in this fixed order: `f1_405`, `f2_425`, `fz_450`, `f3_475`, `f4_515`, `f5_550`, `fy_555`, `fxl_600`, `f6_640`, `f7_690`, `f8_745`, `nir_855`, `clear`. Each value is the bench firmware's channel reading divided by the acquisition gain (`counts_per_gain`). These values are not calibrated irradiance, lux, CCT, CRI, or proof of spectral usefulness.
- A spectral sample is valid only after auto-gain has settled. Firmware MUST NOT mark the first unsettled reading after a gain change as valid.

This representation intentionally replaces v1's 18 raw values. The change is major-versioned because interpreting raw counts without gain is unsafe once auto-gain is enabled.

For v2, firmware SHOULD compute `distance_mm` from a robust valid-zone summary of the VL53L5CX rather than sending the entire 8×8 grid over every notification. Full depth maps can be added later if evidence shows they are needed.

## 6. Event characteristic

GPIO4 save-button press sends exactly one debounced event:

```json
{"v":2,"type":"event","seq":43,"uptime_ms":12500,"event":"save_pressed"}
```

The ESP32 does **not** store the setup. Android receives `save_pressed`, captures the latest valid measurement snapshot through the application's existing save workflow, and gives the user the app-side confirmation/error state.

Android SHOULD de-duplicate an identical `(connection session, seq)` event. Firmware MUST preserve the verified button debounce behaviour and must not generate repeated events for one physical press.

## 7. Status characteristic

READ/NOTIFY example:

```json
{"v":2,"type":"status","seq":44,"uptime_ms":12600,"state":"ready","tof":true,"imu":true,"spectral":true,"error":null}
```

Allowed `state` values: `booting`, `ready`, `degraded`, `error`.

A sensor failure MUST be visible as `degraded` or `error` plus its validity flag; firmware must not silently fabricate a measurement.

## 8. Command characteristic

Android WRITE payload:

```json
{"v":2,"type":"command","command":"request_status"}
```

Required v2 commands:
- `request_status` — firmware emits a status notification;
- `identify` — firmware may use the verified onboard RGB LED once that output has itself been physically verified. Until then it may return an unsupported-command status/error rather than pretending identification succeeded.

Do not add remote calibration, firmware update, cloud credentials, or arbitrary configuration to v2.

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

Protocol v2 is an engineering prototype link, not a production security design. Do not transmit account credentials, cloud tokens, personal photos or other secrets through these characteristics. Before photographer/public deployment, pairing/bonding, authorization, privacy and threat-model requirements require a separate decision and validation.

## 11. Acceptance gates

Repository/software checks can establish that both implementations compile and conform structurally. They cannot establish the physical BLE link.

Physical integration is PASS only when evidence from the actual Android phone and actual ESP32-S3 shows, in one test session:
1. app discovers `LightGuide-Node` by service UUID;
2. connects and reports protocol v2/device info;
3. live distance/orientation/spectral values change plausibly when the bench is manipulated;
4. sensor invalid/degraded state is represented without fabricated valid data;
5. one GPIO4 press produces one app-side save event;
6. disconnect is detected and readings become stale;
7. reconnect succeeds without restarting the app or reflashing the ESP32;
8. a saved setup survives the connection cycle.

This still does not pass calibration, positioning accuracy, ±3 cm, spectral usefulness, power, enclosure or photographer-validation gates.

## 12. Ownership / change rule

- ESP32 firmware owns sensor drivers, sensor validity, sampling, auto-gain, BLE GATT server and button-event emission.
- Android owns discovery/connection UI, persistence, setup saving, recreation workflow and user-facing errors.
- This document owns the interface between them.
- Firmware and Android implementations MUST NOT independently change UUIDs, required field names, units, channel order or event semantics. Propose contract changes here first.
