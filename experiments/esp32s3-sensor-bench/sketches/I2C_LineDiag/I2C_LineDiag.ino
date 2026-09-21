// I2C line diagnostic for ESP32-S3 (wiring: SDA = GPIO 8, SCL = GPIO 9).
// Checks for external pull-ups, shorts, and a possible SDA/SCL swap. Read-only test.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;

int scanBus(int sda, int scl) {
  Wire.begin(sda, scl);
  Wire.setClock(100000);
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("    device at 0x%02X\n", addr);
      found++;
    }
  }
  Wire.end();
  return found;
}

void diagnose() {
  Serial.println("===== I2C line diagnostic =====");

  // 1. With weak internal pull-downs, a line reads HIGH only if the OLED module's pull-ups are present.
  pinMode(SDA_PIN, INPUT_PULLDOWN);
  pinMode(SCL_PIN, INPUT_PULLDOWN);
  delay(20);
  Serial.printf("Pull-down test: GPIO8(SDA)=%d GPIO9(SCL)=%d  (1 = external pull-up present)\n",
                digitalRead(SDA_PIN), digitalRead(SCL_PIN));

  // 2. With internal pull-ups, a line reads LOW only if something holds it to GND.
  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, INPUT_PULLUP);
  delay(20);
  Serial.printf("Pull-up test:   GPIO8(SDA)=%d GPIO9(SCL)=%d  (0 = line stuck low)\n",
                digitalRead(SDA_PIN), digitalRead(SCL_PIN));

  // 3. Short between SDA and SCL.
  pinMode(SDA_PIN, OUTPUT);
  digitalWrite(SDA_PIN, LOW);
  delay(20);
  int sclWhileSdaLow = digitalRead(SCL_PIN);
  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, OUTPUT);
  digitalWrite(SCL_PIN, LOW);
  delay(20);
  int sdaWhileSclLow = digitalRead(SDA_PIN);
  pinMode(SCL_PIN, INPUT_PULLUP);
  Serial.printf("Short test: SCL while SDA low=%d, SDA while SCL low=%d  (0 = lines shorted)\n",
                sclWhileSdaLow, sdaWhileSclLow);

  // 4. Scans: configured wiring, then swapped (diagnostic only).
  Serial.println("Scan SDA=8, SCL=9:");
  Serial.printf("  %d device(s)\n", scanBus(SDA_PIN, SCL_PIN));
  Serial.println("Scan SDA=9, SCL=8 (swap check only):");
  Serial.printf("  %d device(s)\n", scanBus(SCL_PIN, SDA_PIN));
}

void setup() {
  Serial.begin(115200);
  delay(1000);
}

void loop() {
  diagnose();
  delay(4000);
}
