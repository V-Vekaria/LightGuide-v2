// Host unit tests for the node's pure protocol and sensor logic.
//
// Build and run: firmware/esp32s3-node/test/run_host_tests.sh
// With --emit-samples, prints one payload per line for conformance.mjs, which
// checks them with the Android app's own Protocol v2 parsers.
#include <math.h>
#include <stdio.h>
#include <string.h>

#include <string>
#include <vector>

#include "../LightGuideNode/src/lg_protocol.h"
#include "../LightGuideNode/src/lg_sensor_logic.h"

static int failures = 0, checks = 0;

#define CHECK(cond)                                                    \
  do {                                                                 \
    checks++;                                                          \
    if (!(cond)) {                                                     \
      failures++;                                                      \
      fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); \
    }                                                                  \
  } while (0)

#define CHECK_STR(actual, expected)                                               \
  do {                                                                            \
    checks++;                                                                     \
    std::string a_ = (actual), e_ = (expected);                                   \
    if (a_ != e_) {                                                               \
      failures++;                                                                 \
      fprintf(stderr, "%s:%d: expected\n  %s\ngot\n  %s\n", __FILE__, __LINE__, e_.c_str(), \
              a_.c_str());                                                        \
    }                                                                             \
  } while (0)

using namespace lg;

static bool contains(const std::string &s, const char *needle) {
  return s.find(needle) != std::string::npos;
}

static MeasurementSnapshot validMeasurement() {
  MeasurementSnapshot m{};
  m.uptimeMs = 12345;
  m.tofValid = true;
  m.distanceMm = 812;
  m.imuValid = true;
  m.rollDeg = 1.2f;
  m.pitchDeg = -3.4f;
  m.yawDeg = 87.6f;
  m.spectralValid = true;
  m.spectralGain = 2048;
  const float v[kSpectralChannels] = {0.446f, 0.871f, 1.404f, 1.405f, 1.514f, 0.528f, 1.937f,
                                      1.556f, 1.489f, 1.797f, 1.122f, 2.777f, 3.445f};
  memcpy(m.spectral, v, sizeof(v));
  return m;
}

static std::string measurement(uint32_t seq, const MeasurementSnapshot &m) {
  char buf[kMeasurementMax];
  size_t n = buildMeasurement(buf, sizeof(buf), seq, m);
  return std::string(buf, n);
}

// Worst case for size: every field at its widest.
static MeasurementSnapshot widestMeasurement() {
  MeasurementSnapshot m{};
  m.uptimeMs = 4294967295u;
  m.tofValid = true;
  m.distanceMm = 65535;
  m.imuValid = true;
  m.rollDeg = -179.99f;
  m.pitchDeg = -89.99f;
  m.yawDeg = -179.99f;
  m.spectralValid = true;
  m.spectralGain = 2048;
  for (int i = 0; i < kSpectralChannels; i++) m.spectral[i] = 12345.0f / 2048.0f + 0.000123f;
  return m;
}

static void testMeasurementExample() {
  std::string s = measurement(42, validMeasurement());
  CHECK_STR(s,
            "{\"v\":2,\"type\":\"measurement\",\"seq\":42,\"uptime_ms\":12345,"
            "\"distance_mm\":812,\"roll_deg\":1.20,\"pitch_deg\":-3.40,\"yaw_deg\":87.60,"
            "\"tof_valid\":true,\"imu_valid\":true,\"spectral_valid\":true,"
            "\"spectral_gain\":2048,\"spectral\":[0.446,0.871,1.404,1.405,1.514,0.528,1.937,"
            "1.556,1.489,1.797,1.122,2.777,3.445]}");
}

static void testMeasurementInvalidFieldsArePlaceholders() {
  MeasurementSnapshot m = validMeasurement();
  m.tofValid = false;
  m.imuValid = false;
  m.spectralValid = false;
  std::string s = measurement(7, m);
  CHECK(contains(s, "\"distance_mm\":0,"));
  CHECK(contains(s, "\"roll_deg\":0,\"pitch_deg\":0,\"yaw_deg\":0,"));
  CHECK(contains(s, "\"tof_valid\":false,\"imu_valid\":false,\"spectral_valid\":false,"));
  CHECK(contains(s, "\"spectral_gain\":2048,\"spectral\":[0,0,0,0,0,0,0,0,0,0,0,0,0]}"));
}

