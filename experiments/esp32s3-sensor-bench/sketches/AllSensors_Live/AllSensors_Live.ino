// All four evaluation devices live, with a summary on the OLED.
//   I2C (SDA = GPIO 8, SCL = GPIO 9, 400kHz):
//     0x3C SSD1306 OLED   0x29 VL53L5CX 8x8 ToF   0x39 AS7343 spectral
//   UART (Adafruit BNO085, P1 tied to 3.3V):
//     sensor SDA/TX -> GPIO 18, sensor SCL/RX <- GPIO 17, RST <- GPIO 10
//   Save button: GPIO 4 to GND (internal pull-up, so pressed reads LOW)
//
// Each sensor initialises independently: one failing does not stop the others,
// so a partial bring-up still shows which parts are good.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SparkFun_VL53L5CX_Library.h>
#include <Adafruit_AS7343.h>
#include <Adafruit_BNO08x.h>

// Bisection switches: set to 0 to leave a device out of this build.
#ifndef USE_TOF
#define USE_TOF 1
#endif
#ifndef USE_SPECTRAL
#define USE_SPECTRAL 1
#endif

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const int BNO_RST_PIN = 10;
const int BNO_UART_RX = 18;  // from sensor SDA (its TX)
const int BNO_UART_TX = 17;  // to sensor SCL (its RX)
const uint8_t OLED_ADDR = 0x3C;
const int SAVE_BTN_PIN = 4;  // not a strapping pin, so a held button can't block boot

// The save button is sampled by its own FreeRTOS task every 5ms, because the main
// loop can block for a few hundred ms (spectral integration, ToF reads) and would
// miss a quick tap. A level only counts once it has been identical for 4 samples
// (20ms), and only a settled HIGH -> LOW change is a press. An edge-interrupt
// version double-counted: contact chatter on release could be read at the wrong
// instant and look like a fresh press.
const int BTN_SAMPLE_MS = 5;
const int BTN_STABLE_SAMPLES = 4;
volatile unsigned long btnPresses = 0;
volatile unsigned long btnLastPressMs = 0;

void saveButtonTask(void *) {
  int stable = HIGH, last = HIGH, same = 0;
  for (;;) {
    int level = digitalRead(SAVE_BTN_PIN);
    if (level == last) {
      if (same < BTN_STABLE_SAMPLES) same++;
    } else {
      last = level;
      same = 0;
    }
    if (same == BTN_STABLE_SAMPLES && level != stable) {
      stable = level;
      if (stable == LOW) {
        btnLastPressMs = millis();
        btnPresses++;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(BTN_SAMPLE_MS));
  }
}

Adafruit_SSD1306 display(128, 64, &Wire, -1);
SparkFun_VL53L5CX tof;
VL53L5CX_ResultsData tofData;
Adafruit_AS7343 spectral;
Adafruit_BNO08x imu(BNO_RST_PIN);
sh2_SensorValue_t imuValue;

bool tofOk = false, spectralOk = false, imuOk = false;

// Latest readings, held between updates since the sensors run at different rates.
int tofCentre = 0, tofNearest = 0, tofValid = 0;
float roll = 0, pitch = 0, yaw = 0;
uint16_t chan[18];
bool haveColour = false;
unsigned long imuReports = 0;

void banner(const char *line) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(2, 2);
  display.println(line);
  display.display();
  Serial.println(line);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(SAVE_BTN_PIN, INPUT_PULLUP);
  xTaskCreate(saveButtonTask, "saveButton", 2048, nullptr, 2, nullptr);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);  // the VL53L5CX firmware upload is slow at 100kHz

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 init FAILED");
    while (true) delay(1000);
  }
  Serial.println("SSD1306 init OK");

  banner("VL53L5CX: loading\nfirmware...");
  tofOk = USE_TOF && tof.begin();
  if (tofOk) {
    tof.setResolution(64);
    tof.setRangingFrequency(10);
    tof.startRanging();
  }
  Serial.printf("VL53L5CX init %s\n", tofOk ? "OK" : "FAILED");

  banner("AS7343: starting");
  spectralOk = USE_SPECTRAL && spectral.begin();
  if (spectralOk) {
    spectral.setATIME(29);
    spectral.setASTEP(599);
    spectral.setGain(AS7343_GAIN_256X);
  }
  Serial.printf("AS7343 init %s\n", spectralOk ? "OK" : "FAILED");

  // The BNO085 runs over UART, not I2C: the BNO08x violates I2C timing and was
  // unreliable with the ESP32-S3 on the shared bus. The driver opens Serial1 at
  // 3 Mbaud without pins, so set the pins first.
  banner("BNO085: starting");
  Serial1.setPins(BNO_UART_RX, BNO_UART_TX);
  Serial1.begin(3000000, SERIAL_8N1, BNO_UART_RX, BNO_UART_TX);
  imuOk = imu.begin_UART(&Serial1) && imu.enableReport(SH2_ROTATION_VECTOR, 50000);
  Serial.printf("BNO085 init %s\n", imuOk ? "OK" : "FAILED");
}

