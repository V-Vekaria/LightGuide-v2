// LightGuide Device Protocol v2 payloads (docs/engineering/DEVICE_PROTOCOL.md).
//
// Pure C++ with no Arduino or BLE dependency, so the exact bytes the node sends
// are unit-tested on a host (firmware/esp32s3-node/test/). Every builder writes
// one complete JSON object into a caller buffer and returns its length, or 0 if
// it would not fit; a truncated object is never produced.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace lg {

constexpr int kProtocolVersion = 2;
constexpr int kSpectralChannels = 13;

// Protocol v2 channel order. The index here is the index in the "spectral" array.
extern const char *const kSpectralNames[kSpectralChannels];

struct MeasurementSnapshot {
  uint32_t uptimeMs;
  bool tofValid;
  uint16_t distanceMm;  // only meaningful when tofValid
  bool imuValid;
  float rollDeg, pitchDeg, yawDeg;  // only meaningful when imuValid
  bool spectralValid;
  float spectralGain;  // positive AS7343 gain multiplier of the represented acquisition
  float spectral[kSpectralChannels];  // raw / gain; only meaningful when spectralValid
};

enum class NodeState : uint8_t { Booting, Ready, Degraded, Error };
const char *stateName(NodeState s);

struct StatusSnapshot {
  uint32_t uptimeMs;
  NodeState state;
  bool tof, imu, spectral;  // sensor health (initialised and producing data)
  const char *error;        // nullptr serialises as JSON null
};

// Buffer sizes that hold the largest payload each builder can produce. The
// host tests assert the worst case fits, and the node refuses to notify a
// payload larger than the negotiated ATT MTU - 3.
constexpr size_t kMeasurementMax = 448;
constexpr size_t kStatusMax = 256;
constexpr size_t kEventMax = 96;
constexpr size_t kDeviceInfoMax = 192;
constexpr size_t kErrorTextMax = 96;

// Unavailable data is never sent as if valid: when a validity flag is false the
// matching fields are written as 0 placeholders (spectral: thirteen 0s). Non-
// finite inputs also force the flag false. spectralGain must be positive; a
// non-positive or non-finite gain is replaced by 1 and spectral marked invalid.
size_t buildMeasurement(char *out, size_t cap, uint32_t seq, const MeasurementSnapshot &m);
size_t buildStatus(char *out, size_t cap, uint32_t seq, const StatusSnapshot &s);
size_t buildSaveEvent(char *out, size_t cap, uint32_t seq, uint32_t uptimeMs);
size_t buildDeviceInfo(char *out, size_t cap, const char *deviceId, const char *fw,
                       const char *hw);

// Commands written by Android to the Command characteristic.
enum class CommandKind : uint8_t {
  RequestStatus,
  Identify,
  Unknown,             // well-formed v2 command we do not implement
  UnsupportedVersion,  // "v" missing or not 2
  Malformed,           // not a JSON object, wrong "type", or no "command" string
};

struct Command {
  CommandKind kind;
  char name[25];  // sanitised command name ([a-z0-9_], truncated) for error reporting
};

Command parseCommand(const uint8_t *data, size_t len);

// Node state from sensor health, per protocol section 7.
NodeState deriveState(bool initDone, bool tof, bool imu, bool spectral);

// Append "a,b" style error codes into a bounded buffer. Returns false (and
// leaves the buffer unchanged) if the code would not fit.
bool appendError(char *buf, size_t cap, const char *code);

}  // namespace lg
