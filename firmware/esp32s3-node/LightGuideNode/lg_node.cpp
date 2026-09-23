// LightGuide node: sensors, BLE publishing and the save button. The sketch
// entry point is LightGuideNode.ino; the code lives here as plain C++ so the
// Arduino builder does not generate prototypes for it.
//
// Implements LightGuide Device Protocol v2 (docs/engineering/DEVICE_PROTOCOL.md)
// as a BLE GATT server: device info, 5 Hz measurement snapshots (ToF distance,
// BNO085 orientation, AS7343 gain-normalised spectrum), save_pressed events
// from the GPIO4 button, status, and the request_status / identify commands.
//
// Sensor drivers, pin map, auto-gain, BNO085 UART recovery and button debounce
// are reused from the verified bench firmware
// (experiments/esp32s3-sensor-bench/sketches/AllSensors_Live).
//
// Tasks:
//   loop()        sensors: blocking I2C/UART reads (a spectral read takes ~150 ms)
//   commsTask     BLE: measurement every 200 ms, events, commands, status; it
//                 only copies the latest readings, so a slow or failed sensor
//                 read never stops the BLE side
//   buttonTask    samples GPIO4 every 5 ms (the verified debounce)
//
// The node does not store setups: a press is only an event for the phone.
// The bench OLED is not used.
#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_VL53L5CX_Library.h>
#include <Adafruit_AS7343.h>
#include <Adafruit_BNO08x.h>

#include <atomic>

#include "node_config.h"
#include "lg_ble.h"
#include "src/lg_protocol.h"
#include "src/lg_sensor_logic.h"

static_assert(LG_AS_START_GAIN_IDX == AS7343_GAIN_256X, "start gain must be 256x");
static_assert(lg::kGainIdxMax == AS7343_GAIN_2048X, "gain index range must match the driver");

// ------------------------------------------------------------ shared readings
//
// Written by the sensor loop, copied by the comms task, always under
// sharedMutex so a measurement is one coherent snapshot.
struct SharedReadings {
  bool initDone = false;

  bool tofInit = false;
  uint32_t tofInitMs = 0;
  bool tofHaveFrame = false;
  uint32_t tofFrameMs = 0;
  lg::TofSummary tof{};

  bool imuInit = false;
  uint32_t imuInitMs = 0;
  bool imuHaveReport = false;
  uint32_t imuReportMs = 0;
  float roll = 0, pitch = 0, yaw = 0;
  uint8_t imuCal = 0;  // BNO085 accuracy status 0 (unreliable) .. 3 (high); diagnostic only

  bool spectralInit = false;
  uint32_t spectralInitMs = 0;
  bool spectralHaveRead = false;
  uint32_t spectralReadMs = 0;  // last successful read
  bool spectralReadingValid = false;
  float spectralGain = lg::gainFactor(LG_AS_START_GAIN_IDX);
  float spectral[lg::kSpectralChannels] = {};
};

SharedReadings shared;
SemaphoreHandle_t sharedMutex;
std::atomic<uint32_t> seqCounter{0};
std::atomic<uint32_t> btnPresses{0};
char deviceId[24];

uint32_t nextSeq() { return ++seqCounter; }
uint32_t ageMs(uint32_t now, uint32_t then) { return now - then; }  // wrap-safe

// ------------------------------------------------------------------ save button

void buttonTask(void *) {
  lg::Debouncer d;
  for (;;) {
    if (d.sample(digitalRead(LG_PIN_SAVE_BUTTON) == HIGH)) btnPresses++;
    vTaskDelay(pdMS_TO_TICKS(LG_BUTTON_SAMPLE_MS));
  }
}

// ----------------------------------------------------------------------- ToF

SparkFun_VL53L5CX tof;
VL53L5CX_ResultsData tofData;

bool initTof() {
  bool ok = tof.begin();
  if (ok) {
    tof.setResolution(LG_TOF_RESOLUTION);
    tof.setRangingFrequency(LG_TOF_RANGING_HZ);
    ok = tof.startRanging();
  }
  Serial.printf("VL53L5CX init %s\n", ok ? "OK" : "FAILED");
  return ok;
}

