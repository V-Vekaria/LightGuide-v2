#pragma once
// Pin map and build-wide constants.  Pins are frozen - see device/docs/00-BOARD.md §4.

#include <Arduino.h>

// ---- identity -------------------------------------------------------------
// protocol is the CONTRACT version, firmware is this build.  Never conflate
// them: bump `protocol` only when an existing field changes meaning, units or
// type, or disappears.  Adding a route or a field is additive and does not.
static const int   PROTOCOL_VERSION = 1;
static const char *FIRMWARE_VERSION = "0.1.0";
static const char *DEVICE_MODEL     = "LightGuide ESP32-S3";

// ---- pins -----------------------------------------------------------------
static const int PIN_TRIG   = D2;
static const int PIN_ECHO   = D3;     // via 220/330 divider, VCC on VBUS
static const int PIN_LDR    = A0;     // ADC1, 10k pulldown
static const int PIN_SWITCH = D7;     // INPUT_PULLUP
static const int PIN_BUZZER = D9;     // passive, LEDC
static const int OLED_ADDR  = 0x3C;

static const int BUZZER_LEDC_CH = 0;
static const int BUZZER_HZ      = 3000;   // measured louder than 2000

// ---- timing ---------------------------------------------------------------
static const uint32_t LIVE_INTERVAL_MS = 100;    // 10 Hz live feed
static const uint32_t PING_INTERVAL_MS = 100;
static const uint32_t LIGHT_PERIOD_MS  = 50;    // 20 Hz; light does not move faster

// Ambient = the darkest the sensor has seen in the last AMBIENT_BUCKETS
// minutes, held as one minimum per bucket and rotated every AMBIENT_BUCKET_MS.
static const uint32_t AMBIENT_BUCKET_MS = 60000;
static const int      AMBIENT_BUCKETS   = 10;

// A real echo is >=2 cm.  Anything shorter is our own trigger bleeding across
// or noise on the line, never a measurement.
static const uint32_t ECHO_MIN_US = 116;
// ~430 cm.  Beyond this the module is saying "nothing there", not measuring
// something far away - it holds ECHO high for ~130 ms to mean exactly that.
static const uint32_t ECHO_MAX_US = 25000;
// No falling edge by now and the ping is written off for this cycle.
static const uint32_t ECHO_TIMEOUT_US = 150000;

// Consecutive dead cycles before a sensor is called faulty.  A single missed
// ping is a dropout on a healthy sensor, not a fault - the contract is explicit
// that those are different things.
static const int FAULT_AFTER_MISSES = 20;

// Mirrors DEFAULT_DISTANCE_TOL_CM / DEFAULT_BRIGHTNESS_TOL in
// src/contract/types.ts, so a setup captured on the device gets the same
// tolerances the app would have given it.
static const float DEFAULT_DISTANCE_TOL_CM = 3.0f;   // v1 used 30 mm
static const float DEFAULT_BRIGHTNESS_TOL  = 0.08f;

// v1 used a two-second hold to capture a reference: long enough that it cannot
// happen by accident, since it is the destructive gesture.
static const uint32_t BUTTON_HOLD_MS = 2000;

/* HYSTERESIS. v1 entered "correct" within +-30 mm but only left it beyond
 * +-40 mm, and the 10 mm gap was the point: with a single threshold, a stand
 * parked on the boundary flips the verdict several times a second - the screen
 * flickers, the LED strobes and the buzzer chatters. The exit band is derived
 * from whatever tolerance the app sent, so the app still owns the policy.
 * 4/3 reproduces v1's 30:40 ratio. */
static const float HYSTERESIS_RATIO = 4.0f / 3.0f;

/* Declared here, not in the .ino, because the Arduino preprocessor hoists
 * generated function prototypes to the top of the sketch - above any type
 * defined in it. A type used in a signature has to come from a header. */
enum Judgement { J_NO_READ, J_CORRECT, J_ABOVE, J_BELOW };

// ---- storage --------------------------------------------------------------
static const char *SETUPS_PATH = "/setups.json";
static const size_t MAX_SETUPS = 64;
