# LightGuide v2 — V1 BOM Status

## Important

The commercial BOM is **not yet locked**. Phase 0 intentionally requires no custom LightGuide electronics.

The hardware listed below is a **prototype evaluation kit**, not a final production BOM. Recording a purchase or recommendation does not prove that the component is necessary, accurate enough, power-efficient enough or suitable for manufacture.

## Hardware generations — do not confuse them

| Context | Controller | Sensors / role | Status |
|---|---|---|---|
| University project (`LightGuide-Edge`) | Arduino Nano 33 BLE Sense | HC-SR04, LDR and the university prototype peripherals | Historical academic prototype; separate repository |
| Earlier commercial bench implementation in this repo | Arduino Nano ESP32 (ESP32-S3) | HC-SR04, LDR, OLED, buzzer and switch | Working legacy implementation using Wi-Fi SoftAP + HTTP/WebSocket |
| New commercial R&D evaluation kit | ESP32-S3-WROOM-1-N8R8 DevKitC-1-compatible board | VL53L5CX, BNO086 and AS7343 evaluation candidates | Ordered/recommended for experiments; not the final node |

The Arduino Nano ESP32 and ESP32-S3-WROOM-1-N8R8 DevKitC-style board use the same ESP32-S3 family but have different form factors, pin maps and board targets. Existing wiring and firmware configuration must not be copied blindly.

## Phase 0 — buy/use now

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
| MCU / wireless | ESP32-S3-WROOM-1-N8R8 development board, DevKitC-1 compatible | **Order confirmed from screenshot.** 8 MB flash, 8 MB PSRAM, Wi-Fi and Bluetooth LE capability. | Exact clone/revision, silkscreen, pinout, USB implementation and correct Arduino/ESP-IDF board configuration after arrival |
| Local depth/distance | VL53L5CX 8×8 multi-zone ToF breakout | Recommended on 31 Aug; user reports the sensor kit was ordered | Exact seller listing/breakout, voltage regulation, connector orientation and delivered part |
| Orientation | SparkFun BNO086 Qwiic, SEN-22857 | Recommended on 31 Aug; user reports the sensor kit was ordered | Confirm receipt and exact SKU; validate magnetic interference and mounting/calibration behaviour |
| Light/spectral sensing | Adafruit AS7343 14-channel Light/Color breakout, ADA6477 | Recommended on 31 Aug; user reports the sensor kit was ordered | Confirm receipt and exact SKU; validate usefulness for photographic lights, repeatability and saturation |
| Sensor interconnect | Qwiic/STEMMA QT cables | Recommended with the sensor kit | Confirm connector types, cable lengths, address compatibility and reliable shared-I²C operation |

**Evidence rule:** only the ESP32-S3 board order is verified by an order screenshot currently available to the project. Until receipts or item photographs are checked, the three sensor rows must not be described as exact confirmed purchases.

## Why these parts were selected for evaluation

- **VL53L5CX:** tests whether a 64-zone depth field gives more robust local geometry than the legacy single-distance ultrasonic sensor.
- **BNO086:** tests fused orientation/tilt without depending on the development board having an onboard IMU.
- **AS7343:** tests whether multi-channel spectral/light measurements add useful repeatability beyond a basic LDR.
- **ESP32-S3 N8R8:** provides BLE, Wi-Fi, USB, exposed GPIO and sufficient memory for prototype sensor fusion and logging.

These are hypotheses to test. Their presence in the kit is not evidence that all three belong in the product.

## Future LightGuide node — provisional architecture

| Function | Current direction | Status |
|---|---|---|
| MCU / wireless | ESP32-S3 class; N8R8 DevKit used for evaluation | Provisional |
| Local depth/distance | VL53L5CX-class 8×8 multi-zone ToF | Provisional |
| Light/spectral sensing | Compare ordered AS7343 evaluation results with requirements and alternatives such as TCS3448-class devices | Provisional; exact production sensor not locked |
| Orientation | BNO086 evaluation board | Provisional; production orientation solution not locked |
| User status | RGB LED | Likely |
| Communication | BLE for core native phone-node link; legacy Wi-Fi retained only as reusable/fallback engineering | Architecture preference |
| Power | Rechargeable battery + USB-C | Requirement direction |
| Enclosure | Compact stand-mounted housing with repeatable alignment | Requirement direction |

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

## BOM lock gate

Only lock the production MCU, sensors, battery and enclosure after:
- Phase 0 establishes what phone positioning can and cannot measure reliably;
- each evaluation sensor demonstrates unique product value;
- accuracy, latency, interference, calibration, power and cost are measured;
- the complete one-light Measure → Save → Recreate journey succeeds.

Buying evaluation parts does not bypass these gates.
