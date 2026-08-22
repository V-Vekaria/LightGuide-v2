/*
 * M0d - Voltmeter.  Arduino Nano ESP32.
 *
 * Answers "is that pin actually live, and at what voltage?" without a
 * multimeter.  Written to settle whether VBUS really carries USB 5V - v1 hit
 * exactly this trap on the Nano 33 BLE, where VUSB was not connected to USB
 * power until a solder bridge underneath the board was closed, so a sensor
 * wired to it simply never powered up.
 *
 * HOW TO USE - reuses the ECHO divider, no extra parts:
 *   1. Unplug the ORANGE (Echo) wire from the top of the divider.
 *   2. Jumper the pin you want to measure (e.g. VBUS) to that same point.
 *   3. Move the divider's tap wire from D3 to A0.
 *   4. Flash this, read the output, then put it all back.
 *
 *      MEASURE ME ──[ 220R ]──┬── A0
 *                             │
 *                         [ 330R ]
 *                             │
 *                            GND
 *
 * NEVER connect a 5V pin straight to A0 - the ESP32-S3 is not 5V tolerant.
 * The divider is what makes this safe, so leave it in place.
 */

#include <Arduino.h>

static const int SENSE_PIN = A0;

// The divider actually fitted.  Vin = Vtap * (R_TOP + R_BOTTOM) / R_BOTTOM.
static const float R_TOP    = 330.0f;   // swapped 20 Aug - see SATURATION note
static const float R_BOTTOM = 220.0f;
static const float SCALE    = (R_TOP + R_BOTTOM) / R_BOTTOM;   // 1.667

static const int SAMPLES = 32;

/* The ESP32-S3 ADC tops out around 3.1-3.2 V regardless of attenuation, so any
 * reading up here is a FLOOR, not a measurement - 3.15 V and 5 V are
 * indistinguishable once clipped.  A dead giveaway is zero variance between
 * samples: real analogue noise jitters by a few mV, a clipped rail does not.
 * The first run of this sketch used a 220/330 divider, which put 5 V at 3.15 V
 * -- right on the ceiling -- and produced a confident but meaningless answer. */
static const float ADC_CEILING_MV = 3100.0f;

void setup() {
  Serial.begin(115200);
  unsigned long deadline = millis() + 5000;
  while (!Serial && millis() < deadline) delay(10);

  analogReadResolution(12);
  Serial.println();
  Serial.println(F("##### M0d - voltmeter #####"));
  Serial.print(F("divider "));
  Serial.print(R_TOP, 0);
  Serial.print(F("R / "));
  Serial.print(R_BOTTOM, 0);
  Serial.print(F("R  -> scale x"));
  Serial.println(SCALE, 3);
  Serial.println(F("reading A0 every 2 s"));
}

void loop() {
  // analogReadMilliVolts() applies the chip's factory eFuse calibration, so it
  // is far closer to true volts than scaling a raw count would be.
  uint32_t sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogReadMilliVolts(SENSE_PIN);
    delay(2);
  }
  float tap_mV = (float)sum / SAMPLES;
  float in_V   = (tap_mV / 1000.0f) * SCALE;

  Serial.print(F("tap "));
  Serial.print(tap_mV, 0);
  Serial.print(F(" mV  ->  input "));
  Serial.print(in_V, 2);
  Serial.print(F(" V   "));

  if (tap_mV >= ADC_CEILING_MV) {
    Serial.println(F("[SATURATED - reading is a floor, not a value.]"));
    Serial.println(F("   The true voltage is at least this, possibly much higher."));
    Serial.println(F("   Increase the division ratio (bigger top resistor) and re-run."));
    delay(2000);
    return;
  }

  if (in_V < 0.3f)      Serial.println(F("[DEAD - nothing there]"));
  else if (in_V < 2.0f) Serial.println(F("[low - not a supply rail]"));
  else if (in_V < 3.8f) Serial.println(F("[looks like 3V3]"));
  else if (in_V < 5.6f) Serial.println(F("[looks like 5V - VBUS is live]"));
  else                  Serial.println(F("[higher than expected - check the divider]"));

  delay(2000);
}