static void testMeasurementNonFiniteNeverValid() {
  MeasurementSnapshot m = validMeasurement();
  m.yawDeg = NAN;
  m.spectral[5] = INFINITY;
  std::string s = measurement(1, m);
  CHECK(contains(s, "\"imu_valid\":false"));
  CHECK(contains(s, "\"spectral_valid\":false"));
  CHECK(!contains(s, "nan") && !contains(s, "inf"));

  m = validMeasurement();
  m.spectralGain = 0;
  s = measurement(1, m);
  CHECK(contains(s, "\"spectral_valid\":false,\"spectral_gain\":1,"));
  m.spectralGain = -4;
  CHECK(contains(measurement(1, m), "\"spectral_gain\":1,"));
}

static void testMeasurementGainFormatting() {
  MeasurementSnapshot m = validMeasurement();
  m.spectralGain = gainFactor(0);
  CHECK(contains(measurement(1, m), "\"spectral_gain\":0.5,"));
  m.spectralGain = gainFactor(12);
  CHECK(contains(measurement(1, m), "\"spectral_gain\":2048,"));
}

static void testSpectralPrecision() {
  // Smallest non-zero value (1 count at 2048x) and the largest (full 16-bit at
  // 0.5x) stay in fixed notation with enough digits.
  MeasurementSnapshot m = validMeasurement();
  m.spectral[0] = 1.0f / 2048.0f;
  m.spectral[1] = 65535.0f / 0.5f;
  std::string s = measurement(1, m);
  CHECK(contains(s, "\"spectral\":[0.000488281,131070,"));
}

static void testMeasurementWorstCaseFits() {
  std::string s = measurement(4294967295u, widestMeasurement());
  CHECK(!s.empty());
  CHECK(s.size() < kMeasurementMax);
  // Must fit one notification at Android's 517-byte MTU (payload 514).
  CHECK(s.size() <= 514);
  printf("  worst-case measurement: %zu bytes (needs ATT MTU >= %zu)\n", s.size(), s.size() + 3);
}

static void testBuilderRejectsSmallBuffer() {
  char buf[64];
  memset(buf, 'x', sizeof(buf));
  CHECK(buildMeasurement(buf, sizeof(buf), 1, validMeasurement()) == 0);
  CHECK(buf[0] == '\0');  // no partial object left behind
  CHECK(buildStatus(buf, 10, 1, StatusSnapshot{1, NodeState::Ready, true, true, true, nullptr}) == 0);
}

static void testStatus() {
  char buf[kStatusMax];
  size_t n = buildStatus(buf, sizeof(buf), 44,
                         StatusSnapshot{12600, NodeState::Ready, true, true, true, nullptr});
  CHECK_STR(std::string(buf, n),
            "{\"v\":2,\"type\":\"status\",\"seq\":44,\"uptime_ms\":12600,\"state\":\"ready\","
            "\"tof\":true,\"imu\":true,\"spectral\":true,\"error\":null}");

  n = buildStatus(buf, sizeof(buf), 45,
                  StatusSnapshot{1, NodeState::Degraded, true, false, true, "imu:no_reports"});
  CHECK(contains(std::string(buf, n), "\"state\":\"degraded\""));
  CHECK(contains(std::string(buf, n), "\"imu\":false"));
  CHECK(contains(std::string(buf, n), "\"error\":\"imu:no_reports\"}"));

  // An empty error string is null, and quotes/backslashes are escaped.
  n = buildStatus(buf, sizeof(buf), 1, StatusSnapshot{1, NodeState::Error, false, false, false, ""});
  CHECK(contains(std::string(buf, n), "\"error\":null}"));
  n = buildStatus(buf, sizeof(buf), 1,
                  StatusSnapshot{1, NodeState::Error, false, false, false, "a\"b\\c\n"});
  CHECK(contains(std::string(buf, n), "\"error\":\"a\\\"b\\\\c\"}"));

  // Worst case: longest state and an error buffer filled to its limit.
  std::string longError(kErrorTextMax - 1, 'e');
  n = buildStatus(buf, sizeof(buf), 4294967295u,
                  StatusSnapshot{4294967295u, NodeState::Degraded, false, false, false,
                                 longError.c_str()});
  CHECK(n > 0);
  printf("  worst-case status: %zu bytes\n", n);
}

