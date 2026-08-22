/*
 * M0j - Switch test.  Buzzer explicitly silenced.
 *
 * D7 is INPUT_PULLUP: the pin idles HIGH and the switch pulls it to GND, so
 * PRESSED reads LOW and no external resistor is needed.  A bare switch with no
 * pull-up leaves the pin floating, which reads as random phantom presses.
 *
 * Debounce: a mechanical contact chatters for a few ms on both make and break.
 * Counting raw edges inflates one press into several, so an edge only counts
 * once the level has been stable for DEBOUNCE_MS.
 *
 * Distance stays live in the top band so the HC-SR04 and OLED keep running.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int SWITCH_PIN = D7;
static const int BUZZER_PIN = D9;
static const int TRIG_PIN   = D2;
static const int ECHO_PIN   = D3;

static const unsigned long DEBOUNCE_MS = 25;
static const unsigned long WATCH_US    = 200000UL;
static const unsigned long MIN_ECHO_US = 116UL;
static const unsigned long MAX_ECHO_US = 25000UL;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
static bool haveDisplay = false;

static int  stableLevel = HIGH, lastLevel = HIGH;
static unsigned long lastChange = 0;
static unsigned long presses = 0;

static unsigned long ping() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long t0 = micros();
  while (digitalRead(ECHO_PIN) == LOW) if (micros() - t0 > WATCH_US) return 0;
  unsigned long rise = micros();
  while (digitalRead(ECHO_PIN) == HIGH) if (micros() - rise > WATCH_US) break;
  return micros() - rise;
}

static float readCm() {
  unsigned long us = ping();
  if (us < MIN_ECHO_US || us > MAX_ECHO_US) return -1.0f;
  return us / 58.0f;
}

/* Must be called often - it samples the pin, so a slow loop misses presses. */
static void serviceSwitch() {
  int now = digitalRead(SWITCH_PIN);
  if (now != lastLevel) {
    lastLevel = now;
    lastChange = millis();                       // bounce restarts the clock
  } else if (millis() - lastChange > DEBOUNCE_MS && now != stableLevel) {
    stableLevel = now;
    if (stableLevel == LOW) {                    // count on press, not release
      presses++;
      Serial.print(F("press #"));
      Serial.println(presses);
    }
  }
}

/* The SSD1306 loses its whole configuration if power or ground blinks - and
 * begin() only runs once in setup(), so a wire nudged on the bench leaves the
 * panel dark forever even after it is reconnected.  Poll for it and
 * re-initialise when it reappears, so the display is effectively hot-pluggable
 * while wiring is still being moved around. */
static void serviceDisplay() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck < 1000) return;
  lastCheck = millis();

  Wire.beginTransmission(0x3C);
  bool present = (Wire.endTransmission() == 0);

  if (present && !haveDisplay) {
    haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    Serial.println(haveDisplay ? F("display came back - re-initialised")
                               : F("display ACKs but init failed"));
  } else if (!present && haveDisplay) {
    haveDisplay = false;
    Serial.println(F("display disappeared from the bus"));
  }
}

static void draw(float cm) {
  if (!haveDisplay) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(2, 4);
  display.print(F("SWITCH  "));
  if (cm < 0) display.print(F("-- cm"));
  else        { display.print(cm, 0); display.print(F(" cm")); }
  display.drawFastHLine(0, 15, 128, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(2, 20);
  display.print(F("PRESSES"));

  display.setTextSize(3);
  display.setCursor(6, 30);
  display.print(presses);

  // Live state, so a held button is obvious from across the desk.
  display.setTextSize(1);
  if (stableLevel == LOW) {
    display.fillRect(78, 34, 46, 16, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(84, 39);
    display.print(F("DOWN"));
    display.setTextColor(SSD1306_WHITE);
  } else {
    display.drawRect(78, 34, 46, 16, SSD1306_WHITE);
    display.setCursor(86, 39);
    display.print(F("up"));
  }
  display.display();
}

void setup() {
  Serial.begin(115200);

  // Silence the buzzer and leave it that way.
  ledcDetachPin(BUZZER_PIN);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(SWITCH_PIN, INPUT_PULLUP);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  Serial.println();
  Serial.println(F("##### M0j - switch test (buzzer off) #####"));
  Serial.print(F("idle level: "));
  Serial.println(digitalRead(SWITCH_PIN) == HIGH ? F("HIGH (correct)")
                                                 : F("LOW - held, or wired to 3V3 not GND"));
  stableLevel = lastLevel = digitalRead(SWITCH_PIN);
  lastChange = millis();
}

void loop() {
  // A ping can block ~130 ms with no target, which is long enough to miss a
  // quick press - so sample the switch either side of it and during the wait.
  serviceSwitch();
  float cm = readCm();
  serviceSwitch();
  serviceDisplay();
  draw(cm);
  for (int i = 0; i < 20; i++) { serviceSwitch(); delay(5); }
}