void readTof(bool ok) {
  if (!ok || !tof.isDataReady()) return;
  if (!tof.getRangingData(&tofData)) return;
  lg::TofSummary s = lg::summariseTof(tofData.distance_mm, tofData.target_status);
  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  shared.tof = s;
  shared.tofHaveFrame = true;
  shared.tofFrameMs = millis();
  xSemaphoreGive(sharedMutex);
}

// ------------------------------------------------------------------- AS7343

Adafruit_AS7343 spectral;
lg::AutoGain autoGain{LG_AS_START_GAIN_IDX};
const float AS_FULL_SCALE = (LG_AS_ATIME + 1) * (LG_AS_ASTEP + 1.0f);

// Protocol v2 channel order: the 12 bands by wavelength, then clear.
const int AS_BANDS[lg::kSpectralChannels] = {
    AS7343_CHANNEL_F1, AS7343_CHANNEL_F2, AS7343_CHANNEL_FZ,  AS7343_CHANNEL_F3,
    AS7343_CHANNEL_F4, AS7343_CHANNEL_F5, AS7343_CHANNEL_FY,  AS7343_CHANNEL_FXL,
    AS7343_CHANNEL_F6, AS7343_CHANNEL_F7, AS7343_CHANNEL_F8,  AS7343_CHANNEL_NIR,
    AS7343_CHANNEL_VIS_TL_0};

bool initSpectral() {
  bool ok = spectral.begin();
  if (ok) {
    spectral.setATIME(LG_AS_ATIME);
    spectral.setASTEP(LG_AS_ASTEP);
    autoGain = lg::AutoGain{LG_AS_START_GAIN_IDX};
    spectral.setGain((as7343_gain_t)autoGain.gainIdx);
  }
  Serial.printf("AS7343 init %s\n", ok ? "OK" : "FAILED");
  return ok;
}

void readSpectral(bool ok) {
  if (!ok) return;
  uint16_t chan[18];
  // Blocks ~150 ms (3 SMUX cycles); the driver gives up after 1 s.
  if (!spectral.readAllChannels(chan)) {
    xSemaphoreTake(sharedMutex, portMAX_DELAY);
    shared.spectralReadingValid = false;
    xSemaphoreGive(sharedMutex);
    return;
  }

  // Normalise with the gain this acquisition used, before auto-gain changes it.
  float gain = lg::gainFactor(autoGain.gainIdx);
  float values[lg::kSpectralChannels];
  uint16_t peak = 0;
  for (int b = 0; b < lg::kSpectralChannels; b++) {
    uint16_t raw = chan[AS_BANDS[b]];
    peak = max(peak, raw);
    values[b] = raw / gain;
  }
  lg::AutoGain::Result r = autoGain.update(peak, AS_FULL_SCALE, spectral.isAnalogSaturated());
  if (r.gainChanged) spectral.setGain((as7343_gain_t)autoGain.gainIdx);

  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  shared.spectralHaveRead = true;
  shared.spectralReadMs = millis();
  shared.spectralReadingValid = r.valid;
  shared.spectralGain = gain;
  memcpy(shared.spectral, values, sizeof(values));
  xSemaphoreGive(sharedMutex);
}

// ------------------------------------------------------------------- BNO085

Adafruit_BNO08x imu(LG_PIN_BNO_RST);
sh2_SensorValue_t imuValue;
uint32_t imuReports = 0;

