/*
 * M0h - Find the buzzer's resonant frequency.
 *
 * A passive piezo is a tuned mechanical resonator, not a speaker.  At its
 * resonant peak it is far louder than a few hundred Hz either side - easily a
 * 10-20 dB difference - so "quiet" usually means "driven at the wrong pitch"
 * rather than "underpowered".
 *
 * Sweeps 500 Hz -> 5000 Hz over 20 s and shows the current frequency on the
 * OLED and serial.  Note the number when it is loudest; that is the pitch the
 * firmware should use for every beep from now on.
 *
 * Buzzer on D9 and the - rail.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int BUZZER_PIN = D9;
static const int LEDC_CH    = 0;

static const int   F_LO  = 500;
static const int   F_HI  = 5000;
static const unsigned long SWEEP_MS = 20000;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
static bool haveDisplay = false;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  // ledcWriteTone() drives a 50% duty square wave, which is already the
  // loudest a single-ended piezo drive can be at a given voltage.
  ledcSetup(LEDC_CH, 1000, 8);
  ledcAttachPin(BUZZER_PIN, LEDC_CH);

  Serial.println();
  Serial.println(F("##### M0h - buzzer resonance sweep #####"));
  Serial.println(F("500 -> 5000 Hz over 20 s. Note the Hz when it is LOUDEST."));
}

void loop() {
  unsigned long el = millis() % SWEEP_MS;
  int f = F_LO + (int)((long)(F_HI - F_LO) * el / SWEEP_MS);
  ledcWriteTone(LEDC_CH, f);

  if (haveDisplay) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(2, 4);
    display.print(F("BUZZER SWEEP"));
    display.drawFastHLine(0, 15, 128, SSD1306_WHITE);

    display.setTextSize(3);
    display.setCursor(6, 26);
    display.print(f);
    display.setTextSize(1);
    display.print(F(" Hz"));

    int w = (int)(120L * el / SWEEP_MS);
    display.drawRect(4, 54, 120, 8, SSD1306_WHITE);
    display.fillRect(4, 54, w < 1 ? 1 : w, 8, SSD1306_WHITE);
    display.display();
  }

  static unsigned long last = 0;
  if (millis() - last > 500) { last = millis(); Serial.print(f); Serial.println(F(" Hz")); }
  delay(30);
}
