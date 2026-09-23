// All four evaluation devices live, with a summary on the OLED.
//   I2C (SDA = GPIO 8, SCL = GPIO 9, 400kHz):
//     0x3C SSD1306 OLED   0x29 VL53L5CX 8x8 ToF   0x39 AS7343 spectral
//   UART (Adafruit BNO085, P1 tied to 3.3V):
//     sensor SDA/TX -> GPIO 18, sensor SCL/RX <- GPIO 17, RST <- GPIO 10
//   Save button: GPIO 4 to GND (internal pull-up, so pressed reads LOW)
//
// Each sensor initialises independently: one failing does not stop the others,
// so a partial bring-up still shows which parts are good.
//
// Serial output (115200) carries three kinds of line:
//   "H,..."  CSV header, at start-up and every 10s so a capture can join mid-stream
//   "D,..."  one CSV data row per ToF frame (10Hz) with the latest value of everything
//   anything else is human-readable status (1Hz) or an "EVENT save" line
// tools/capture.py records the D rows; tools/plot_bench.py turns them into figures.
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

// The last two arguments are the I2C clock during and *after* each display
// update. The library's default "after" is 100kHz, which silently dropped the
// whole bus to 100kHz after every redraw and made each ToF frame read take 138ms.
Adafruit_SSD1306 display(128, 64, &Wire, -1, 400000, 400000);
SparkFun_VL53L5CX tof;
VL53L5CX_ResultsData tofData;
Adafruit_AS7343 spectral;
Adafruit_BNO08x imu(BNO_RST_PIN);
sh2_SensorValue_t imuValue;

bool tofOk = false, spectralOk = false, imuOk = false;

// Latest readings, held between updates since the sensors run at different rates.
int tofCentre = 0, tofNearest = 0, tofValid = 0;
int tofZones[64];            // mm per zone, -1 where the zone's status is invalid
bool newTofFrame = false;    // a D row is emitted once per fresh ToF frame
float roll = 0, pitch = 0, yaw = 0;
int imuStatus = 0;           // BNO085 calibration accuracy: 0 unreliable .. 3 high
float imuAccDeg = 0;         // BNO085's own heading-accuracy estimate, degrees
uint16_t chan[18];
bool haveColour = false;
unsigned long imuReports = 0;
unsigned long asReadMs = 0, tofFrames = 0, csvRows = 0, oledMs = 0;  // loop timing
unsigned long tofReadMs = 0, csvMs = 0;

// AS7343 auto-gain. Photo lights saturate a fixed high gain and a dark room
// vanishes at a low one, so the gain steps to keep the brightest channel between
// 10% and 90% of full scale. Values are reported as raw / gain ("basic counts"),
// which puts every gain on the same scale. Full scale = (ATIME+1) * (ASTEP+1).
const uint8_t AS_ATIME = 29;
const uint16_t AS_ASTEP = 599;
const float AS_FULL_SCALE = (AS_ATIME + 1) * (AS_ASTEP + 1.0f);
int asGainIdx = AS7343_GAIN_256X;
int asSettleReads = 0;        // readings to discard after a gain change
bool asValid = false;         // latest spectral reading is unsaturated and settled
unsigned long asSeq = 0;      // increments on every new spectral reading

float asGainFactor() { return 0.5f * (float)(1UL << asGainIdx); }

// Output order: the 12 spectral bands by wavelength, then the clear channel.
const int AS_BANDS[] = {AS7343_CHANNEL_F1, AS7343_CHANNEL_F2, AS7343_CHANNEL_FZ,
                        AS7343_CHANNEL_F3, AS7343_CHANNEL_F4, AS7343_CHANNEL_F5,
                        AS7343_CHANNEL_FY, AS7343_CHANNEL_FXL, AS7343_CHANNEL_F6,
                        AS7343_CHANNEL_F7, AS7343_CHANNEL_F8, AS7343_CHANNEL_NIR,
                        AS7343_CHANNEL_VIS_TL_0};
