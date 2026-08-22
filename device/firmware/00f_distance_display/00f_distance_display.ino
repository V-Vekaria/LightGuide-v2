/*
 * M0f - Live distance on the OLED.  Arduino Nano ESP32.
 *
 * Shows the HC-SR04 reading big enough to read across a room, so the sensor
 * can be exercised by hand without a serial monitor attached.
 *
 * Layout note: this panel is DUAL-COLOUR - rows 0-15 are physically yellow,
 * the rest blue (docs/00-BOARD.md 4).  The title is kept inside the yellow
 * band and the reading inside the blue, so nothing straddles the seam.
 *
 * Wiring:  TRIG D2, ECHO D3 (via 220/330 divider), VCC VBUS, GND -> - rail.
 *          OLED SDA A4, SCL A5, VCC 3V3.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int SCREEN_W = 128;
static const int SCREEN_H = 64;
static const int TRIG_PIN = D2;
static const int ECHO_PIN = D3;

// Must exceed the module's ~130 ms "no target" pulse or a working sensor
// looks dead.  See docs/00-BOARD.md 4c.
static const unsigned long WATCH_US   = 200000UL;
static const unsigned long MIN_ECHO_US = 116UL;     // ~2 cm
static const unsigned long MAX_ECHO_US = 25000UL;   // ~430 cm -> no target

Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);
static bool haveDisplay = false;

static unsigned long ping() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long t0 = micros();
  while (digitalRead(ECHO_PIN) == LOW) {
    if (micros() - t0 > WATCH_US) return 0;
  }
  unsigned long rise = micros();
  while (digitalRead(ECHO_PIN) == HIGH) {
    if (micros() - rise > WATCH_US) break;
  }
  return micros() - rise;
}

/* cm, or -1 for "no target" / "no answer" - never 0.  The device contract
 * says a missed read is null, because the app would believe a zero. */
static float readCm() {
  unsigned long us = ping();
  if (us < MIN_ECHO_US || us > MAX_ECHO_US) return -1.0f;
  return us / 58.0f;
}

static void draw(float cm) {
  display.clearDisplay();

  // --- yellow band, rows 0-15 ---
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(2, 4);
  display.print(F("LIGHTGUIDE  DISTANCE"));
  display.drawFastHLine(0, 15, SCREEN_W, SSD1306_WHITE);

  // --- blue area, rows 16-63 ---
  if (cm < 0) {
    display.setTextSize(2);
    display.setCursor(6, 30);
    display.print(F("NO TARGET"));
  } else {
    display.setTextSize(3);
    display.setCursor(6, 26);
    display.print(cm, 1);
    display.setTextSize(1);
    display.print(F(" cm"));

    // Bar: 0-200 cm across the full width, so movement is obvious at a glance.
    int w = (int)(cm / 200.0f * (SCREEN_W - 8));
    if (w > SCREEN_W - 8) w = SCREEN_W - 8;
    if (w < 1) w = 1;
    display.drawRect(4, 54, SCREEN_W - 8, 8, SSD1306_WHITE);
    display.fillRect(4, 54, w, 8, SSD1306_WHITE);
  }
  display.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (haveDisplay) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(2, 4);
    display.print(F("LIGHTGUIDE  DISTANCE"));
    display.setCursor(6, 30);
    display.print(F("starting..."));
    display.display();
  }
  delay(300);
}

void loop() {
  float cm = readCm();

  if (haveDisplay) draw(cm);

  if (cm < 0) Serial.println(F("no target"));
  else        { Serial.print(cm, 1); Serial.println(F(" cm")); }

  delay(120);
}
