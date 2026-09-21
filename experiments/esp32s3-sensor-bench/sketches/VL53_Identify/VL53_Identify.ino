// Identifies which VL53 variant sits at 0x29 by reading each family's ID
// registers. Read-only: the sensor is never configured or started.
// SDA = GPIO 8, SCL = GPIO 9.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const uint8_t ADDR = 0x29;

bool read8(uint8_t reg, uint8_t *out) {
  Wire.beginTransmission(ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(ADDR, (uint8_t)1) != 1) return false;
  *out = Wire.read();
  return true;
}

bool read16(uint16_t reg, uint8_t *out) {
  Wire.beginTransmission(ADDR);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(ADDR, (uint8_t)1) != 1) return false;
  *out = Wire.read();
  return true;
}

void show8(const char *label, uint8_t reg) {
  uint8_t v;
  if (read8(reg, &v)) Serial.printf("  %-22s 0x%02X = 0x%02X\n", label, reg, v);
  else                Serial.printf("  %-22s 0x%02X = <no reply>\n", label, reg);
}

void show16(const char *label, uint16_t reg) {
  uint8_t v;
  if (read16(reg, &v)) Serial.printf("  %-22s 0x%04X = 0x%02X\n", label, reg, v);
  else                 Serial.printf("  %-22s 0x%04X = <no reply>\n", label, reg);
}

void identify() {
  Serial.println("=== VL53 identification at 0x29 ===");

  Serial.println("8-bit register space (VL53L0X):");
  show8("model id", 0xC0);        // L0X: 0xEE
  show8("module type", 0xC1);     // L0X: 0xAA
  show8("revision", 0xC2);        // L0X: 0x10

  Serial.println("16-bit register space (VL53L1X / L4CD):");
  show16("model id hi", 0x010F);  // L1X: 0xEA
  show16("model id lo", 0x0110);  // L1X: 0xCC

  Serial.println("16-bit register space (VL53L5CX / L8CX):");
  show16("device id", 0x0000);    // L5CX/L8CX: 0xF0
  show16("revision id", 0x0001);  // L5CX: 0x02, L8CX: 0x0C

  uint8_t a = 0, b = 0, c = 0, d = 0, e = 0;
  bool l0 = read8(0xC0, &a) && a == 0xEE;
  bool l1 = read16(0x010F, &b) && b == 0xEA;
  bool l5 = read16(0x0000, &c) && c == 0xF0 && read16(0x0001, &d) && (d == 0x02 || d == 0x0C);

  Serial.print("VERDICT: ");
  if (l0)      Serial.println("VL53L0X");
  else if (l1) { read16(0x0110, &e);
                 Serial.printf("VL53L1X / L4CD family (0xEA%02X)\n", e); }
  else if (l5) Serial.println(d == 0x0C ? "VL53L8CX" : "VL53L5CX");
  else         Serial.println("present at 0x29 but unrecognised - see dump above");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN, 100000);
}

void loop() {
  identify();
  delay(4000);
}
