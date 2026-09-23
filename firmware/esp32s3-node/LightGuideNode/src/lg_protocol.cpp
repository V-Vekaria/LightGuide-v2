#include "lg_protocol.h"

#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include <ArduinoJson.h>

namespace lg {

const char *const kSpectralNames[kSpectralChannels] = {
    "f1_405", "f2_425", "fz_450", "f3_475", "f4_515", "f5_550", "fy_555",
    "fxl_600", "f6_640", "f7_690", "f8_745", "nir_855", "clear"};

const char *stateName(NodeState s) {
  switch (s) {
    case NodeState::Booting: return "booting";
    case NodeState::Ready: return "ready";
    case NodeState::Degraded: return "degraded";
    case NodeState::Error: return "error";
  }
  return "error";
}

namespace {

// snprintf into out+*len, tracking overflow. Once anything overflows the whole
// payload is rejected, so a partial object can never reach the radio.
struct Writer {
  char *out;
  size_t cap;
  size_t len = 0;
  bool ok = true;

  void add(const char *fmt, ...) {
    if (!ok) return;
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(out + len, cap - len, fmt, ap);
    va_end(ap);
    if (n < 0 || (size_t)n >= cap - len) {
      ok = false;
      return;
    }
    len += (size_t)n;
  }

  // JSON string with escaping; control characters are dropped.
  void addString(const char *s) {
    add("\"");
    for (; ok && *s; s++) {
      unsigned char c = (unsigned char)*s;
      if (c == '"' || c == '\\') add("\\%c", c);
      else if (c >= 0x20) add("%c", c);
    }
    add("\"");
  }

  size_t finish() {
    if (!ok || cap == 0) {
      if (cap) out[0] = '\0';
      return 0;
    }
    return len;
  }
};

const char *boolText(bool b) { return b ? "true" : "false"; }

}  // namespace

size_t buildMeasurement(char *out, size_t cap, uint32_t seq, const MeasurementSnapshot &m) {
  bool imuValid = m.imuValid && isfinite(m.rollDeg) && isfinite(m.pitchDeg) &&
                  isfinite(m.yawDeg);
  float gain = m.spectralGain;
  bool spectralValid = m.spectralValid;
  if (!(gain > 0.0f) || !isfinite(gain)) {
    gain = 1.0f;
    spectralValid = false;
  }
  for (int i = 0; spectralValid && i < kSpectralChannels; i++) {
    if (!isfinite(m.spectral[i]) || m.spectral[i] < 0.0f) spectralValid = false;
  }

  Writer w{out, cap};
  w.add("{\"v\":%d,\"type\":\"measurement\",\"seq\":%lu,\"uptime_ms\":%lu,", kProtocolVersion,
        (unsigned long)seq, (unsigned long)m.uptimeMs);
  w.add("\"distance_mm\":%u,", m.tofValid ? (unsigned)m.distanceMm : 0u);
  if (imuValid) {
    w.add("\"roll_deg\":%.2f,\"pitch_deg\":%.2f,\"yaw_deg\":%.2f,", (double)m.rollDeg,
          (double)m.pitchDeg, (double)m.yawDeg);
  } else {
    w.add("\"roll_deg\":0,\"pitch_deg\":0,\"yaw_deg\":0,");
  }
  w.add("\"tof_valid\":%s,\"imu_valid\":%s,\"spectral_valid\":%s,", boolText(m.tofValid),
        boolText(imuValid), boolText(spectralValid));
  // %g keeps 0.5 as "0.5" and whole gains as integers.
  w.add("\"spectral_gain\":%g,\"spectral\":[", (double)gain);
  for (int i = 0; i < kSpectralChannels; i++) {
    // raw / 2^k needs up to 6 significant digits to keep a 16-bit count exact
    // enough; values stay in fixed notation (min non-zero 1/2048, max 131070).
    if (spectralValid) w.add(i ? ",%.6g" : "%.6g", (double)m.spectral[i]);
    else w.add(i ? ",0" : "0");
  }
  w.add("]}");
  return w.finish();
}

size_t buildStatus(char *out, size_t cap, uint32_t seq, const StatusSnapshot &s) {
  Writer w{out, cap};
  w.add("{\"v\":%d,\"type\":\"status\",\"seq\":%lu,\"uptime_ms\":%lu,\"state\":\"%s\",",
        kProtocolVersion, (unsigned long)seq, (unsigned long)s.uptimeMs, stateName(s.state));
  w.add("\"tof\":%s,\"imu\":%s,\"spectral\":%s,\"error\":", boolText(s.tof), boolText(s.imu),
        boolText(s.spectral));
  if (s.error && s.error[0]) w.addString(s.error);
  else w.add("null");
  w.add("}");
  return w.finish();
}

size_t buildSaveEvent(char *out, size_t cap, uint32_t seq, uint32_t uptimeMs) {
  Writer w{out, cap};
  w.add("{\"v\":%d,\"type\":\"event\",\"seq\":%lu,\"uptime_ms\":%lu,\"event\":\"save_pressed\"}",
        kProtocolVersion, (unsigned long)seq, (unsigned long)uptimeMs);
  return w.finish();
}

size_t buildDeviceInfo(char *out, size_t cap, const char *deviceId, const char *fw,
                       const char *hw) {
  Writer w{out, cap};
  w.add("{\"v\":%d,\"type\":\"device_info\",\"device_id\":", kProtocolVersion);
  w.addString(deviceId);
  w.add(",\"fw\":");
  w.addString(fw);
  w.add(",\"hw\":");
  w.addString(hw);
  w.add(",\"cap\":[\"tof\",\"imu\",\"spectral\",\"save_button\"]}");
  return w.finish();
}

Command parseCommand(const uint8_t *data, size_t len) {
  Command cmd{CommandKind::Malformed, ""};
  JsonDocument doc;
  if (deserializeJson(doc, (const char *)data, len) != DeserializationError::Ok ||
      !doc.is<JsonObject>()) {
    return cmd;
  }
  JsonVariant v = doc["v"];
  if (!v.is<int>() || v.as<int>() != kProtocolVersion) {
    cmd.kind = CommandKind::UnsupportedVersion;
    return cmd;
  }
  const char *type = doc["type"];
  const char *name = doc["command"];
  if (!type || strcmp(type, "command") != 0 || !name) return cmd;

  // Keep only [a-z0-9_] so an untrusted name can be echoed in a status error.
  size_t n = 0;
  for (const char *p = name; *p && n < sizeof(cmd.name) - 1; p++) {
    char c = *p;
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_') cmd.name[n++] = c;
  }
  cmd.name[n] = '\0';

  if (strcmp(name, "request_status") == 0) cmd.kind = CommandKind::RequestStatus;
  else if (strcmp(name, "identify") == 0) cmd.kind = CommandKind::Identify;
  else cmd.kind = CommandKind::Unknown;
  return cmd;
}

NodeState deriveState(bool initDone, bool tof, bool imu, bool spectral) {
  if (!initDone) return NodeState::Booting;
  int healthy = (int)tof + (int)imu + (int)spectral;
  if (healthy == 3) return NodeState::Ready;
  if (healthy == 0) return NodeState::Error;
  return NodeState::Degraded;
}

bool appendError(char *buf, size_t cap, const char *code) {
  size_t used = strlen(buf);
  size_t need = strlen(code) + (used ? 1 : 0);
  if (used + need >= cap) return false;
  if (used) buf[used++] = ',';
  strcpy(buf + used, code);
  return true;
}

}  // namespace lg
