// Historical diagnostic: one of the attempts to run the BNO085 over I2C on the
// ESP32-S3, which proved unreliable (see ../../README.md). Needs the sensor in I2C
// mode (P1 low) and its SDA/SCL on the bus - not the current UART wiring.
// BNO085 over I2C with the INT line wired, as a workaround for the BNO08x's
// known clock-stretching timing violation on the ESP32-S3. With INT connected
// the driver only reads when the sensor says a packet is ready, instead of
// polling into the middle of its processing.
// Pair with an extra 2.2k-3.3k pull-up on SDA to sharpen the SDA rise time.
// SDA = GPIO 8, SCL = GPIO 9, RST = GPIO 10, INT = GPIO 11.
#include <Wire.h>
#include <SparkFun_BNO08x_Arduino_Library.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const int RST_PIN = 10;
const int INT_PIN = 11;

BNO08x imu;
unsigned long rotations = 0;

void enableReports() {
  Serial.printf("enableRotationVector -> %s\n",
                imu.enableRotationVector(50) ? "true" : "false");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  Serial.println("=== BNO085 I2C + INT test ===");
  // INT is active-low: it should idle high and pulse low when data is ready.
  pinMode(INT_PIN, INPUT_PULLUP);
  Serial.printf("INT idle level: %s\n", digitalRead(INT_PIN) ? "HIGH (ok)" : "LOW");

  // begin() waits up to 500ms for INT to go low, and on timeout resets the chip
  // and probes it immediately - inside the ~100ms after reset where it NACKs.
  // An idle sensor has nothing queued so INT stays high and that path always
  // fails. Reset it here first: a fresh boot queues the startup advertisement
  // and pulls INT low, which also proves the INT wire is connected.
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  unsigned long t0 = millis();
  while (digitalRead(INT_PIN) && millis() - t0 < 1000) delay(1);
  if (digitalRead(INT_PIN)) {
    Serial.println("INT never went low after reset - check the INT -> GPIO11 wire");
  } else {
    Serial.printf("INT went low %lums after reset (INT wire OK)\n", millis() - t0);
  }

  if (!imu.begin(0x4A, Wire, INT_PIN, RST_PIN)) {
    Serial.println("begin FAILED");
    while (true) delay(1000);
  }
  Serial.println("begin OK");
  delay(100);
  enableReports();
}

void loop() {
  if (imu.wasReset()) {
    Serial.println("** sensor reset, re-enabling **");
    enableReports();
  }

  if (imu.getSensorEvent() &&
      imu.getSensorEventID() == SENSOR_REPORTID_ROTATION_VECTOR) {
    rotations++;
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint > 500) {
      Serial.printf("roll %7.1f  pitch %7.1f  yaw %7.1f   [reports %lu]\n",
                    imu.getRoll() * 180.0 / PI, imu.getPitch() * 180.0 / PI,
                    imu.getYaw() * 180.0 / PI, rotations);
      lastPrint = millis();
    }
  }

  static unsigned long lastStat = 0;
  if (millis() - lastStat > 2000) {
    if (rotations == 0) Serial.println("[no reports yet]");
    lastStat = millis();
  }
}
