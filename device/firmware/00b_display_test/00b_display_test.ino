/*
 * M0b - Display bring-up.  Arduino Nano ESP32 + I2C OLED.
 *
 * Answers two questions: is the display wired correctly, and does it light up.
 *
 * Wiring this expects (docs/00-BOARD.md 4):
 *     VCC -> 3V3      <-- NOT 5V.  The module's I2C pull-ups sit on VCC, and
 *                         5V pull-ups would drive the ESP32-S3's non-5V-tolerant
 *                         GPIO.  See docs/00-BOARD.md 3.4.
 *     GND -> GND
 *     SDA -> A4
 *     SCL -> A5
 *
 * Assumes the SSD1306 128x64 carried over from v1.  If the panel is a 128x32,
 * the test pattern renders in the top half only - say so and change SCREEN_H.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int SCREEN_W = 128;
static const int SCREEN_H = 64;      // 32 if the pattern only fills the top half

Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);

static uint8_t foundAddr = 0;
static bool    displayOk = false;

/* Returns the first address that ACKs, preferring the two the SSD1306 uses. */
static uint8_t findDisplay() {
  const uint8_t candidates[] = {0x3C, 0x3D};
  for (uint8_t i = 0; i < 2; i++) {
    Wire.beginTransmission(candidates[i]);
    if (Wire.endTransmission() == 0) return candidates[i];
  }
  return 0;
}

static void scanBus() {
  Serial.println(F("\n-- I2C scan (SDA=A4, SCL=A5) --"));
  int n = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  0x%02X responded\n", addr);
      n++;
    }
  }
  if (!n) {
    Serial.println(F("  NOTHING on the bus."));
    Serial.println(F("  The Nano ESP32 has no on-board I2C devices, so an empty bus"));
    Serial.println(F("  means: not powered, SDA/SCL swapped, wrong pins, or bad ground."));
  }
}

static void drawTestPattern() {
  display.clearDisplay();

  // Border proves the panel's full extent is addressable, not just the middle.
  display.drawRect(0, 0, SCREEN_W, SCREEN_H, SSD1306_WHITE);

  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(6, 6);
  display.println(F("LightGuide ESP32"));
  display.setCursor(6, 18);
  display.print(F("OLED OK @ 0x"));
  display.println(foundAddr, HEX);

  // Inverted bar: confirms both pixel polarities, so a stuck-on panel is obvious.
  display.fillRect(6, 32, SCREEN_W - 12, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setCursor(10, 34);
  display.print(F("display test"));

  display.setTextColor(SSD1306_WHITE);
  display.setCursor(6, 50);
  display.print(SCREEN_W);
  display.print('x');
  display.print(SCREEN_H);

  display.display();
}

void setup() {
  Serial.begin(115200);
  unsigned long deadline = millis() + 5000;
  while (!Serial && millis() < deadline) delay(10);

  Serial.println(F("\n##### M0b - display bring-up #####"));

  Wire.begin();
  scanBus();

  foundAddr = findDisplay();
  if (!foundAddr) {
    Serial.println(F("\nFAIL: no SSD1306 at 0x3C or 0x3D. Check wiring above."));
    return;
  }
  Serial.printf("\nDisplay ACKs at 0x%02X\n", foundAddr);

  // ACK only proves something is on the bus; begin() proves it is a real
  // SSD1306 that accepts the init sequence.
  displayOk = display.begin(SSD1306_SWITCHCAPVCC, foundAddr);
  if (!displayOk) {
    Serial.println(F("FAIL: address ACKs but SSD1306 init was rejected."));
    Serial.println(F("Likely an SH1106 or another controller at the same address."));
    return;
  }

  Serial.println(F("PASS: initialised. Display is ON with the test pattern."));
  Serial.printf("Configured as %dx%d - if only the top half is lit, it is a 128x32;\n",
                SCREEN_W, SCREEN_H);
  Serial.println(F("set SCREEN_H to 32 and re-flash."));
  drawTestPattern();
}

void loop() {
  // Re-report on a cycle.  The first run happens in setup(), which is long over
  // by the time a serial monitor attaches - without this the port looks dead
  // even on a working board.  Learned the hard way, 19 Aug 2026.
  static unsigned long lastReport = 0;
  if (millis() - lastReport > 10000) {
    lastReport = millis();
    scanBus();
    if (displayOk) {
      Serial.print(F("display OK at 0x"));  Serial.print(foundAddr, HEX);
      Serial.print(F(", "));                Serial.print(SCREEN_W);
      Serial.print(F("x"));                 Serial.println(SCREEN_H);
    } else {
      Serial.println(F("display NOT initialised - see the report above"));
    }
  }

  if (!displayOk) { delay(500); return; }

  // Blink the border so a frozen panel is distinguishable from a live one.
  static bool on = true;
  display.drawRect(0, 0, SCREEN_W, SCREEN_H, on ? SSD1306_WHITE : SSD1306_BLACK);
  display.display();
  on = !on;
  delay(1000);
}
