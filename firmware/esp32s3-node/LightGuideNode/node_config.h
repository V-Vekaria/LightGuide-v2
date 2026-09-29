// LightGuide node configuration: pin map, protocol identifiers and timing.
//
// Pin map as verified on the ESP32-S3-WROOM-1 N16R8 evaluation board on
// 2026-09-21 (docs/validation/ESP32S3_SENSOR_BENCH_2026-09-21.md). Recheck
// the wiring before changing any of these. This is NOT the legacy Nano ESP32
// pin map in device/.
#pragma once

// ---- Identity (Device info characteristic)
#define LG_FW_VERSION "0.1.0"
#define LG_HW_ID "esp32s3-n16r8-eval"

// ---- Protocol v2 GATT (docs/engineering/DEVICE_PROTOCOL.md section 2; frozen)
#define LG_BLE_NAME "LightGuide-Node"
#define LG_UUID_SERVICE "7d6f0001-5a6b-4c47-9a41-4c6967687447"
#define LG_UUID_DEVICE_INFO "7d6f0002-5a6b-4c47-9a41-4c6967687447"
#define LG_UUID_MEASUREMENT "7d6f0003-5a6b-4c47-9a41-4c6967687447"
#define LG_UUID_EVENT "7d6f0004-5a6b-4c47-9a41-4c6967687447"
#define LG_UUID_COMMAND "7d6f0005-5a6b-4c47-9a41-4c6967687447"
#define LG_UUID_STATUS "7d6f0006-5a6b-4c47-9a41-4c6967687447"

// Largest ATT MTU Android accepts. The precompiled NimBLE default is 256,
// which is too small for a measurement payload.
#define LG_BLE_PREFERRED_MTU 517

// ---- Pins
#define LG_PIN_I2C_SDA 8
#define LG_PIN_I2C_SCL 9
#define LG_I2C_HZ 400000       // the VL53L5CX firmware upload is slow at 100 kHz
#define LG_PIN_BNO_RST 10
#define LG_PIN_BNO_UART_RX 18  // from BNO085 SDA (its TX)
#define LG_PIN_BNO_UART_TX 17  // to BNO085 SCL (its RX); BNO085 P1 tied high = UART mode
#define LG_PIN_SAVE_BUTTON 4   // to GND, internal pull-up; not a strapping pin
// GPIO38 is the onboard RGB LED's data line. Its output has not been verified,
// so the identify command is reported as unsupported and GPIO38 is untouched.

// ---- Timing
#define LG_MEASUREMENT_PERIOD_MS 200  // 5 Hz target (protocol section 5)
#define LG_COMMS_TICK_MS 10           // event / command latency
#define LG_BUTTON_SAMPLE_MS 5         // verified bench debounce: 5 ms x 4 samples
#define LG_SPECTRAL_PERIOD_MS 500     // verified bench cadence; each read blocks ~150 ms
#define LG_SENSOR_RETRY_MS 10000      // retry a ToF / AS7343 that failed to initialise
#define LG_EVENT_RETRY_MS 1000        // keep retrying a save event this long on NoMemory

// A reading older than its freshness limit is reported invalid; a sensor that
// has produced nothing for its health limit is reported unhealthy in Status.
#define LG_TOF_FRESH_MS 500        // ranging at 10 Hz
#define LG_TOF_HEALTH_MS 2000
#define LG_IMU_FRESH_MS 250        // rotation vector at 50 Hz
#define LG_IMU_HEALTH_MS 3000      // matches the verified 3 s re-enable watchdog
#define LG_SPECTRAL_FRESH_MS 2000
#define LG_SPECTRAL_HEALTH_MS 3000

// ---- Sensor settings (verified bench values)
#define LG_TOF_RESOLUTION 64
#define LG_TOF_RANGING_HZ 10
#define LG_IMU_REPORT_US 50000     // SH2_ROTATION_VECTOR at 50 Hz
#define LG_AS_ATIME 29
#define LG_AS_ASTEP 599
#define LG_AS_START_GAIN_IDX 9     // AS7343_GAIN_256X