bool initImu() {
  // UART, not I2C: the BNO08x violates I2C timing and was unreliable with the
  // ESP32-S3 on the shared bus. The driver opens Serial1 at 3 Mbaud without
  // pins, so set the pins first. The larger RX buffer holds the 50 Hz reports
  // that arrive while the loop is blocked in a ~150 ms spectral read.
  Serial1.setRxBufferSize(2048);
  Serial1.setPins(LG_PIN_BNO_UART_RX, LG_PIN_BNO_UART_TX);
  Serial1.begin(3000000, SERIAL_8N1, LG_PIN_BNO_UART_RX, LG_PIN_BNO_UART_TX);
  bool ok = imu.begin_UART(&Serial1) && imu.enableReport(SH2_ROTATION_VECTOR, LG_IMU_REPORT_US);
  Serial.printf("BNO085 init %s\n", ok ? "OK" : "FAILED");
  return ok;
}

void readImu(bool ok) {
  if (!ok) return;
  // The BNO085 resets itself on error and comes back with all reports off.
  if (imu.wasReset()) {
    // Re-enabling instantly is lost while the chip is still booting.
    Serial.println("BNO085 reset - re-enabling rotation vector");
    delay(50);
    imu.enableReport(SH2_ROTATION_VECTOR, LG_IMU_REPORT_US);
  }

  // Safety net: if reports stop for 3 s, the config was lost somewhere; ask again.
  static uint32_t lastCheck = 0, reportsAtCheck = 0;
  if (millis() - lastCheck > 3000) {
    if (imuReports == reportsAtCheck) {
      Serial.println("BNO085 silent for 3s - re-enabling rotation vector");
      imu.enableReport(SH2_ROTATION_VECTOR, LG_IMU_REPORT_US);
    }
    reportsAtCheck = imuReports;
    lastCheck = millis();
  }

  // Drain what queued up while the loop was busy, keeping the newest report.
  bool got = false;
  float r = 0, i = 0, j = 0, k = 0;
  uint8_t cal = 0;
  for (int n = 0; n < 16 && imu.getSensorEvent(&imuValue); n++) {
    if (imuValue.sensorId != SH2_ROTATION_VECTOR) continue;
    imuReports++;
    got = true;
    cal = imuValue.status & 0x03;
    r = imuValue.un.rotationVector.real;
    i = imuValue.un.rotationVector.i;
    j = imuValue.un.rotationVector.j;
    k = imuValue.un.rotationVector.k;
  }
  if (!got) return;

  // Quaternion -> roll/pitch/yaw in degrees (ZYX Tait-Bryan, same formula as
  // the verified bench). See the README for the axis convention.
  float roll = atan2(2.0 * (r * i + j * k), 1.0 - 2.0 * (i * i + j * j)) * 180.0 / PI;
  float pitch = asin(constrain(2.0 * (r * j - k * i), -1.0, 1.0)) * 180.0 / PI;
  float yaw = atan2(2.0 * (r * k + i * j), 1.0 - 2.0 * (j * j + k * k)) * 180.0 / PI;

  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  shared.imuHaveReport = true;
  shared.imuReportMs = millis();
  shared.roll = roll;
  shared.pitch = pitch;
  shared.yaw = yaw;
  shared.imuCal = cal;
  xSemaphoreGive(sharedMutex);
}

// ------------------------------------------------------------ status / health

struct Health {
  bool initDone, tof, imu, spectral;
  char error[lg::kErrorTextMax];
};

// Set by the comms task, read by Status READs in the BLE host task.
std::atomic<bool> mtuTooSmall{false};

Health currentHealth() {
  Health h{};
  uint32_t now = millis();
  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  SharedReadings s = shared;
  xSemaphoreGive(sharedMutex);

  h.initDone = s.initDone;
  h.tof = s.tofInit && ageMs(now, s.tofHaveFrame ? s.tofFrameMs : s.tofInitMs) <= LG_TOF_HEALTH_MS;
  h.imu = s.imuInit &&
          ageMs(now, s.imuHaveReport ? s.imuReportMs : s.imuInitMs) <= LG_IMU_HEALTH_MS;
  h.spectral = s.spectralInit && ageMs(now, s.spectralHaveRead ? s.spectralReadMs
                                                               : s.spectralInitMs) <=
                                     LG_SPECTRAL_HEALTH_MS;
  h.error[0] = '\0';
  if (s.initDone) {
    if (!s.tofInit) lg::appendError(h.error, sizeof(h.error), "tof:init_failed");
    else if (!h.tof) lg::appendError(h.error, sizeof(h.error), "tof:no_frames");
    if (!s.imuInit) lg::appendError(h.error, sizeof(h.error), "imu:init_failed");
    else if (!h.imu) lg::appendError(h.error, sizeof(h.error), "imu:no_reports");
    if (!s.spectralInit) lg::appendError(h.error, sizeof(h.error), "spectral:init_failed");
    else if (!h.spectral) lg::appendError(h.error, sizeof(h.error), "spectral:read_failed");
  }
  if (mtuTooSmall) lg::appendError(h.error, sizeof(h.error), "ble:mtu_too_small");
  return h;
}

