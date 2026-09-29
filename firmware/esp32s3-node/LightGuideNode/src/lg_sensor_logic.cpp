#include "lg_sensor_logic.h"

namespace lg {

TofSummary summariseTof(const int16_t distanceMm[kTofZones], const uint8_t status[kTofZones]) {
  TofSummary s{false, 0, 0, 0};
  int16_t central[16];
  int n = 0;
  for (int z = 0; z < kTofZones; z++) {
    if (!tofStatusValid(status[z]) || distanceMm[z] <= 0) continue;
    s.totalValid++;
    int row = z / 8, col = z % 8;
    if (row >= 2 && row <= 5 && col >= 2 && col <= 5) central[n++] = distanceMm[z];
  }
  s.centralValid = (uint8_t)n;
  if (n < kTofMinCentralValid) return s;

  // Insertion sort; at most 16 values.
  for (int i = 1; i < n; i++) {
    int16_t v = central[i];
    int j = i - 1;
    while (j >= 0 && central[j] > v) {
      central[j + 1] = central[j];
      j--;
    }
    central[j + 1] = v;
  }
  int median = (n % 2) ? central[n / 2] : (central[n / 2 - 1] + central[n / 2] + 1) / 2;
  s.valid = true;
  s.distanceMm = (uint16_t)median;
  return s;
}

AutoGain::Result AutoGain::update(uint16_t peak, float fullScale, bool analogSaturated) {
  bool saturated = analogSaturated || peak >= 0.9f * fullScale;
  if (settleReads > 0) {
    settleReads--;
    return {false, false};
  }
  if (saturated && gainIdx > kGainIdxMin) {
    gainIdx--;
    settleReads = 1;
    return {false, true};
  }
  if (peak < 0.1f * fullScale && gainIdx < kGainIdxMax) {
    gainIdx++;
    settleReads = 1;
    return {false, true};
  }
  // At the gain limits a reading may still be out of range.
  return {!saturated, false};
}

bool Debouncer::sample(bool levelHigh) {
  if (levelHigh == lastHigh) {
    if (same < kStableSamples) same++;
  } else {
    lastHigh = levelHigh;
    same = 0;
  }
  if (same == kStableSamples && levelHigh != stableHigh) {
    stableHigh = levelHigh;
    return !stableHigh;
  }
  return false;
}

}  // namespace lg
