# LightGuide v2 — V1 BOM Status

## Important

The commercial BOM is **not yet locked**. Phase 0 intentionally requires no custom LightGuide electronics.

The hardware listed below is a **prototype evaluation kit**, not a final production BOM. Recording a purchase or recommendation does not prove that the component is necessary, accurate enough, power-efficient enough or suitable for manufacture.

## Hardware generations — do not confuse them

| Context | Controller | Sensors / role | Status |
|---|---|---|---|
| University project (`LightGuide-Edge`) | Arduino Nano 33 BLE Sense | HC-SR04, LDR and the university prototype peripherals | Historical academic prototype; separate repository |
| Earlier commercial bench implementation in this repo | Arduino Nano ESP32 (ESP32-S3) | HC-SR04, LDR, OLED, buzzer and switch | Working legacy implementation using Wi-Fi SoftAP + HTTP/WebSocket |
| New commercial R&D evaluation kit | ESP32-S3-WROOM-1 DevKitC-1-compatible board (received part is N16R8) | VL53L5CX, BNO085 (received in place of BNO086) and AS7343 evaluation candidates | Received and bench-verified 2026-09-21; not the final node |

The Arduino Nano ESP32 and ESP32-S3-WROOM-1-N8R8 DevKitC-style board use the same ESP32-S3 family but have different form factors, pin maps and board targets. Existing wiring and firmware configuration must not be copied blindly.

## Phase 0 — use existing equipment

Use existing/common equipment where possible:
- ARCore-compatible Android phone;
- laptop with Android Studio;
- printer and paper/card for a known-size visual marker;
- light stand/tripod;
- tape measure or laser measure;
- floor tape;
- angle reference if available.

Phase 0 phone-positioning validation remains the engineering gate. The evaluation electronics do not replace that experiment.

## Commercial R&D evaluation kit — September 2026

| Function | Exact evaluation component | Evidence / status | What remains to verify |
|---|---|---|---|
| MCU / wireless | ESP32-S3-WROOM-1-N8R8 development board, DevKitC-1 compatible (as ordered) | **Order confirmed from screenshot. Received part is N16R8**, verified 2026-09-21 with `esptool`: ESP32-S3 (QFN56) rev v0.2, 16 MB flash, 8 MB embedded PSRAM, Wi-Fi and BT 5 LE. Silkscreen `ESP32-S3-DEV-KIT-NXRX`. Arduino target `esp32:esp32:esp32s3`; verified pin map in the [sensor bench](../experiments/esp32s3-sensor-bench/README.md). | USB power behaviour, onboard RGB LED |
| Local depth/distance | VL53L5CX 8×8 multi-zone ToF breakout | **Received and identified** (device ID `0xF0`, revision `0x02`); ranging at 8×8 verified on the bench | Seller/breakout SKU; distance accuracy against ground truth |
| Orientation | SparkFun BNO086 Qwiic, SEN-22857 (as recommended) | **Received part is an Adafruit BNO085 9-DoF breakout**, identified from the board and its SHTP product IDs. Unreliable over I²C with the ESP32-S3 (a known BNO08x issue); **verified working over UART** at 50 Hz | Magnetic interference and mounting/calibration behaviour |
| Light/spectral sensing | Adafruit AS7343 14-channel Light/Color breakout, ADA6477 | **Received and working:** enumerates at `0x39`, all 18 channels read | Breakout SKU photo; usefulness for photographic lights, repeatability and saturation |
| Sensor interconnect | Qwiic/STEMMA QT cables | Bench uses breadboard jumpers; shared I²C verified for the VL53L5CX, AS7343 and a bench OLED | Connector types and cable lengths for a mounted build; the BNO085 stays off the shared I²C bus |

**Evidence rule:** only the ESP32-S3 board order is verified by an order screenshot. The received parts were identified on the bench on 2026-09-21 from chip ID registers, board markings and a photo of the IMU board ([evidence](validation/ESP32S3_SENSOR_BENCH_2026-09-21.md)). That confirms what is on the bench; it does not confirm seller SKUs that were not photographed.