const char *AS_NAMES[] = {"f1_405", "f2_425", "fz_450", "f3_475", "f4_515",
                          "f5_550", "fy_555", "fxl_600", "f6_640", "f7_690",
                          "f8_745", "nir_855", "clear"};
const int AS_NBANDS = sizeof(AS_BANDS) / sizeof(AS_BANDS[0]);

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
  for (int z = 0; z < 64; z++) tofZones[z] = -1;  // no frame yet

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
    spectral.setATIME(AS_ATIME);
    spectral.setASTEP(AS_ASTEP);
    spectral.setGain((as7343_gain_t)asGainIdx);
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

  printCsvHeader();
}

void printCsvHeader() {
  Serial.print("H,t_ms,saves,tof_centre_mm,tof_nearest_mm,tof_valid,"
               "roll_deg,pitch_deg,yaw_deg,imu_status,imu_acc_deg,"
               "as_seq,as_valid,as_gain");
  for (int b = 0; b < AS_NBANDS; b++) Serial.printf(",%s", AS_NAMES[b]);
  for (int z = 0; z < 64; z++) Serial.printf(",z%d", z);
  Serial.println();
}

void printCsvRow() {
  Serial.printf("D,%lu,%lu,%d,%d,%d,%.2f,%.2f,%.2f,%d,%.2f,%lu,%d,%.1f",
                millis(), btnPresses, tofCentre, tofNearest, tofValid,
                roll, pitch, yaw, imuStatus, imuAccDeg,
                asSeq, asValid ? 1 : 0, asGainFactor());
  float g = asGainFactor();
  for (int b = 0; b < AS_NBANDS; b++) Serial.printf(",%.3f", chan[AS_BANDS[b]] / g);
  for (int z = 0; z < 64; z++) Serial.printf(",%d", tofZones[z]);
  Serial.println();
}

void readTof() {
  if (!tofOk || !tof.isDataReady()) return;
  unsigned long t0 = millis();
  if (!tof.getRangingData(&tofData)) return;
  tofReadMs = millis() - t0;
  int nearest = 9999, valid = 0;
  for (int i = 0; i < 64; i++) {
    uint8_t st = tofData.target_status[i];
    if (st != 5 && st != 9) {  // 5 and 9 are the valid statuses
      tofZones[i] = -1;
      continue;
    }
    valid++;
    int mm = tofData.distance_mm[i];
    tofZones[i] = mm;
    if (mm < nearest) nearest = mm;
  }
  tofNearest = (nearest == 9999) ? 0 : nearest;
  tofValid = valid;
  newTofFrame = true;
  tofFrames++;

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
  imuStatus = imuValue.status & 0x03;
  imuAccDeg = imuValue.un.rotationVector.accuracy * 180.0 / PI;
  // Quaternion -> Euler angles, in degrees.
  float r = imuValue.un.rotationVector.real, i = imuValue.un.rotationVector.i;
  float j = imuValue.un.rotationVector.j, k = imuValue.un.rotationVector.k;
  roll = atan2(2.0 * (r * i + j * k), 1.0 - 2.0 * (i * i + j * j)) * 180.0 / PI;
  pitch = asin(constrain(2.0 * (r * j - k * i), -1.0, 1.0)) * 180.0 / PI;
  yaw = atan2(2.0 * (r * k + i * j), 1.0 - 2.0 * (j * j + k * k)) * 180.0 / PI;
}