static void testEventAndDeviceInfo() {
  char buf[kDeviceInfoMax];
  size_t n = buildSaveEvent(buf, sizeof(buf), 43, 12500);
  CHECK_STR(std::string(buf, n),
            "{\"v\":2,\"type\":\"event\",\"seq\":43,\"uptime_ms\":12500,\"event\":\"save_pressed\"}");
  n = buildSaveEvent(buf, kEventMax, 4294967295u, 4294967295u);
  CHECK(n > 0 && n < kEventMax);

  n = buildDeviceInfo(buf, sizeof(buf), "lg-node-441bf6ca6e64", "0.1.0", "esp32s3-n16r8-eval");
  CHECK_STR(std::string(buf, n),
            "{\"v\":2,\"type\":\"device_info\",\"device_id\":\"lg-node-441bf6ca6e64\","
            "\"fw\":\"0.1.0\",\"hw\":\"esp32s3-n16r8-eval\","
            "\"cap\":[\"tof\",\"imu\",\"spectral\",\"save_button\"]}");
}

static Command parse(const char *s) { return parseCommand((const uint8_t *)s, strlen(s)); }

static void testCommands() {
  CHECK(parse("{\"v\":2,\"type\":\"command\",\"command\":\"request_status\"}").kind ==
        CommandKind::RequestStatus);
  CHECK(parse("{\"v\":2,\"type\":\"command\",\"command\":\"identify\"}").kind ==
        CommandKind::Identify);
  // Unknown fields are ignored (protocol section 3).
  CHECK(parse("{\"command\":\"request_status\",\"extra\":[1,2],\"type\":\"command\",\"v\":2}").kind ==
        CommandKind::RequestStatus);

  Command c = parse("{\"v\":2,\"type\":\"command\",\"command\":\"Calibrate-Now!\\\"x\"}");
  CHECK(c.kind == CommandKind::Unknown);
  CHECK_STR(c.name, "alibrateowx");

  c = parse("{\"v\":2,\"type\":\"command\",\"command\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}");
  CHECK(c.kind == CommandKind::Unknown);
  CHECK(strlen(c.name) == sizeof(c.name) - 1);

  CHECK(parse("{\"v\":1,\"type\":\"command\",\"command\":\"request_status\"}").kind ==
        CommandKind::UnsupportedVersion);
  CHECK(parse("{\"type\":\"command\",\"command\":\"request_status\"}").kind ==
        CommandKind::UnsupportedVersion);
  CHECK(parse("{\"v\":\"2\",\"type\":\"command\",\"command\":\"request_status\"}").kind ==
        CommandKind::UnsupportedVersion);
  CHECK(parse("{\"v\":2,\"type\":\"event\",\"command\":\"request_status\"}").kind ==
        CommandKind::Malformed);
  CHECK(parse("{\"v\":2,\"type\":\"command\"}").kind == CommandKind::Malformed);
  CHECK(parse("{\"v\":2,\"type\":\"command\",\"command\":5}").kind == CommandKind::Malformed);
  CHECK(parse("[1,2]").kind == CommandKind::Malformed);
  CHECK(parse("{\"v\":2,\"type\":\"comm").kind == CommandKind::Malformed);
  CHECK(parseCommand(nullptr, 0).kind == CommandKind::Malformed);
}

static void testDeriveStateAndErrors() {
  CHECK(deriveState(false, true, true, true) == NodeState::Booting);
  CHECK(deriveState(true, true, true, true) == NodeState::Ready);
  CHECK(deriveState(true, true, false, true) == NodeState::Degraded);
  CHECK(deriveState(true, false, false, true) == NodeState::Degraded);
  CHECK(deriveState(true, false, false, false) == NodeState::Error);

  char buf[20] = "";
  CHECK(appendError(buf, sizeof(buf), "tof:no_frames"));
  CHECK_STR(buf, "tof:no_frames");
  CHECK(!appendError(buf, sizeof(buf), "imu:no_reports"));  // would not fit
  CHECK_STR(buf, "tof:no_frames");
  CHECK(appendError(buf, sizeof(buf), "a"));
  CHECK_STR(buf, "tof:no_frames,a");
}

// ------------------------------------------------------------- sensor logic

