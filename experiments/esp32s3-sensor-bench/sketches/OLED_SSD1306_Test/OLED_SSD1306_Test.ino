// SSD1306 128x64 I2C OLED test for ESP32-S3: SDA = GPIO 8, SCL = GPIO 9, address 0x3C.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const uint8_t OLED_ADDR = 0x3C;
const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
unsigned long counter = 0;

void printStatus() {
  // Bit 6 of the controller status byte is 1 while the panel is off.
  if (Wire.requestFrom(OLED_ADDR, (uint8_t)1) == 1) {
    uint8_t status = Wire.read();
    Serial.printf("OLED status 0x%02X -> panel %s\n", status, (status & 0x40) ? "OFF" : "ON");
  } else {
    Serial.println("OLED status read failed");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 init FAILED");
    while (true) delay(1000);
  }
  Serial.println("SSD1306 init OK");

  // Border on the outermost pixels: if the left/right edge is missing or there is
  // noise on the right, the panel is actually an SH1106.
  display.clearDisplay();
  display.drawRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(10, 8);
  display.println("OLED OK");
  display.setTextSize(1);
  display.setCursor(10, 32);
  display.println("SSD1306 @ 0x3C");
  display.display();
  printStatus();
}

void loop() {
  counter++;
  display.fillRect(10, 46, 108, 10, SSD1306_BLACK);
  display.setCursor(10, 46);
  display.printf("Count: %lu", counter);
  display.display();
  Serial.printf("Count: %lu\n", counter);
  delay(1000);
}