// commandError, if given, is reported first (e.g. "unsupported_command:identify").
size_t buildStatusPayload(char *out, size_t cap, const char *commandError, Health *healthOut) {
  Health h = currentHealth();
  char error[lg::kErrorTextMax] = "";
  if (commandError) lg::appendError(error, sizeof(error), commandError);
  if (h.error[0]) lg::appendError(error, sizeof(error), h.error);
  lg::StatusSnapshot st{millis(), lg::deriveState(h.initDone, h.tof, h.imu, h.spectral), h.tof,
                        h.imu, h.spectral, error[0] ? error : nullptr};
  if (healthOut) *healthOut = h;
  return lg::buildStatus(out, cap, nextSeq(), st);
}

// Status READ, called in the BLE host task.
size_t statusForRead(char *out, size_t cap) { return buildStatusPayload(out, cap, nullptr, nullptr); }

// ----------------------------------------------------------------- comms task

lg::MeasurementSnapshot takeSnapshot() {
  uint32_t now = millis();
  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  SharedReadings s = shared;
  xSemaphoreGive(sharedMutex);

  lg::MeasurementSnapshot m{};
  m.uptimeMs = now;
  m.tofValid = s.tofInit && s.tofHaveFrame && ageMs(now, s.tofFrameMs) <= LG_TOF_FRESH_MS &&
               s.tof.valid;
  m.distanceMm = s.tof.distanceMm;
  m.imuValid = s.imuInit && s.imuHaveReport && ageMs(now, s.imuReportMs) <= LG_IMU_FRESH_MS;
  m.rollDeg = s.roll;
  m.pitchDeg = s.pitch;
  m.yawDeg = s.yaw;
  m.spectralValid = s.spectralInit && s.spectralHaveRead &&
                    ageMs(now, s.spectralReadMs) <= LG_SPECTRAL_FRESH_MS && s.spectralReadingValid;
  m.spectralGain = s.spectralGain;
  memcpy(m.spectral, s.spectral, sizeof(m.spectral));
  return m;
}

const char *resultName(lgble::NotifyResult r) {
  switch (r) {
    case lgble::NotifyResult::Sent: return "sent";
    case lgble::NotifyResult::NotConnected: return "not connected";
    case lgble::NotifyResult::NotSubscribed: return "not subscribed";
    case lgble::NotifyResult::TooLarge: return "too large for MTU";
    case lgble::NotifyResult::NoMemory: return "no BLE buffer";
    case lgble::NotifyResult::Failed: return "failed";
  }
  return "?";
}

struct CommsState {
  uint32_t nextMeasurementMs = 0;
  uint32_t measurementsSent = 0, measurementsSkipped = 0;
  uint32_t lastAdvCheckMs = 0, lastLogMs = 0;
  bool wasConnected = false, wasStatusSubscribed = false;

  // Last status notified, to send again only on a change.
  bool haveLastStatus = false;
  lg::NodeState lastState = lg::NodeState::Booting;
  bool lastTof = false, lastImu = false, lastSpectral = false;
  char lastError[lg::kErrorTextMax] = "";