## Why these parts were selected for evaluation

- **VL53L5CX:** tests whether a 64-zone depth field gives more robust local geometry than the legacy single-distance ultrasonic sensor.
- **BNO08x (BNO085 received):** tests fused orientation/tilt without depending on the development board having an onboard IMU.
- **AS7343:** tests whether multi-channel spectral/light measurements add useful repeatability beyond a basic LDR.
- **ESP32-S3 N8R8:** provides BLE, Wi-Fi, USB, exposed GPIO and sufficient memory for prototype sensor fusion and logging.

These are hypotheses to test. Their presence in the kit is not evidence that all three belong in the product.

## Future LightGuide node — provisional architecture

| Function | Current direction | Status |
|---|---|---|
| MCU / wireless | ESP32-S3 class; N8R8 DevKit used for evaluation | Provisional |
| Local depth/distance | VL53L5CX-class 8×8 multi-zone ToF | Provisional |
| Light/spectral sensing | AS7343 ADA6477 evaluation; compare measured results with product requirements | Provisional; exact production sensor not locked |
| Orientation | BNO08x evaluation board (BNO085 on UART; I²C is unreliable with the ESP32-S3) | Provisional; production orientation solution not locked |
| User status | Use the board's programmable onboard RGB LED if verified; no separate LED purchase by default | Pin mapping, programmability and visibility to verify |
| Communication | BLE for core native phone-node link; legacy Wi-Fi retained only as reusable/fallback engineering | Architecture preference |
| Power | Rechargeable battery + USB-C | Requirement direction |
| Enclosure | Compact stand-mounted housing with repeatable alignment | Requirement direction |

## Prototype feedback-output decision

Use the onboard programmable RGB LED for prototype status/identification if the actual board test confirms it works. A power-only indicator is not sufficient; exact GPIO mapping depends on the received board (GPIO38 reads permanently low on the received board, consistent with the LED data line; not yet tested as an output). Do not assume a display, buzzer, battery-monitoring circuit or usable pairing-confirmation button is present. The phone provides detailed guidance. This is an evaluation decision, not a final enclosure/status-light design.

**Save button (bench prototype, added 2026-09-21 at the user's request):** a momentary push button on GPIO4 lets the user trigger "save this setting" on the device. The device does not store setups; a press is an event for the phone app, which does the storing. It works on the bench but is not yet sent to the phone because the BLE link does not exist. A bench OLED is used for readouts during development only and is still not a required product UI.

## Specifically not treated as final commercial components

- HC-SR04 ultrasonic sensor;
- simple LDR/photoresistor;
- buzzer as a required output;
- tiny OLED as a required primary UI;
- the development-board form factor itself;
- any exact evaluation sensor before measured validation;
- a dedicated camera inside each LightGuide node.

## Bring-up rule when the N8R8 board arrives

Before connecting sensors:

1. Photograph both sides of the board and record its printed labels.
2. Identify the exact USB ports, regulator and pinout.
3. Run a board probe confirming chip revision, 8 MB flash, 8 MB PSRAM, Wi-Fi and BLE.
4. Select and record the correct Arduino/ESP-IDF target.
5. Create a new verified pin map; do not reuse the Nano ESP32 wiring map.
6. Test each sensor individually before combining the I²C bus.
7. Record acceptance evidence under the validation documentation.

Steps 1–7 were carried out on 2026-09-20/21: see the [sensor bench evidence](validation/ESP32S3_SENSOR_BENCH_2026-09-21.md) and the [verified pin map](../experiments/esp32s3-sensor-bench/README.md). The Nano ESP32 wiring map was not reused.

## BOM lock gate

Only lock the production MCU, sensors, battery and enclosure after:
- Phase 0 establishes what phone positioning can and cannot measure reliably;
- each evaluation sensor demonstrates unique product value;
- accuracy, latency, interference, calibration, power and cost are measured;
- the complete one-light Measure → Save → Recreate journey succeeds.

Buying evaluation parts does not bypass these gates.
