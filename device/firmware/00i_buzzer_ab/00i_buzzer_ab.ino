/*
 * M0i - Buzzer A/B: 3000 Hz vs 2000 Hz.
 *
 * Back-to-back comparison at a fixed pitch each, with a short gap between so
 * the two are easy to tell apart.  Loudness is much easier to judge by direct
 * comparison than in isolation, which is why this alternates rather than
 * sweeping.
 *
 * Buzzer on D9 and the - rail.  Current pitch is shown large on the OLED.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int BUZZER_PIN = D9;
static const int LEDC_CH    = 0;

static const int FREQ_A = 3000;
static const int FREQ_B = 2000;
static const unsigned long TONE_MS = 2000;
static const unsigned long GAP_MS  = 200;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
static bool haveDisplay = false;

static void show(int hz, const __FlashStringHelper *tag) {
  if (!haveDisplay) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(2, 4);
  display.print(F("BUZZER A/B TEST"));
  display.drawFastHLine(0, 15, 128, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(2, 20);
  display.print(tag);

  display.setTextSize(3);
  display.setCursor(6, 32);
  if (hz) { display.print(hz); display.setTextSize(1); display.print(F(" Hz")); }
  else    { display.print(F("--")); }
  display.display();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  ledcSetup(LEDC_CH, 1000, 8);
  ledcAttachPin(BUZZER_PIN, LEDC_CH);
  Serial.println();
  Serial.println(F("##### M0i - A/B: 3000 Hz vs 2000 Hz #####"));
}

static void play(int hz, const __FlashStringHelper *tag) {
  Serial.print(F("playing "));
  Serial.print(hz);
  Serial.println(F(" Hz"));
  show(hz, tag);
  ledcWriteTone(LEDC_CH, hz);
  delay(TONE_MS);
  ledcWriteTone(LEDC_CH, 0);
  show(0, tag);
  delay(GAP_MS);
}

void loop() {
  play(FREQ_A, F("A ->"));
  play(FREQ_B, F("B ->"));
}