  // Save events: one per press; a press waits while an earlier one retries.
  uint32_t pressesHandled = 0;
  bool eventPending = false;
  uint32_t eventFirstTryMs = 0;
  char eventBuf[lg::kEventMax];
  size_t eventLen = 0;
  uint32_t eventsSent = 0, eventsDropped = 0;
};

void sendStatus(CommsState &c, const char *commandError, const char *why) {
  char buf[lg::kStatusMax];
  Health h;
  size_t n = buildStatusPayload(buf, sizeof(buf), commandError, &h);
  lgble::NotifyResult r = n ? lgble::notify(lgble::Chr::Status, buf, n)
                            : lgble::NotifyResult::Failed;
  Serial.printf("STATUS (%s) %s: %.*s\n", why, resultName(r), (int)n, buf);
  // Remember what was reported so a change is sent once. Only a full host
  // buffer is retried; any other failure would repeat every tick, and the
  // phone can still READ the status.
  if (r != lgble::NotifyResult::NoMemory && !commandError) {
    c.haveLastStatus = true;
    c.lastState = lg::deriveState(h.initDone, h.tof, h.imu, h.spectral);
    c.lastTof = h.tof;
    c.lastImu = h.imu;
    c.lastSpectral = h.spectral;
    strlcpy(c.lastError, h.error, sizeof(c.lastError));
  }
}

void handleEvents(CommsState &c, uint32_t now) {
  if (c.eventPending) {
    lgble::NotifyResult r = lgble::notify(lgble::Chr::Event, c.eventBuf, c.eventLen);
    if (r == lgble::NotifyResult::NoMemory && ageMs(now, c.eventFirstTryMs) < LG_EVENT_RETRY_MS) {
      return;  // try again next tick with the same seq
    }
    c.eventPending = false;
    if (r == lgble::NotifyResult::Sent) c.eventsSent++;
    else c.eventsDropped++;
    Serial.printf("EVENT save_pressed %s: %.*s\n", resultName(r), (int)c.eventLen, c.eventBuf);
  }

  uint32_t presses = btnPresses.load();
  if (c.pressesHandled == presses) return;
  c.pressesHandled++;

  // A press with no subscribed phone is not queued for later: replaying it on
  // the next connection would save a setup the user did not ask for then.
  if (!lgble::connected() || !lgble::subscribed(lgble::Chr::Event)) {
    c.eventsDropped++;
    Serial.println("EVENT save_pressed not sent: no phone subscribed to events");
    return;
  }
  c.eventLen = lg::buildSaveEvent(c.eventBuf, sizeof(c.eventBuf), nextSeq(), now);
  c.eventFirstTryMs = now;
  c.eventPending = c.eventLen > 0;
  handleEvents(c, now);  // first attempt now
}

void handleCommands(CommsState &c) {
  lg::Command cmd;
  while (lgble::nextCommand(cmd)) {
    char err[48];
    switch (cmd.kind) {
      case lg::CommandKind::RequestStatus:
        sendStatus(c, nullptr, "request_status");
        break;
      case lg::CommandKind::Identify:
        // The onboard RGB LED (GPIO38) has not been physically verified.
        sendStatus(c, "unsupported_command:identify", "identify");
        break;
      case lg::CommandKind::Unknown:
        snprintf(err, sizeof(err), "unknown_command:%s", cmd.name);
        sendStatus(c, err, "unknown command");
        break;
      case lg::CommandKind::UnsupportedVersion:
        sendStatus(c, "unsupported_version", "bad command version");
        break;
      case lg::CommandKind::Malformed:
        sendStatus(c, "bad_command", "malformed command");
        break;
    }
  }
}

