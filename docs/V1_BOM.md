# LightGuide v2 — V1 BOM Status

## Important

The commercial BOM is **not yet locked**. Phase 0 intentionally requires no custom LightGuide electronics.

## Phase 0 — buy/use now

Use existing/common equipment where possible:
- ARCore-compatible Android phone;
- laptop with Android Studio;
- printer and paper/card for a known-size visual marker;
- light stand/tripod;
- tape measure or laser measure;
- floor tape;
- angle reference if available.

## Future LightGuide node — provisional candidates

These are architecture candidates, not purchase instructions:

| Function | Current candidate | Status |
|---|---|---|
| MCU / wireless | ESP32-S3-class board/module | Provisional |
| Local depth/distance | VL53L5CX-class 8×8 multi-zone ToF | Provisional |
| Light/spectral sensing | TCS3448-class multispectral sensor | Preferred candidate, not locked |
| Orientation | High-quality IMU / orientation solution | Not selected |
| User status | RGB LED | Likely |
| Communication | BLE for core phone-node link | Architecture preference |
| Power | Rechargeable battery + USB-C | Requirement direction |
| Enclosure | Compact stand-mounted housing | Requirement direction |

## Specifically not treated as final commercial components

- HC-SR04 ultrasonic sensor;
- simple LDR/photoresistor;
- buzzer as a required output;
- tiny OLED as a required primary UI;
- a dedicated camera inside each LightGuide node.

## BOM lock gate

Only finalise/order the commercial node stack after Phase 0 answers whether phone AR is sufficient and what supporting sensors the positioning system actually needs.
