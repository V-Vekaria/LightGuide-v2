// Scans the I2C bus (SDA = GPIO 8, SCL = GPIO 9) and identifies known devices:
// SSD1306/SH1106 OLED at 0x3C/0x3D and VL53Lxx range sensor at 0x29.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;

bool read8(uint8_t addr, uint8_t reg, uint8_t *out) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(addr, (uint8_t)1) != 1) return false;
  *out = Wire.read();
  return true;
}

// The VL53L1 family uses 16-bit register indexes.
bool read8at16(uint8_t addr, uint16_t reg, uint8_t *out) {
  Wire.beginTransmission(addr);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(addr, (uint8_t)1) != 1) return false;
  *out = Wire.read();
  return true;
}

void identifyOled(uint8_t addr) {
  if (Wire.requestFrom(addr, (uint8_t)1) != 1) {
    Serial.println("    status read failed");
    return;
  }
  uint8_t status = Wire.read();
  uint8_t low = status & 0x0F;
  Serial.printf("    OLED, status 0x%02X -> %s, panel %s\n", status,
                (low == 0x08 || low == 0x00) ? "SH1106" : "SSD1306",
                (status & 0x40) ? "OFF" : "ON");
}

void identifyVl53(uint8_t addr) {
  uint8_t id8 = 0, rev = 0, hi = 0, lo = 0;
  bool got8 = read8(addr, 0xC0, &id8) && read8(addr, 0xC2, &rev);
  bool got16 = read8at16(addr, 0x010F, &hi) && read8at16(addr, 0x0110, &lo);

  if (got8 && id8 == 0xEE) {
    Serial.printf("    VL53L0X (model ID 0x%02X, revision 0x%02X)\n", id8, rev);
  } else if (got16 && hi == 0xEA) {
    Serial.printf("    VL53L1X / L4CD family (model ID 0x%02X%02X)\n", hi, lo);
  } else {
    Serial.printf("    unknown VL53 variant (8-bit 0xC0=0x%02X, 16-bit 0x010F=0x%02X%02X)\n",
                  id8, hi, lo);
  }
}

void scan() {
  Serial.println("--- I2C scan (SDA=8, SCL=9) ---");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() != 0) continue;
    found++;
    Serial.printf("  0x%02X\n", addr);
    if (addr == 0x3C || addr == 0x3D) identifyOled(addr);
    if (addr == 0x29) identifyVl53(addr);
  }
  Serial.printf("Scan done, %d device(s)\n", found);
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
