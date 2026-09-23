// Finds which GPIO a push button is actually wired to. Every free header pin is
// held HIGH by its internal pull-up; a button to GND pulls its pin LOW while
// pressed, so any pin that changes level is reported. The OLED shows the result
// too, so it works without a serial monitor. The expected pin is GPIO4.
//
// Skipped: I2C (8, 9), BNO085 RST/UART (10, 17, 18), BOOT (0), USB (19, 20),
// UART0 (43, 44), flash/PSRAM (26-37) and the onboard RGB LED (38).
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int PINS[] = {1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 21,
                    39, 40, 41, 42, 45, 46, 47, 48};
const int NPINS = sizeof(PINS) / sizeof(PINS[0]);

Adafruit_SSD1306 display(128, 64, &Wire, -1, 400000, 400000);
int level[NPINS];
int lastPin = -1;
unsigned long presses = 0;

void show(const char *line2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("BUTTON FINDER");
  display.println("press the button");
  display.setTextSize(2);
  display.setCursor(0, 30);
  display.println(line2);
  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(8, 9);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  for (int i = 0; i < NPINS; i++) pinMode(PINS[i], INPUT_PULLUP);
  delay(20);
  Serial.print("Button finder. Pins already LOW at start (stuck or held):");
  int stuck = 0;
  for (int i = 0; i < NPINS; i++) {
    level[i] = digitalRead(PINS[i]);
    if (level[i] == LOW) { Serial.printf(" GPIO%d", PINS[i]); stuck++; }
  }
  Serial.println(stuck ? "" : " none");
  show("waiting...");
}

void loop() {
  for (int i = 0; i < NPINS; i++) {
    int now = digitalRead(PINS[i]);
    if (now == level[i]) continue;
    level[i] = now;
    Serial.printf("[%6lums] GPIO%d -> %s\n", millis(), PINS[i], now ? "HIGH (released)" : "LOW (pressed)");
    if (now == LOW) {
      presses++;
      lastPin = PINS[i];
      char buf[24];
      snprintf(buf, sizeof(buf), "GPIO%d #%lu", lastPin, presses);
      show(buf);
    }
  }
  delay(10);
}
