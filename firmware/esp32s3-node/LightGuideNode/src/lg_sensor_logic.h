// Sensor-side logic that needs no hardware: the ToF distance summary, the
// AS7343 auto-gain step and the save-button debouncer. Kept pure so the host
// tests exercise the same code the node runs.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace lg {

// ---------------------------------------------------------------- ToF summary
//
// distance_mm is the median of the valid zones in the central 4x4 block of the
// 8x8 map (rows 2-5, columns 2-5, 16 zones). It is valid only when at least
// kTofMinCentralValid of those zones are valid. The median ignores a minority
// of outlier zones, and the central block keeps the reading aimed where the
// sensor points instead of at whatever the wide field of view catches at its
// edges. This is a defined summary, not a calibrated or +/-3 cm distance.
constexpr int kTofZones = 64;
constexpr int kTofMinCentralValid = 4;

// VL53L5CX target_status values treated as valid (as in the verified bench).
inline bool tofStatusValid(uint8_t status) { return status == 5 || status == 9; }

struct TofSummary {
  bool valid;
  uint16_t distanceMm;
  uint8_t centralValid;  // valid zones in the central block
  uint8_t totalValid;    // valid zones in the whole map
};

TofSummary summariseTof(const int16_t distanceMm[kTofZones], const uint8_t status[kTofZones]);

// ------------------------------------------------------------ AS7343 auto-gain
//
// Same rule as the verified bench (experiments/esp32s3-sensor-bench,
// AllSensors_Live): keep the brightest channel between 10% and 90% of full
// scale, step the gain one index at a time, and discard the first reading after
// every change because it can mix both gains. Gain index i is 0.5 * 2^i
// (0 = 0.5x ... 12 = 2048x, the AS7343 driver's as7343_gain_t order).
constexpr int kGainIdxMin = 0;
constexpr int kGainIdxMax = 12;
inline float gainFactor(int idx) { return 0.5f * (float)(1UL << idx); }

struct AutoGain {
  int gainIdx;
  int settleReads = 0;  // readings still to discard after a gain change

  struct Result {
    bool valid;        // this reading may be reported as valid
    bool gainChanged;  // caller must apply gainIdx to the sensor
  };

  // peak: largest raw count among the reported channels; fullScale:
  // (ATIME + 1) * (ASTEP + 1); analogSaturated: the sensor's ASAT flag.
  Result update(uint16_t peak, float fullScale, bool analogSaturated);
};

// ------------------------------------------------------- save-button debounce
//
// Same rule as the verified bench: sampled every 5 ms, a level counts once it
// has been identical for 4 samples (20 ms), and only a settled HIGH -> LOW
// change is a press. Returns true exactly once per press.
struct Debouncer {
  static constexpr int kStableSamples = 4;
  bool stableHigh = true, lastHigh = true;
  int same = 0;

  bool sample(bool levelHigh);
};

}  // namespace lg