void readTof() {
  if (!tofOk || !tof.isDataReady()) return;
  if (!tof.getRangingData(&tofData)) return;
  int nearest = 9999, valid = 0;
  for (int i = 0; i < 64; i++) {
    uint8_t st = tofData.target_status[i];
    if (st != 5 && st != 9) continue;  // 5 and 9 are the valid statuses
    valid++;
    int mm = tofData.distance_mm[i];
    if (mm < nearest) nearest = mm;
  }
  tofNearest = (nearest == 9999) ? 0 : nearest;
  tofValid = valid;

  // Average whichever of the four central zones are valid: any single zone can
  // drop out, which would otherwise read as 0mm.
  const int centreZones[] = {27, 28, 35, 36};
  long sum = 0;
  int n = 0;
  for (int z : centreZones) {
    uint8_t st = tofData.target_status[z];
    if (st == 5 || st == 9) { sum += tofData.distance_mm[z]; n++; }
  }
  tofCentre = n ? (int)(sum / n) : 0;
}

void readImu() {
  if (!imuOk) return;
  // The BNO085 resets itself on error and comes back with all reports off.
  if (imu.wasReset()) {
    // Re-enabling instantly is lost while the chip is still booting.
    Serial.println("BNO085 reset - re-enabling rotation vector");
    delay(50);
    imu.enableReport(SH2_ROTATION_VECTOR, 50000);
  }

  // Safety net: if reports stop for 3s, the config was lost somewhere; ask again.
  static unsigned long lastCheck = 0, reportsAtCheck = 0;
  if (millis() - lastCheck > 3000) {
    if (imuReports == reportsAtCheck) {
      Serial.println("BNO085 silent for 3s - re-enabling rotation vector");
      imu.enableReport(SH2_ROTATION_VECTOR, 50000);
    }
    reportsAtCheck = imuReports;
    lastCheck = millis();
  }

  if (!imu.getSensorEvent(&imuValue)) return;
  if (imuValue.sensorId != SH2_ROTATION_VECTOR) return;
  imuReports++;
  // Quaternion -> Euler angles, in degrees.
  float r = imuValue.un.rotationVector.real, i = imuValue.un.rotationVector.i;
  float j = imuValue.un.rotationVector.j, k = imuValue.un.rotationVector.k;
  roll = atan2(2.0 * (r * i + j * k), 1.0 - 2.0 * (i * i + j * j)) * 180.0 / PI;
  pitch = asin(constrain(2.0 * (r * j - k * i), -1.0, 1.0)) * 180.0 / PI;
  yaw = atan2(2.0 * (r * k + i * j), 1.0 - 2.0 * (j * j + k * k)) * 180.0 / PI;
}

void readSpectral() {
  if (!spectralOk) return;
  haveColour = spectral.readAllChannels(chan);
}

unsigned long lastSlow, lastDraw;
unsigned long savesHandled = 0, savedAt = 0;
bool showSaved = false;

// For now a save is only reported locally. Once the phone link exists, this is
// where the "save" event gets sent to the app, which does the actual storing.
void handleSaveButton() {
  unsigned long presses = btnPresses;
  if (presses == savesHandled) return;
  savesHandled = presses;
  savedAt = millis();
  showSaved = true;
  Serial.printf("EVENT save #%lu t=%lums | ToF %dmm ctr %dmm | IMU r%.1f p%.1f y%.1f\n",
                savesHandled, btnLastPressMs, tofNearest, tofCentre, roll, pitch, yaw);
}

void loop() {
  handleSaveButton();
  readTof();
  readImu();

  // The spectral sensor integrates for ~180ms, so poll it far less often.
  if (millis() - lastSlow > 1000) {
    readSpectral();
    lastSlow = millis();
  }

  if (millis() - lastDraw < 200) return;
  lastDraw = millis();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  // The title bar flips to an inverted "SAVED" banner for 1.5s after a press.
  if (showSaved && millis() - savedAt > 1500) showSaved = false;
  if (showSaved) {
    display.fillRect(0, 0, 128, 11, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(2, 2);
    display.printf("  SAVED  #%lu", savesHandled);
    display.setTextColor(SSD1306_WHITE);
  } else {
    display.setCursor(2, 0);
    display.println("LightGuide sensors");
    display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
  }

  display.setCursor(2, 15);
  if (tofOk) display.printf("ToF %4dmm  %2d/64", tofNearest, tofValid);
  else       display.println("ToF  --- FAILED");

  display.setCursor(2, 27);
  if (imuOk) display.printf("IMU R%4d P%4d", (int)roll, (int)pitch);
  else       display.println("IMU  --- FAILED");

  display.setCursor(2, 39);
  if (imuOk) display.printf("    Yaw %4d deg", (int)yaw);

  display.setCursor(2, 51);
  if (spectralOk && haveColour) {
    display.printf("B%4d G%4d R%4d",
                   chan[AS7343_CHANNEL_F2] >> 4,
                   chan[AS7343_CHANNEL_F4] >> 4,
                   chan[AS7343_CHANNEL_F6] >> 4);
  } else if (spectralOk) {
    display.println("COL reading...");
  } else {
    display.println("COL  --- FAILED");
  }
  display.display();

  Serial.printf("ToF %4dmm ctr %4dmm %2d/64 | IMU r%7.1f p%7.1f y%7.1f | "
                "AS7343 violet %5u blue %5u green %5u red %5u nir %5u | "
                "imu rpts %lu | saves %lu\n",
                tofNearest, tofCentre, tofValid, roll, pitch, yaw,
                chan[AS7343_CHANNEL_F1], chan[AS7343_CHANNEL_F3],
                chan[AS7343_CHANNEL_F4], chan[AS7343_CHANNEL_F6],
                chan[AS7343_CHANNEL_NIR], imuReports, savesHandled);
}
