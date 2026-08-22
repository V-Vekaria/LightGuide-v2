/*
 * M1 - Sensor check: distance + light, and the ADC/Wi-Fi coexistence test.
 *
 * Two jobs:
 *
 * 1. THE OWED TEST.  ESP32 ADC2 is claimed by the Wi-Fi radio, and this design
 *    runs SoftAP permanently, so the LDR must sit on ADC1.  M0 tried to check
 *    this but A0 was floating, so its 3994 -> 122 swing meant nothing.  With
 *    the LDR fitted there is a real signal, so the test is finally valid.
 *
 *    Rather than one before/after pair - which ambient light drift could fake -
 *    this toggles Wi-Fi off/on several times and compares. A genuine ADC2
 *    conflict shows as readings that collapse whenever the radio is up and
 *    recover when it is down, repeatably. Ambient drift does not do that.
 *
 * 2. Live distance + brightness on the OLED.
 *
 * Wiring: LDR 3V3 -> A0, 10k A0 -> GND.  HC-SR04 D2/D3 (divider), VCC VBUS.
 *         OLED A4/A5.
 */

#include <Wire.h>
#include <WiFi.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int LDR_PIN  = A0;
static const int TRIG_PIN = D2;
static const int ECHO_PIN = D3;

static const unsigned long WATCH_US    = 200000UL;
static const unsigned long MIN_ECHO_US = 116UL;
static const unsigned long MAX_ECHO_US = 25000UL;

static const char *AP_SSID = "LightGuide-Test";
static const char *AP_PASS = "probe12345";

Adafruit_SSD1306 display(128, 64, &Wire, -1);
static bool haveDisplay = false;

/* Running extremes, so the usable span can be read off after shading the LDR
 * and shining a light on it.  The span decides whether the contract's default
 * brightness tolerance (0.08 of full scale) is a meaningful amount of light or
 * lost in the noise - v1 shipped a 1k pulldown that used only 6% of the range
 * and badly weakened the channel. */
static int ldrMin = 4095, ldrMax = 0;

static int readLdrRaw() {
  long sum = 0;
  for (int i = 0; i < 16; i++) { sum += analogRead(LDR_PIN); delay(2); }
  return (int)(sum / 16);
}

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
  if (us < MIN_ECHO_US || us > MAX_ECHO_US) return -1.0f;   // null, never 0
  return us / 58.0f;
}

static void coexistenceTest() {
  Serial.println();
  Serial.println(F("== ADC / WIFI COEXISTENCE (3 cycles)"));
  Serial.println(F("   cycle   wifi-OFF   wifi-AP    delta"));

  int worst = 0;
  for (int c = 1; c <= 3; c++) {
    WiFi.mode(WIFI_OFF);
    delay(400);
    int off = readLdrRaw();

    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);
    delay(600);                       // let the radio settle
    int on = readLdrRaw();

    int d = on - off;
    if (abs(d) > abs(worst)) worst = d;

    Serial.print(F("     "));
    Serial.print(c);
    Serial.print(F("       "));
    Serial.print(off);
    Serial.print(F("       "));
    Serial.print(on);
    Serial.print(F("      "));
    Serial.println(d);
  }

  Serial.print(F("   worst delta: "));
  Serial.println(worst);
  if (abs(worst) < 150) {
    Serial.println(F("   PASS - ADC is unaffected by the radio. A0 is on ADC1."));
  } else {
    Serial.println(F("   FAIL - readings move with the radio. Suspect ADC2;"));
    Serial.println(F("   the LDR must move to an ADC1 pin before the brightness"));
    Serial.println(F("   channel can be trusted."));
  }
  Serial.println(F("   (AP left running, as it will be in the real firmware.)"));
}

static void draw(float cm, int raw, float norm) {
  if (!haveDisplay) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(2, 4);
  display.print(F("DIST "));
  if (cm < 0) display.print(F("-- none"));
  else        { display.print(cm, 1); display.print(F(" cm")); }
  display.drawFastHLine(0, 15, 128, SSD1306_WHITE);

  display.setCursor(2, 20);
  display.print(F("LIGHT"));
  display.setTextSize(2);
  display.setCursor(2, 30);
  display.print(norm, 3);
  display.setTextSize(1);
  display.setCursor(92, 36);
  display.print(raw);
  display.setCursor(2, 44);
  display.print(F("span "));
  display.print(ldrMin);
  display.print('-');
  display.print(ldrMax);

  int w = (int)(norm * 120.0f);
  if (w < 1) w = 1;
  if (w > 120) w = 120;
  display.drawRect(4, 52, 120, 9, SSD1306_WHITE);
  display.fillRect(4, 52, w, 9, SSD1306_WHITE);
  display.display();
}

void setup() {
  Serial.begin(115200);
  unsigned long deadline = millis() + 4000;
  while (!Serial && millis() < deadline) delay(10);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  analogReadResolution(12);

  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  Serial.println();
  Serial.println(F("##### M1 - sensor check #####"));
  Serial.print(F("LDR raw at boot: "));
  Serial.println(readLdrRaw());
  coexistenceTest();
  Serial.println();
  Serial.println(F("live: shade the LDR and move a hand in front of the sensor"));
}

void loop() {
  int raw = readLdrRaw();
  if (raw < ldrMin) ldrMin = raw;
  if (raw > ldrMax) ldrMax = raw;
  float norm = raw / 4095.0f;          // 0..1, as the device contract expects
  float cm = readCm();

  draw(cm, raw, norm);

  static unsigned long last = 0;
  if (millis() - last > 400) {
    last = millis();
    Serial.print(F("light raw "));
    Serial.print(raw);
    Serial.print(F(" ("));
    Serial.print(norm, 3);
    Serial.print(F(")   span "));
    Serial.print(ldrMin);
    Serial.print('-');
    Serial.print(ldrMax);
    Serial.print(F(" ("));
    Serial.print((ldrMax - ldrMin) * 100.0f / 4095.0f, 1);
    Serial.print(F("% of scale)   dist "));
    if (cm < 0) Serial.println(F("none"));
    else        { Serial.print(cm, 1); Serial.println(F(" cm")); }
  }
}