void handleMeasurement(CommsState &c, uint32_t now) {
  if ((int32_t)(now - c.nextMeasurementMs) < 0) return;
  c.nextMeasurementMs += LG_MEASUREMENT_PERIOD_MS;
  if ((int32_t)(now - c.nextMeasurementMs) > LG_MEASUREMENT_PERIOD_MS) {
    c.nextMeasurementMs = now + LG_MEASUREMENT_PERIOD_MS;  // fell behind; do not burst
  }
  if (!lgble::connected() || !lgble::subscribed(lgble::Chr::Measurement)) return;

  char buf[lg::kMeasurementMax];
  size_t n = lg::buildMeasurement(buf, sizeof(buf), nextSeq(), takeSnapshot());
  lgble::NotifyResult r = n ? lgble::notify(lgble::Chr::Measurement, buf, n)
                            : lgble::NotifyResult::Failed;
  if (r == lgble::NotifyResult::Sent) {
    c.measurementsSent++;
    mtuTooSmall = false;
  } else {
    c.measurementsSkipped++;
    if (r == lgble::NotifyResult::TooLarge && !mtuTooSmall) {
      mtuTooSmall = true;
      Serial.printf("BLE: measurement of %u bytes does not fit ATT MTU %u; not sent\n",
                    (unsigned)n, lgble::mtu());
    }
  }
}

void handleStatusChanges(CommsState &c) {
  bool connectedNow = lgble::connected();
  if (connectedNow != c.wasConnected) {
    Serial.printf("BLE %s\n", connectedNow ? "connected" : "disconnected");
    c.wasConnected = connectedNow;
    if (!connectedNow) {
      mtuTooSmall = false;
      c.wasStatusSubscribed = false;
    }
  }
  if (!connectedNow) return;

  bool statusSub = lgble::subscribed(lgble::Chr::Status);
  if (statusSub && !c.wasStatusSubscribed) {
    c.wasStatusSubscribed = true;
    sendStatus(c, nullptr, "subscribed");
    return;
  }
  c.wasStatusSubscribed = statusSub;
  if (!statusSub) return;

  Health h = currentHealth();
  lg::NodeState st = lg::deriveState(h.initDone, h.tof, h.imu, h.spectral);
  if (!c.haveLastStatus || st != c.lastState || h.tof != c.lastTof || h.imu != c.lastImu ||
      h.spectral != c.lastSpectral || strcmp(h.error, c.lastError) != 0) {
    sendStatus(c, nullptr, "changed");
  }
}

void logLine(CommsState &c, uint32_t now) {
  if (ageMs(now, c.lastLogMs) < 1000) return;
  c.lastLogMs = now;
  Health h = currentHealth();
  lg::MeasurementSnapshot m = takeSnapshot();
  Serial.printf("NODE %s | BLE %s mtu %u sub m%d e%d s%d | sent m%lu skip %lu ev %lu drop %lu | "
                "ToF %s %umm | IMU %s r%.1f p%.1f y%.1f | AS %s g%g clear %.3f | err %s\n",
                lg::stateName(lg::deriveState(h.initDone, h.tof, h.imu, h.spectral)),
                lgble::connected() ? "conn" : "adv", lgble::mtu(),
                lgble::subscribed(lgble::Chr::Measurement), lgble::subscribed(lgble::Chr::Event),
                lgble::subscribed(lgble::Chr::Status), (unsigned long)c.measurementsSent,
                (unsigned long)c.measurementsSkipped, (unsigned long)c.eventsSent,
                (unsigned long)c.eventsDropped, m.tofValid ? "ok" : "--", m.distanceMm,
                m.imuValid ? "ok" : "--", m.rollDeg, m.pitchDeg, m.yawDeg,
                m.spectralValid ? "ok" : "--", m.spectralGain, m.spectral[12],
                h.error[0] ? h.error : "none");
}

void commsTask(void *) {
  CommsState c;
  c.nextMeasurementMs = millis();
  c.pressesHandled = btnPresses.load();
  for (;;) {
    uint32_t now = millis();
    handleEvents(c, now);
    handleCommands(c);
    handleMeasurement(c, now);
    handleStatusChanges(c);
    if (ageMs(now, c.lastAdvCheckMs) >= 1000) {
      c.lastAdvCheckMs = now;
      lgble::ensureAdvertising();
    }
    logLine(c, now);
    vTaskDelay(pdMS_TO_TICKS(LG_COMMS_TICK_MS));
  }
}

