// Historical diagnostic: one of the attempts to run the BNO085 over I2C on the
// ESP32-S3, which proved unreliable (see ../../README.md). Needs the sensor in I2C
// mode (P1 low) and its SDA/SCL on the bus - not the current UART wiring.
// Finds which GPIO the BNO085's INT wire is actually on. After a hardware reset
// the sensor pulls INT low to announce its startup packet, so every free GPIO is
// watched (with pull-ups) for one that drops low. Also confirms the reset works
// by checking the chip goes briefly deaf on I2C right afterwards.
// SDA = GPIO 8, SCL = GPIO 9, RST = GPIO 10.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const int RST_PIN = 10;

// DevKitC-1 header GPIOs minus I2C (8/9), RST (10), strapping/boot (0, 3, 45, 46),
// flash/PSRAM (26-37), USB (19/20) and UART0 (43/44).
const int PINS[] = {1, 2, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17, 18, 21,
                    38, 39, 40, 41, 42, 47, 48};
const int NPINS = sizeof(PINS) / sizeof(PINS[0]);

bool ack() {
  Wire.beginTransmission(0x4A);
  return Wire.endTransmission() == 0;
}

void run() {
  Serial.println("\n=== INT finder ===");
  for (int i = 0; i < NPINS; i++) pinMode(PINS[i], INPUT_PULLUP);
  delay(5);

  Serial.print("Already low before reset:");
  int pre = 0;
  for (int i = 0; i < NPINS; i++)
    if (!digitalRead(PINS[i])) { Serial.printf(" GPIO%d", PINS[i]); pre++; }
  Serial.println(pre ? "" : " none");

  Serial.printf("0x4A ack before reset: %s\n", ack() ? "yes" : "no");

  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  unsigned long t0 = millis();

  bool fell[NPINS] = {false};
  unsigned long fellAt[NPINS] = {0};
  bool deaf = false;
  while (millis() - t0 < 1500) {
    for (int i = 0; i < NPINS; i++) {
      if (!fell[i] && !digitalRead(PINS[i])) { fell[i] = true; fellAt[i] = millis() - t0; }
    }
    if (millis() - t0 < 40 && !ack()) deaf = true;
  }

  Serial.printf("Reset took effect (chip NACKed just after): %s\n",
                deaf ? "YES - RST wire OK" : "no - RST may not be connected");
  Serial.print("Went low after reset:");
  int n = 0;
  for (int i = 0; i < NPINS; i++)
    if (fell[i]) { Serial.printf(" GPIO%d(@%lums)", PINS[i], fellAt[i]); n++; }
  Serial.println(n ? "" : " none");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN, 100000);
  run();
}

void loop() {
  delay(5000);
  run();
}
