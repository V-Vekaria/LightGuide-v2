// Historical diagnostic: one of the attempts to run the BNO085 over I2C on the
// ESP32-S3, which proved unreliable (see ../../README.md). Needs the sensor in I2C
// mode (P1 low) and its SDA/SCL on the bus - not the current UART wiring.
// BNO085 raw SHTP probe: bypasses the driver to see whether the sensor is
// producing packets at all. Every BNO08x transfer starts with a 4-byte SHTP
// header - length LSB, length MSB, channel, sequence - so reading just that
// says whether there is anything to collect.
// SDA = GPIO 8, SCL = GPIO 9, RST on GPIO 10.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const int RST_PIN = 10;
const uint8_t ADDR = 0x4A;

void header(const char *when) {
  uint8_t n = Wire.requestFrom(ADDR, (uint8_t)4);
  if (n != 4) {
    Serial.printf("%-22s read failed (%u bytes)\n", when, n);
    return;
  }
  uint8_t b0 = Wire.read(), b1 = Wire.read(), ch = Wire.read(), seq = Wire.read();
  uint16_t len = ((uint16_t)b1 << 8 | b0) & 0x7FFF;  // bit 15 is the continuation flag
  Serial.printf("%-22s len %5u  channel %u  seq %3u   [%02X %02X %02X %02X]\n",
                when, len, ch, seq, b0, b1, ch, seq);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  Serial.println("=== BNO085 raw SHTP probe ===");

  Wire.beginTransmission(ADDR);
  Serial.printf("0x4A ack: %s\n", Wire.endTransmission() == 0 ? "yes" : "no");

  header("before reset:");

  // Hardware reset via GPIO10. If the pin is genuinely wired to RST the sensor
  // emits an unsolicited advertisement packet on channel 0 afterwards.
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  Serial.println("RST pulsed low->high on GPIO10");

  for (int i = 0; i < 10; i++) {
    delay(50);
    char label[24];
    snprintf(label, sizeof(label), "after reset +%3dms:", (i + 1) * 50);
    header(label);
  }
}

void loop() {
  header("idle poll:");
  delay(1000);
}
