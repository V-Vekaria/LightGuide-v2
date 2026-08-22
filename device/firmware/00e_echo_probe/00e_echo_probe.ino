/*
 * M0e - Live distance readout.  Arduino Nano ESP32.
 *
 * WHY THIS SKETCH EXISTS: the earlier tests used pulseIn() with a 30 ms
 * timeout and reported "0 real, 12 timeout" - which read like a dead module.
 * It was not.  When an HC-SR04 receives no echo it holds ECHO HIGH for a long
 * "nothing there" period (tens of ms, and well over 60 ms on some clones)
 * before dropping it.  A 30 ms timeout expires mid-pulse, so pulseIn() returns
 * 0 - indistinguishable from silence.
 *
 * The raw probe showed ECHO rising a steady 468 us after every trigger, which
 * is the module working correctly and saying "no target in range".
 *
 * So: watch long enough to see the whole pulse, and treat an over-long pulse
 * as NO TARGET rather than as a failure.
 *
 * Wiring:  TRIG -> D2,  ECHO -> D3 (via 220/330 divider),  VCC -> VBUS,
 *          GND -> the - rail (which must be jumpered to a board GND).
 */

#include <Arduino.h>

static const int TRIG_PIN = D2;
static const int ECHO_PIN = D3;

// Long enough to see a full "no target" pulse on a slow clone.
static const unsigned long WATCH_US = 250000UL;

// A real echo is >=2 cm (116 us).  Beyond ~430 cm the module is telling us
// nothing is there, not measuring something very far away.
static const unsigned long MIN_ECHO_US = 116UL;
static const unsigned long MAX_ECHO_US = 25000UL;

/* Returns the echo pulse width in us, 0 if it never rose. */
static unsigned long ping() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long t0 = micros();
  while (digitalRead(ECHO_PIN) == LOW) {
    if (micros() - t0 > WATCH_US) return 0;          // never rose
  }
  unsigned long rise = micros();
  while (digitalRead(ECHO_PIN) == HIGH) {
    if (micros() - rise > WATCH_US) break;           // stuck high
  }
  return micros() - rise;
}

void setup() {
  Serial.begin(115200);
  unsigned long deadline = millis() + 5000;
  while (!Serial && millis() < deadline) delay(10);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  delay(100);

  Serial.println();
  Serial.println(F("##### M0e - live distance #####"));
  Serial.println(F("Hold a hand or a book 20-100 cm in front of the sensor."));
}

void loop() {
  unsigned long us = ping();

  Serial.print(F("echo "));
  Serial.print(us);
  Serial.print(F(" us   "));

  if (us == 0) {
    Serial.println(F("-- ECHO never rose (module not answering)"));
  } else if (us < MIN_ECHO_US) {
    Serial.println(F("-- too short to be real"));
  } else if (us > MAX_ECHO_US) {
    Serial.println(F("-- NO TARGET in range (module is working)"));
  } else {
    Serial.print(us / 58.0f, 1);
    Serial.println(F(" cm"));
  }
  delay(300);
}