static void fillTof(int16_t d[kTofZones], uint8_t st[kTofZones], int16_t mm, uint8_t status) {
  for (int z = 0; z < kTofZones; z++) {
    d[z] = mm;
    st[z] = status;
  }
}

static bool central(int z) {
  int r = z / 8, c = z % 8;
  return r >= 2 && r <= 5 && c >= 2 && c <= 5;
}

static void testTofSummary() {
  int16_t d[kTofZones];
  uint8_t st[kTofZones];

  fillTof(d, st, 1000, 5);
  TofSummary s = summariseTof(d, st);
  CHECK(s.valid && s.distanceMm == 1000 && s.centralValid == 16 && s.totalValid == 64);

  // Status 9 is also valid; anything else is not.
  fillTof(d, st, 800, 9);
  CHECK(summariseTof(d, st).valid);
  fillTof(d, st, 800, 4);
  s = summariseTof(d, st);
  CHECK(!s.valid && s.totalValid == 0);

  // Edge zones never affect the value, even if they are nearer.
  fillTof(d, st, 900, 5);
  for (int z = 0; z < kTofZones; z++)
    if (!central(z)) d[z] = 100;
  CHECK(summariseTof(d, st).distanceMm == 900);

  // A minority of outlier central zones does not move the median.
  fillTof(d, st, 1500, 5);
  int outliers = 0;
  for (int z = 0; z < kTofZones && outliers < 5; z++)
    if (central(z)) {
      d[z] = (outliers % 2) ? 50 : 4000;
      outliers++;
    }
  CHECK(summariseTof(d, st).distanceMm == 1500);

  // Even count: rounded mean of the two middle values.
  fillTof(d, st, 0, 0);
  int zs[] = {18, 19, 20, 21};
  int16_t mm[] = {100, 200, 301, 400};
  for (int i = 0; i < 4; i++) {
    d[zs[i]] = mm[i];
    st[zs[i]] = 5;
  }
  s = summariseTof(d, st);
  CHECK(s.valid && s.distanceMm == 251 && s.centralValid == 4);

  // Fewer than 4 valid central zones: invalid, however many edge zones are valid.
  fillTof(d, st, 700, 0);
  int n = 0;
  for (int z = 0; z < kTofZones; z++) {
    if (!central(z)) st[z] = 5;
    else if (n < kTofMinCentralValid - 1) {
      st[z] = 5;
      n++;
    }
  }
  s = summariseTof(d, st);
  CHECK(!s.valid && s.centralValid == 3 && s.totalValid == 51);

  // A zero/negative distance with a "valid" status is not used.
  fillTof(d, st, 0, 5);
  CHECK(!summariseTof(d, st).valid);
}

static void testAutoGain() {
  const float fs = (29 + 1) * (599 + 1.0f);  // 18000, bench ATIME/ASTEP
  AutoGain g{9};

  // In range: valid, no change.
  AutoGain::Result r = g.update(9000, fs, false);
  CHECK(r.valid && !r.gainChanged && g.gainIdx == 9);

  // Too dark: step up, and the next reading is discarded whatever it is.
  r = g.update(100, fs, false);
  CHECK(!r.valid && r.gainChanged && g.gainIdx == 10);
  r = g.update(9000, fs, false);
  CHECK(!r.valid && !r.gainChanged && g.gainIdx == 10);
  r = g.update(9000, fs, false);
  CHECK(r.valid && !r.gainChanged);

  // Saturated by count or by the ASAT flag: step down, then discard one.
  r = g.update(17000, fs, false);
  CHECK(!r.valid && r.gainChanged && g.gainIdx == 9);
  CHECK(!g.update(9000, fs, false).valid);
  r = g.update(9000, fs, true);
  CHECK(!r.valid && r.gainChanged && g.gainIdx == 8);

  // At the limits the gain stops; an out-of-range reading there is still invalid
  // if saturated, and valid (but dim) if dark.
  AutoGain lo{kGainIdxMin};
  r = lo.update(17500, fs, false);
  CHECK(!r.valid && !r.gainChanged && lo.gainIdx == kGainIdxMin);
  AutoGain hi{kGainIdxMax};
  r = hi.update(10, fs, false);
  CHECK(r.valid && !r.gainChanged && hi.gainIdx == kGainIdxMax);

  CHECK(gainFactor(0) == 0.5f && gainFactor(9) == 256.0f && gainFactor(12) == 2048.0f);
}