void readSpectral() {
  if (!spectralOk) return;
  unsigned long t0 = millis();
  haveColour = spectral.readAllChannels(chan);
  asReadMs = millis() - t0;
  if (!haveColour) return;
  asSeq++;

  uint16_t peak = 0;
  for (int b = 0; b < AS_NBANDS; b++) peak = max(peak, chan[AS_BANDS[b]]);
  bool saturated = spectral.isAnalogSaturated() || peak >= 0.9f * AS_FULL_SCALE;

  if (asSettleReads > 0) {
    asSettleReads--;          // first reading after a gain change can mix both gains
    asValid = false;
  } else if (saturated && asGainIdx > AS7343_GAIN_0_5X) {
    asGainIdx--;
    spectral.setGain((as7343_gain_t)asGainIdx);
    asSettleReads = 1;
    asValid = false;
  } else if (peak < 0.1f * AS_FULL_SCALE && asGainIdx < AS7343_GAIN_2048X) {
    asGainIdx++;
    spectral.setGain((as7343_gain_t)asGainIdx);
    asSettleReads = 1;
    asValid = false;
  } else {
    asValid = !saturated;     // at the gain limits a reading may still be out of range
  }
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

  // The spectral sensor blocks ~150ms per 18-channel read (3 SMUX cycles of
  // ~50ms), so poll it less often; 500ms keeps auto-gain converging in seconds.
  if (millis() - lastSlow > 500) {
    readSpectral();
    lastSlow = millis();
  }

  if (newTofFrame) {
    newTofFrame = false;
    unsigned long t0 = millis();
    printCsvRow();
    csvMs = millis() - t0;
    csvRows++;
  }
  static unsigned long lastHeader = 0;
  if (millis() - lastHeader > 10000) {
    printCsvHeader();
    lastHeader = millis();
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
  // Centre distance in whole cm: the nearest-zone value in mm flickered with the
  // normal +/-3 mm noise and looked random on the display.
  if (tofOk) display.printf("ToF %4d cm %2d/64", (tofCentre + 5) / 10, tofValid);
  else       display.println("ToF  --- FAILED");

  display.setCursor(2, 27);
  if (imuOk) display.printf("IMU R%4d P%4d", (int)roll, (int)pitch);
  else       display.println("IMU  --- FAILED");

  display.setCursor(2, 39);
  // The BNO085 calibrates itself as it moves; show its 0-3 confidence so the
  // user can see when the figure-8 motion has done its job.
  if (imuOk) display.printf("Y%4d cal %d/3", (int)yaw, imuStatus);

  display.setCursor(2, 51);
  if (spectralOk && haveColour) {
    // Light level as gain-normalised clear counts, so it stays comparable while
    // the auto-gain steps. A packed "L 3.7 g2048*" line was unreadable, so show
    // one plain value, or a word while the gain is still settling.
    float light = chan[AS7343_CHANNEL_VIS_TL_0] / asGainFactor();
    if (!asValid)          display.print("Light: adjusting");
    else if (light < 10)   display.printf("Light %.2f", light);
    else if (light < 1000) display.printf("Light %.1f", light);
    else                   display.printf("Light %.0f", light);
  } else if (spectralOk) {
    display.println("COL reading...");
  } else {
    display.println("COL  --- FAILED");
  }
  unsigned long tDisp = millis();
  display.display();
  oledMs = millis() - tDisp;

  // Human-readable status at 1Hz; the D rows carry the full-rate data.
  static unsigned long lastStatus = 0;
  if (millis() - lastStatus < 1000) return;
  lastStatus = millis();
  Serial.printf("TIMING tof_frames %lu csv_rows %lu tof_read_ms %lu csv_ms %lu "
                "as_read_ms %lu oled_ms %lu\n",
                tofFrames, csvRows, tofReadMs, csvMs, asReadMs, oledMs);
  Serial.printf("ToF %4dmm ctr %4dmm %2d/64 | IMU r%7.1f p%7.1f y%7.1f | "
                "AS7343 violet %5u blue %5u green %5u red %5u nir %5u | "
                "imu rpts %lu | saves %lu\n",
                tofNearest, tofCentre, tofValid, roll, pitch, yaw,
                chan[AS7343_CHANNEL_F1], chan[AS7343_CHANNEL_F3],
                chan[AS7343_CHANNEL_F4], chan[AS7343_CHANNEL_F6],
                chan[AS7343_CHANNEL_NIR], imuReports, savesHandled);
}
