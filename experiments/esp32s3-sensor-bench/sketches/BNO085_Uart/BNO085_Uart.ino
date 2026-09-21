// Adafruit BNO085 over UART (SHTP), taking it off the shared I2C bus: the BNO08x
// violates I2C timing and is unreliable with the ESP32-S3 over I2C.
//
// Wiring (Adafruit BNO085 breakout, no solder needed):
//   P1  -> 3.3V         selects UART mode at reset (P0 stays low)
//   SDA -> GPIO18       sensor UART TX out -> ESP32 RX
//   SCL -> GPIO17       ESP32 TX -> sensor UART RX in
//   RST -> GPIO10       VIN -> 3.3V, GND -> GND
// The sensor's SDA/SCL must NOT be on the I2C bus rows in this mode.
#include <Adafruit_BNO08x.h>

const int RST_PIN = 10;
const int UART_RX_PIN = 18;  // from sensor SDA (TX)
const int UART_TX_PIN = 17;  // to sensor SCL (RX)

Adafruit_BNO08x bno(RST_PIN);
sh2_SensorValue_t value;
unsigned long rotations = 0;

void enableReports() {
  Serial.printf("enable ROTATION_VECTOR -> %s\n",
                bno.enableReport(SH2_ROTATION_VECTOR, 20000) ? "true" : "false");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== BNO085 over UART ===");

  // The driver calls Serial1.begin(3000000) itself without pins, so fix the
  // pins first; begin() without pins keeps the ones already set.
  Serial1.setPins(UART_RX_PIN, UART_TX_PIN);
  Serial1.begin(3000000, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);

  if (!bno.begin_UART(&Serial1)) {
    Serial.println("begin_UART FAILED - check P1->3.3V and the SDA/SCL -> GPIO18/17 wires");
    while (true) delay(1000);
  }
  Serial.println("begin_UART OK");
  for (int i = 0; i < bno.prodIds.numEntries; i++) {
    Serial.printf("  part %lu  sw %u.%u.%lu\n", bno.prodIds.entry[i].swPartNumber,
                  bno.prodIds.entry[i].swVersionMajor, bno.prodIds.entry[i].swVersionMinor,
                  bno.prodIds.entry[i].swBuildNumber);
  }
  enableReports();
}

void loop() {
  if (bno.wasReset()) {
    Serial.println("** sensor reset, re-enabling **");
    delay(50);
    enableReports();
  }

  if (bno.getSensorEvent(&value) && value.sensorId == SH2_ROTATION_VECTOR) {
    rotations++;
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint > 500) {
      // Quaternion -> Euler angles, in degrees.
      float r = value.un.rotationVector.real, i = value.un.rotationVector.i;
      float j = value.un.rotationVector.j, k = value.un.rotationVector.k;
      float roll = atan2(2.0 * (r * i + j * k), 1.0 - 2.0 * (i * i + j * j)) * 180.0 / PI;
      float pitch = asin(constrain(2.0 * (r * j - k * i), -1.0, 1.0)) * 180.0 / PI;
      float yaw = atan2(2.0 * (r * k + i * j), 1.0 - 2.0 * (j * j + k * k)) * 180.0 / PI;
      Serial.printf("roll %7.1f  pitch %7.1f  yaw %7.1f   [reports %lu]\n",
                    roll, pitch, yaw, rotations);
      lastPrint = millis();
    }
  }

  static unsigned long lastStat = 0;
  if (millis() - lastStat > 2000) {
    if (rotations == 0) Serial.println("[no reports yet]");
    lastStat = millis();
  }
}
