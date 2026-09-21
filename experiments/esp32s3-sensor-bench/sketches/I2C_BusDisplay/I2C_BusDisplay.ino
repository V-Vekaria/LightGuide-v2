// Drives the SSD1306 and uses it as a live I2C bus readout for every sensor
// planned for the node, so each can be plugged in while watching the panel.
// SDA = GPIO 8, SCL = GPIO 9.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const uint8_t OLED_ADDR = 0x3C;

struct Device {
  const char *name;
  uint8_t addr;
  uint8_t altAddr;  // 0 when the part has no alternate address
};

// Addresses for the evaluation sensors in docs/V1_BOM.md.
const Device DEVICES[] = {
  {"VL53L5CX", 0x29, 0x00},
  {"BNO085",   0x4A, 0x4B},  // only appears in I2C mode; normally on UART (P1 high)
  {"AS7343",   0x39, 0x00},
};
const int NDEV = sizeof(DEVICES) / sizeof(DEVICES[0]);

Adafruit_SSD1306 display(128, 64, &Wire, -1);

bool ackAt(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN, 100000);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 init FAILED");
    while (true) delay(1000);
  }
  Serial.println("SSD1306 init OK");
}

void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(2, 2);
  display.println("I2C BUS  SDA8 SCL9");
  display.drawFastHLine(0, 12, 128, SSD1306_WHITE);

  String line = "OLED:YES";
  int y = 17;
  for (int i = 0; i < NDEV; i++) {
    uint8_t found = 0;
    if (ackAt(DEVICES[i].addr)) found = DEVICES[i].addr;
    else if (DEVICES[i].altAddr && ackAt(DEVICES[i].altAddr)) found = DEVICES[i].altAddr;

    display.setCursor(2, y);
    if (found) display.printf("%-9s 0x%02X  OK", DEVICES[i].name, found);
    else       display.printf("%-9s  --   --", DEVICES[i].name);
    y += 11;

    line += "  ";
    line += DEVICES[i].name;
    line += ":";
    if (found) line += "0x" + String(found, HEX);
    else       line += "no";
  }

  // Anything on the bus that is not a device we expect.
  display.setCursor(2, y + 2);
  int extra = 0;
  for (uint8_t a = 1; a < 127; a++) {
    if (a == OLED_ADDR || a == 0x29 || a == 0x4A || a == 0x4B || a == 0x39) continue;
    if (ackAt(a)) extra++;
  }
  if (extra) display.printf("+%d unexpected", extra);
  else       display.println("no strays");

  display.display();
  Serial.println(line);
  delay(500);
}
