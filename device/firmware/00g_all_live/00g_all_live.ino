/*
 * M0g - Distance + display + buzzer, all live together.
 *
 * The buzzer alternates between the two drive styles and NAMES THE CURRENT ONE
 * ON SCREEN, so the type can be identified by looking and listening at the
 * same time - no serial monitor, no guessing from timing:
 *
 *     screen says "tone sweep" and you hear it -> PASSIVE (needs ledcWriteTone)
 *     screen says "DC pulses"  and you hear it -> ACTIVE  (digitalWrite is enough)
 *
 * NOTE: nothing here SENSES the buzzer - it is an output, so the firmware
 * cannot tell whether one is attached.  These labels report what the pin is
 * being driven with, and print identically with no buzzer connected.
 *     both                               -> ACTIVE
 *     neither                            -> not wired / wrong pin / needs a transistor
 *
 * Distance keeps running throughout, so the HC-SR04 and OLED stay exercised.
 *
 * Wiring: TRIG D2, ECHO D3 (220/330 divider), VCC VBUS, GND -> - rail,
 *         OLED SDA A4 / SCL A5 / VCC 3V3, buzzer D9 -> GND.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int SCREEN_W = 128;
static const int SCREEN_H = 64;
static const int TRIG_PIN   = D2;
static const int ECHO_PIN   = D3;
static const int BUZZER_PIN = D9;
static const int LEDC_CH    = 0;

static const unsigned long WATCH_US    = 200000UL;
static const unsigned long MIN_ECHO_US = 116UL;
static const unsigned long MAX_ECHO_US = 25000UL;

Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);
static bool haveDisplay = false;

// Buzzer state machine: TONE 3s -> quiet 1s -> DC 3s -> quiet 1s -> repeat.
enum Phase { PH_TONE, PH_QUIET1, PH_DC, PH_QUIET2 };
static Phase phase = PH_TONE;
static unsigned long phaseStart = 0;
static bool ledcOn = false;

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

static float readCm() {
  unsigned long us = ping();
  if (us < MIN_ECHO_US || us > MAX_ECHO_US) return -1.0f;   // never 0
  return us / 58.0f;
}

static void buzzerOff() {
  if (ledcOn) { ledcWriteTone(LEDC_CH, 0); ledcDetachPin(BUZZER_PIN); ledcOn = false; }
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

static void serviceBuzzer() {
  unsigned long el = millis() - phaseStart;

  switch (phase) {
    case PH_TONE:
      if (!ledcOn) { ledcSetup(LEDC_CH, 1000, 8); ledcAttachPin(BUZZER_PIN, LEDC_CH); ledcOn = true; }
      // Sweep so a passive buzzer is unmistakable rather than a flat tone.
      ledcWriteTone(LEDC_CH, 800 + (el % 1000) * 2);
      if (el > 3000) { buzzerOff(); phase = PH_QUIET1; phaseStart = millis(); }
      break;

    case PH_QUIET1:
      if (el > 1000) { phase = PH_DC; phaseStart = millis(); }
      break;

    case PH_DC:
      // 300 ms on / 300 ms off - an active buzzer beeps, a passive one clicks at most.
      digitalWrite(BUZZER_PIN, ((el / 300) % 2) ? LOW : HIGH);
      if (el > 3000) { buzzerOff(); phase = PH_QUIET2; phaseStart = millis(); }
      break;

    case PH_QUIET2:
      if (el > 1000) { phase = PH_TONE; phaseStart = millis(); }
      break;
  }
}

static const __FlashStringHelper *phaseName() {
  switch (phase) {
    case PH_TONE: return F("tone sweep");
    case PH_DC:   return F("DC pulses");
    default:      return F("off");
  }
}

static void draw(float cm) {
  display.clearDisplay();

  // yellow band, rows 0-15: distance
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(2, 4);
  display.print(F("DIST "));
  if (cm < 0) display.print(F("-- no target"));
  else        { display.print(cm, 1); display.print(F(" cm")); }
  display.drawFastHLine(0, 15, SCREEN_W, SSD1306_WHITE);

  // blue area: which buzzer drive is running RIGHT NOW
  display.setCursor(2, 20);
  display.print(F("DRIVING D9 WITH:"));
  display.setTextSize(2);
  display.setCursor(2, 30);
  display.print(phaseName());
  display.setTextSize(1);

  if (phase == PH_TONE || phase == PH_DC) {
    display.fillRect(0, 46, SCREEN_W, 3, SSD1306_WHITE);   // "sounding" bar
  }

  if (cm >= 0) {
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
  buzzerOff();

  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  Serial.println();
  Serial.println(F("##### M0g - distance + display + buzzer #####"));
  Serial.println(F("Watch the screen: note which mode is showing when you hear sound."));
  phaseStart = millis();
}

void loop() {
  serviceBuzzer();
  float cm = readCm();
  serviceBuzzer();            // again - readCm() can block ~130 ms on no target
  if (haveDisplay) draw(cm);

  static unsigned long lastLog = 0;
  if (millis() - lastLog > 500) {
    lastLog = millis();
    Serial.print(F("driving D9: "));
    Serial.print(phaseName());
    Serial.print(F("   dist "));
    if (cm < 0) Serial.println(F("no target"));
    else        { Serial.print(cm, 1); Serial.println(F(" cm")); }
  }
}
