/*
 * M0c - HC-SR04 + buzzer bring-up.  Arduino Nano ESP32.
 *
 * Wiring (docs/00-BOARD.md 4):
 *     HC-SR04 VCC  -> 3V3      <-- NOT 5V.  See the note below.
 *     HC-SR04 GND  -> GND
 *     HC-SR04 TRIG -> D2
 *     HC-SR04 ECHO -> D3       <-- direct, NO divider, BECAUSE VCC is 3V3
 *     Buzzer       -> D9 and GND
 *     Switch       -> D7 and GND   (INPUT_PULLUP; pressed reads LOW)
 *
 * WHY THE 3V3 SUPPLY MATTERS: the module drives ECHO to whatever it is powered
 * at.  At 5V that is a 5V signal into a non-5V-tolerant GPIO and needs a
 * divider; at 3V3 it is inherently safe and ECHO connects directly.  v1 made
 * the same call (LightGuide-Edge/docs/02-HARDWARE.md 3, Option B).
 *
 * The cost is range: a standard HC-SR04 underruns its spec at 3.3V and some
 * units do not fire at all.  The HC-SR04P variant is rated 3.0-5.5V.  This
 * sketch reports the timeout rate so a weak module is obvious rather than
 * showing up later as intermittent dropouts.
 *
 * If you ever move VCC back to 5V, ECHO needs a divider again.  The two
 * decisions are locked together.
 */

#include <Arduino.h>

static const int TRIG_PIN   = D2;
static const int ECHO_PIN   = D3;
static const int BUZZER_PIN = D9;
static const int SWITCH_PIN = D7;

static const int LEDC_CH  = 0;
static const int LEDC_RES = 8;

// 30 ms of flight ~= 5 m, comfortably past this build's ~200 cm working range.
static const unsigned long ECHO_TIMEOUT_US = 30000UL;
static const int SAMPLES = 12;

/* A real echo cannot be shorter than about 2 cm of flight (~116 us).  Anything
 * below this is not a measurement - it is our own 10 us trigger pulse bleeding
 * into the echo line, or electrical noise on a floating pin.  The first version
 * of this sketch only rejected pulseIn()==0, so those tiny pulses counted as
 * "valid 20/20" while reporting 0.0 cm.  They are not valid. */
static const unsigned long MIN_VALID_US = 100UL;

static long pingRaw(int trig, int echo) {
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);
  digitalWrite(trig, LOW);
  delayMicroseconds(3);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  return (long)pulseIn(echo, HIGH, ECHO_TIMEOUT_US);
}

/* Tries one pin orientation and reports what actually came back. */
static int tryOrientation(int trig, int echo, const char *label) {
  Serial.print(F("  "));
  Serial.print(label);
  Serial.print(F(": "));

  int real = 0, tiny = 0, timeout = 0;
  long lo = 999999, hi = 0, sum = 0, tinySum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    long us = pingRaw(trig, echo);
    if (us == 0)                   timeout++;
    else if (us < (long)MIN_VALID_US) { tiny++; tinySum += us; }
    else {
      real++; sum += us;
      if (us < lo) lo = us;
      if (us > hi) hi = us;
    }
    delay(60);
  }

  Serial.print(real);    Serial.print(F(" real, "));
  Serial.print(tiny);    Serial.print(F(" too-short, "));
  Serial.print(timeout); Serial.print(F(" timeout"));
  if (tiny) {
    // ~10 us means we are seeing our own trigger (wires bridged).
    // Tens of us means the module IS answering, just not with a real echo.
    Serial.print(F("   [too-short avg "));
    Serial.print(tinySum / tiny);
    Serial.print(F(" us]"));
  }
  if (real) {
    Serial.print(F("   -> "));
    Serial.print((sum / real) / 58.0f, 1);
    Serial.print(F(" cm avg, range "));
    Serial.print(lo / 58.0f, 1);
    Serial.print(F("-"));
    Serial.print(hi / 58.0f, 1);
    Serial.print(F(" cm"));
  }
  Serial.println();
  return real;
}