// ------------------------------------------------------------------ setup/loop

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\nLightGuide node fw %s (%s), Device Protocol v%d\n", LG_FW_VERSION, LG_HW_ID,
                lg::kProtocolVersion);

  sharedMutex = xSemaphoreCreateMutex();
  pinMode(LG_PIN_SAVE_BUTTON, INPUT_PULLUP);
  xTaskCreate(buttonTask, "saveButton", 2048, nullptr, 2, nullptr);

  // Stable node id from the factory MAC in eFuse, not the BLE address.
  uint64_t mac = ESP.getEfuseMac();
  snprintf(deviceId, sizeof(deviceId), "lg-node-%02x%02x%02x%02x%02x%02x",
           (unsigned)(mac & 0xff), (unsigned)((mac >> 8) & 0xff), (unsigned)((mac >> 16) & 0xff),
           (unsigned)((mac >> 24) & 0xff), (unsigned)((mac >> 32) & 0xff),
           (unsigned)((mac >> 40) & 0xff));
  static char info[lg::kDeviceInfoMax];
  size_t infoLen = lg::buildDeviceInfo(info, sizeof(info), deviceId, LG_FW_VERSION, LG_HW_ID);
  Serial.printf("device_info %.*s\n", (int)infoLen, info);

  // BLE first, so the node is discoverable (state "booting") while the
  // VL53L5CX firmware upload runs, and stays reachable if a sensor fails.
  lgble::begin(info, infoLen, statusForRead);
  xTaskCreatePinnedToCore(commsTask, "comms", 8192, nullptr, 2, nullptr, 1);
  Serial.println("BLE advertising as " LG_BLE_NAME);

  Wire.begin(LG_PIN_I2C_SDA, LG_PIN_I2C_SCL);
  Wire.setClock(LG_I2C_HZ);

  bool tofOk = initTof();
  bool spectralOk = initSpectral();
  bool imuOk = initImu();

  uint32_t now = millis();
  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  shared.tofInit = tofOk;
  shared.tofInitMs = now;
  shared.spectralInit = spectralOk;
  shared.spectralInitMs = now;
  shared.imuInit = imuOk;
  shared.imuInitMs = now;
  shared.initDone = true;
  xSemaphoreGive(sharedMutex);
}

void retryFailedSensors() {
  static uint32_t lastRetry = 0;
  if (millis() - lastRetry < LG_SENSOR_RETRY_MS) return;
  lastRetry = millis();

  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  bool tofOk = shared.tofInit, spectralOk = shared.spectralInit;
  xSemaphoreGive(sharedMutex);

  // The BNO085 is not re-initialised here: its SH-2 driver holds a single
  // instance that begin_UART cannot reopen. It keeps the verified reset and
  // 3 s re-enable recovery; a BNO085 that failed at boot needs a reset.
  if (!tofOk && initTof()) {
    xSemaphoreTake(sharedMutex, portMAX_DELAY);
    shared.tofInit = true;
    shared.tofInitMs = millis();
    xSemaphoreGive(sharedMutex);
  }
  if (!spectralOk && initSpectral()) {
    xSemaphoreTake(sharedMutex, portMAX_DELAY);
    shared.spectralInit = true;
    shared.spectralInitMs = millis();
    xSemaphoreGive(sharedMutex);
  }
}

void loop() {
  xSemaphoreTake(sharedMutex, portMAX_DELAY);
  bool tofOk = shared.tofInit, imuOk = shared.imuInit, spectralOk = shared.spectralInit;
  xSemaphoreGive(sharedMutex);

  readTof(tofOk);
  readImu(imuOk);

  // A spectral read blocks ~150 ms, so poll it less often; 500 ms keeps
  // auto-gain converging in seconds.
  static uint32_t lastSpectral = 0;
  if (millis() - lastSpectral > LG_SPECTRAL_PERIOD_MS) {
    readSpectral(spectralOk);
    lastSpectral = millis();
  }

  retryFailedSensors();
  delay(1);
}