// Feeds a level sequence at one sample per 5 ms and counts presses.
static int presses(const std::vector<int> &levels) {
  Debouncer d;
  int n = 0;
  for (int l : levels) n += d.sample(l != 0);
  return n;
}

static void append(std::vector<int> &v, int level, int samples) {
  for (int i = 0; i < samples; i++) v.push_back(level);
}

static void testDebouncer() {
  std::vector<int> v;
  append(v, 1, 20);
  append(v, 0, 20);  // 100 ms press
  append(v, 1, 20);
  CHECK(presses(v) == 1);

  // Chatter on press and on release still gives one press.
  v.clear();
  append(v, 1, 10);
  for (int i = 0; i < 6; i++) v.push_back(i % 2);
  append(v, 0, 30);
  for (int i = 0; i < 6; i++) v.push_back(i % 2 ? 0 : 1);
  append(v, 1, 30);
  CHECK(presses(v) == 1);

  // A glitch shorter than the stable window is ignored.
  v.clear();
  append(v, 1, 10);
  append(v, 0, 4);
  append(v, 1, 20);
  CHECK(presses(v) == 0);

  // Five samples low (4 stable after the change) is the minimum press.
  v.clear();
  append(v, 1, 10);
  append(v, 0, 5);
  append(v, 1, 20);
  CHECK(presses(v) == 1);

  // Double tap ~300 ms apart and a held button.
  v.clear();
  append(v, 1, 10);
  append(v, 0, 16);
  append(v, 1, 44);
  append(v, 0, 16);
  append(v, 1, 20);
  CHECK(presses(v) == 2);
  v.clear();
  append(v, 1, 10);
  append(v, 0, 2000);  // 10 s hold
  CHECK(presses(v) == 1);

  // Held at boot counts once, as in the bench (the node discards presses made
  // before its BLE loop starts), and the next press counts again.
  v.clear();
  append(v, 0, 50);
  append(v, 1, 20);
  append(v, 0, 20);
  CHECK(presses(v) == 2);
}

static void emitSamples() {
  char buf[kMeasurementMax];
  size_t n;
  n = buildDeviceInfo(buf, sizeof(buf), "lg-node-441bf6ca6e64", "0.1.0", "esp32s3-n16r8-eval");
  printf("device_info\t%.*s\n", (int)n, buf);
  printf("measurement\t%s\n", measurement(42, validMeasurement()).c_str());
  printf("measurement\t%s\n", measurement(4294967295u, widestMeasurement()).c_str());
  MeasurementSnapshot m = validMeasurement();
  m.tofValid = m.imuValid = m.spectralValid = false;
  printf("measurement\t%s\n", measurement(1, m).c_str());
  m = validMeasurement();
  m.spectralGain = 0.5f;
  m.spectral[0] = 1.0f / 2048.0f;
  printf("measurement\t%s\n", measurement(2, m).c_str());
  n = buildSaveEvent(buf, sizeof(buf), 43, 12500);
  printf("event\t%.*s\n", (int)n, buf);
  const StatusSnapshot statuses[] = {
      {10, NodeState::Booting, false, false, false, nullptr},
      {12600, NodeState::Ready, true, true, true, nullptr},
      {1, NodeState::Degraded, true, false, true, "imu:no_reports"},
      {1, NodeState::Error, false, false, false,
       "tof:init_failed,imu:init_failed,spectral:init_failed"},
      {1, NodeState::Ready, true, true, true, "unsupported_command:identify"},
  };
  for (const StatusSnapshot &s : statuses) {
    n = buildStatus(buf, sizeof(buf), 44, s);
    printf("status\t%.*s\n", (int)n, buf);
  }
}

int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "--emit-samples") == 0) {
    emitSamples();
    return 0;
  }
  testMeasurementExample();
  testMeasurementInvalidFieldsArePlaceholders();
  testMeasurementNonFiniteNeverValid();
  testMeasurementGainFormatting();
  testSpectralPrecision();
  testMeasurementWorstCaseFits();
  testBuilderRejectsSmallBuffer();
  testStatus();
  testEventAndDeviceInfo();
  testCommands();
  testDeriveStateAndErrors();
  testTofSummary();
  testAutoGain();
  testDebouncer();
  printf("%d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