static void testDistance() {
  Serial.println();
  Serial.println(F("== HC-SR04 (VCC VBUS 5V, ECHO via 220/330 divider)"));

  int a = tryOrientation(TRIG_PIN, ECHO_PIN, "TRIG=D2 ECHO=D3");
  int b = tryOrientation(ECHO_PIN, TRIG_PIN, "TRIG=D3 ECHO=D2");

  if (a == 0 && b == 0) {
    Serial.println(F("  NO REAL ECHOES EITHER WAY."));
    Serial.println(F("  ALL TIMEOUT = the module never answered. Check, in order:"));
    Serial.println(F("   1. Is the DIVIDER on the ECHO wire? It must NOT be on TRIG -"));
    Serial.println(F("      a divider there drops our 3.3V trigger to ~2.0V and the"));
    Serial.println(F("      module will not fire at all."));
    Serial.println(F("   2. Is Vcc actually on VBUS (5V), and seated?"));
    Serial.println(F("   3. Is Gnd shared with the board?"));
    Serial.println(F("  TOO-SHORT pulses instead would mean a floating/bridged echo line."));
  } else if (b > a) {
    Serial.println(F("  >>> TRIG and ECHO are SWAPPED. Swap the two wires,"));
    Serial.println(F("      or set TRIG_PIN=D3 / ECHO_PIN=D2 in the sketch."));
  } else {
    Serial.println(F("  >>> Wiring correct as documented (TRIG=D2, ECHO=D3)."));
  }
}

/* Active and passive buzzers look identical and need opposite drive.
 * Driving both ways in turn identifies the part by ear. */
static void testBuzzer() {
  Serial.println(F("\n== BUZZER (D9)"));

  Serial.println(F("  [1/2] LEDC tone sweep 1000-2000 Hz (a PASSIVE buzzer sings here)"));
  ledcSetup(LEDC_CH, 1000, LEDC_RES);
  ledcAttachPin(BUZZER_PIN, LEDC_CH);
  for (int f = 1000; f <= 2000; f += 100) {
    ledcWriteTone(LEDC_CH, f);
    delay(120);
  }
  ledcWriteTone(LEDC_CH, 0);
  ledcDetachPin(BUZZER_PIN);

  delay(600);

  Serial.println(F("  [2/2] steady DC HIGH, 3 x 300 ms (an ACTIVE buzzer beeps here)"));
  pinMode(BUZZER_PIN, OUTPUT);
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(300);
    digitalWrite(BUZZER_PIN, LOW);
    delay(300);
  }

  Serial.println(F("  Which burst made noise?"));
  Serial.println(F("    [1] only -> PASSIVE (needs ledcWriteTone; ESP32 has no tone())"));
  Serial.println(F("    [2] only -> ACTIVE  (digitalWrite is enough)"));
  Serial.println(F("    both     -> ACTIVE  (also responds to the PWM carrier)"));
  Serial.println(F("    neither  -> not wired, wrong pin, or needs a transistor"));
}

/* INPUT_PULLUP means no external resistor: the pin idles HIGH and the switch
 * pulls it to GND.  A bare switch with no pull-up leaves the pin floating, which
 * reads as random presses - the classic beginner fault. */
static void testSwitch() {
  Serial.println();
  Serial.println(F("== SWITCH (D7, INPUT_PULLUP)"));
  Serial.print(F("  idle level: "));
  Serial.println(digitalRead(SWITCH_PIN) == HIGH ? F("HIGH (correct - not pressed)")
                                                 : F("LOW  - held down, or wired to 3V3 instead of GND"));

  Serial.println(F("  press it now - watching 5 s..."));
  int presses = 0, stable = digitalRead(SWITCH_PIN), last = stable;
  unsigned long changed = millis(), end = millis() + 5000;
  while (millis() < end) {
    int now = digitalRead(SWITCH_PIN);
    if (now != last) { last = now; changed = millis(); }      // bounce restarts the clock
    else if (millis() - changed > 25 && now != stable) {      // 25 ms settled = real edge
      stable = now;
      if (stable == LOW) presses++;
    }
  }
  Serial.print(F("  debounced presses: "));
  Serial.println(presses);
  if (!presses) Serial.println(F("  none seen - check D7 and GND, or it may be on another pin"));
}

void setup() {
  Serial.begin(115200);
  unsigned long deadline = millis() + 5000;
  while (!Serial && millis() < deadline) delay(10);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(SWITCH_PIN, INPUT_PULLUP);
  digitalWrite(TRIG_PIN, LOW);

  Serial.println(F("\n##### M0c - HC-SR04 + buzzer bring-up #####"));
  testDistance();
  testBuzzer();
  Serial.println(F("\n(distance repeats every 2 s; buzzer every 30 s)"));
}

void loop() {
  static unsigned long lastBuzz = 0;
  testDistance();
  if (millis() - lastBuzz > 30000) {
    lastBuzz = millis();
    testSwitch();
    testBuzzer();
  }
  delay(2000);
}
