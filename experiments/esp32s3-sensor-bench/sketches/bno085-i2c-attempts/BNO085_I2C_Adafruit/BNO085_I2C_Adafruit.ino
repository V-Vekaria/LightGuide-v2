// Historical diagnostic: one of the attempts to run the BNO085 over I2C on the
// ESP32-S3, which proved unreliable (see ../../README.md). Needs the sensor in I2C
// mode (P1 low) and its SDA/SCL on the bus - not the current UART wiring.
// BNO085 via the Adafruit driver, as a cross-check against the SparkFun one
// which authenticates and enables cleanly but never delivers a report.
// SDA = GPIO 8, SCL = GPIO 9, RST on GPIO 10.
#include <Wire.h>
#include <Adafruit_BNO08x.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const int RST_PIN = 10;

Adafruit_BNO08x bno(RST_PIN);
sh2_SensorValue_t value;
unsigned long events = 0, rotations = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  Serial.println("=== BNO085 via Adafruit driver ===");
  if (!bno.begin_I2C(0x4A, &Wire)) {
    Serial.println("begin_I2C FAILED");
    while (true) delay(1000);
  }
  Serial.println("begin_I2C OK");

  for (int i = 0; i < bno.prodIds.numEntries; i++) {
    Serial.printf("  part %lu  sw %u.%u.%lu\n",
                  bno.prodIds.entry[i].swPartNumber,
                  bno.prodIds.entry[i].swVersionMajor,
                  bno.prodIds.entry[i].swVersionMinor,
                  bno.prodIds.entry[i].swBuildNumber);
  }

  enableAll();
}

// The sensor resets itself after configuration and comes back with reports off,
// so enabling has to be repeatable rather than a one-shot in setup().
// Several report types are requested to tell "this type is unsupported" apart
// from "no reports at all".
void enableAll() {
  Serial.printf("enable ROTATION_VECTOR      -> %s\n",
                bno.enableReport(SH2_ROTATION_VECTOR, 50000) ? "true" : "false");
  Serial.printf("enable GAME_ROTATION_VECTOR -> %s\n",
                bno.enableReport(SH2_GAME_ROTATION_VECTOR, 50000) ? "true" : "false");
  Serial.printf("enable ACCELEROMETER        -> %s\n",
                bno.enableReport(SH2_ACCELEROMETER, 50000) ? "true" : "false");
}

void loop() {
  if (bno.wasReset()) {
    Serial.println("** reset detected, re-enabling **");
    delay(50);
    enableAll();
  }

  if (bno.getSensorEvent(&value)) {
    events++;
    if (value.sensorId == SH2_ROTATION_VECTOR) rotations++;
    else Serial.printf("  (report id 0x%02X)\n", value.sensorId);
  }

  // If nothing has arrived for a while the config was probably lost; ask again.
  static unsigned long lastRetry = 0;
  static unsigned long eventsAtRetry = 0;
  if (millis() - lastRetry > 3000) {
    if (events == eventsAtRetry) {
      Serial.println("-- no reports in 3s, re-enabling --");
      enableAll();
    }
    eventsAtRetry = events;
    lastRetry = millis();
  }

  static unsigned long lastStat = 0;
  if (millis() - lastStat > 1000) {
    lastStat = millis();
    if (rotations) {
      // Quaternion -> Euler, in degrees.
      float r = value.un.rotationVector.real, i = value.un.rotationVector.i;
      float j = value.un.rotationVector.j, k = value.un.rotationVector.k;
      float yaw   = atan2(2.0 * (r * k + i * j), 1.0 - 2.0 * (j * j + k * k)) * 180.0 / PI;
      float pitch = asin(constrain(2.0 * (r * j - k * i), -1.0, 1.0)) * 180.0 / PI;
      float roll  = atan2(2.0 * (r * i + j * k), 1.0 - 2.0 * (i * i + j * j)) * 180.0 / PI;
      Serial.printf("roll %7.1f  pitch %7.1f  yaw %7.1f   [events %lu rot %lu]\n",
                    roll, pitch, yaw, events, rotations);
    } else {
      Serial.printf("[stats] events %lu  rotations %lu\n", events, rotations);
    }
  }
}
