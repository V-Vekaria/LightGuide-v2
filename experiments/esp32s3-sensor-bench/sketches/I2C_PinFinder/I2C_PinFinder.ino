// Finds which ESP32-S3 header pins the OLED's SDA/SCL wires are actually on.
// Diagnostic only: tries every usable GPIO pair as an I2C bus.
#include <Wire.h>

// DevKitC-1 header GPIOs, excluding flash/PSRAM (26-37), USB (19/20) and UART0 (43/44).
const int PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
                    21, 38, 39, 40, 41, 42, 45, 46, 47, 48};
const int NPINS = sizeof(PINS) / sizeof(PINS[0]);

void pullupScan() {
  // A line reads HIGH against the weak internal pull-down only if an external pull-up drives it.
  Serial.print("Pins with an external pull-up:");
  int count = 0;
  for (int i = 0; i < NPINS; i++) {
    pinMode(PINS[i], INPUT_PULLDOWN);
  }
  delay(50);
  for (int i = 0; i < NPINS; i++) {
    if (digitalRead(PINS[i]) == HIGH) {
      Serial.printf(" GPIO%d", PINS[i]);
      count++;
    }
  }
  Serial.println(count ? "" : " none");
  for (int i = 0; i < NPINS; i++) {
    pinMode(PINS[i], INPUT);
  }
}

bool probe(int sda, int scl, uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

void pairScan() {
  Serial.println("Trying every SDA/SCL pair at 0x29 (VL53), 0x3C and 0x3D (OLED)...");
  int hits = 0;
  for (int i = 0; i < NPINS; i++) {
    for (int j = 0; j < NPINS; j++) {
      if (i == j) continue;
      int sda = PINS[i], scl = PINS[j];
      if (!Wire.begin(sda, scl, 100000)) continue;
      Wire.setTimeOut(20);
      for (uint8_t addr : {(uint8_t)0x29, (uint8_t)0x3C, (uint8_t)0x3D}) {
        if (probe(sda, scl, addr)) {
          Serial.printf("FOUND 0x%02X with SDA=GPIO%d, SCL=GPIO%d\n", addr, sda, scl);
          hits++;
        }
      }
      Wire.end();
    }
  }
  Serial.printf("Pair scan done, %d hit(s)\n", hits);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
}

void loop() {
  Serial.println("===== PIN FINDER START =====");
  pullupScan();
  pairScan();
  Serial.println("===== PIN FINDER END =====");
  delay(3000);
}
