// I2C scanner for ESP32-S3: SDA = GPIO 8, SCL = GPIO 9
// Also reads the OLED controller status byte to distinguish SSD1306 / SH1106.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;

void scan() {
  Serial.println("--- I2C scan (SDA=8, SCL=9) ---");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      found++;
      Serial.printf("Device found at 0x%02X\n", addr);
      if (addr == 0x3C || addr == 0x3D) {
        // A plain I2C read from an OLED controller returns its status register.
        // SH1106 low nibble reads 0x08 (or 0x00); SSD1306 reads 0x03/0x06/0x07.
        if (Wire.requestFrom(addr, (uint8_t)1) == 1) {
          uint8_t status = Wire.read();
          uint8_t low = status & 0x0F;
          Serial.printf("  OLED status byte: 0x%02X (low nibble 0x%X) -> %s\n", status, low,
                        (low == 0x08 || low == 0x00) ? "SH1106" : "SSD1306");
        } else {
          Serial.println("  OLED status read failed");
        }
      }
    } else if (err == 4) {
      Serial.printf("Unknown error at 0x%02X\n", addr);
    }
  }
  Serial.printf("Scan done, %d device(s) found\n", found);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
}

void loop() {
  scan();
  delay(3000);
}
