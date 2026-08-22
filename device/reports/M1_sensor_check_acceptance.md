# M1 — Sensor check: **PASS**

**Date:** 20 August 2026 · `firmware/01_sensor_check`

---

## Acceptance

| Criterion | Result |
|---|---|
| Distance tracks a moving hand plausibly | ✅ verified (M0e/M0f, live readout) |
| Missed reads report null, never `0` | ✅ `-1.0` internally, mapped to null |
| Shading the LDR drops brightness | ✅ verified |
| ADC survives SoftAP coming up | ✅ **PASS** — worst deviation 7/4095 |
| Pin map frozen | ✅ `docs/00-BOARD.md` §4 |

## Brightness channel — excellent dynamic range

| Measure | Value |
|---|---|
| Fully shaded | **7** |
| Phone torch | **4095** (saturated) |
| **Usable span** | **99.8% of the ADC range** |
| Resting, room light | ~2820 (**0.69** normalised) |
| Noise at rest | **±5 counts** (~0.12%) |

The 10 kΩ pulldown was the right choice. v1 shipped 1 kΩ and got **6% of scale**, which
badly weakened the separation between under-lit, optimal and over-lit. This build gets
essentially the whole converter.

**What this means for the contract:** `DEFAULT_BRIGHTNESS_TOL = 0.08` is 8% of full scale
≈ **328 counts**, against ±5 counts of noise — a signal-to-tolerance ratio of ~65:1. The
default tolerance is comfortably meaningful and needs no rescaling.

Resting at 0.69 also leaves headroom in both directions, so a target can be set above or
below ambient without immediately hitting a rail.

### ⚠️ The top end clips

A phone torch pins the reading at **4095**. Anything brighter than that is indistinguishable
from it, so the sensor cannot tell "bright" from "much brighter" at the top of the range.

For this application that is unlikely to bite — a torch held close is far brighter than any
realistic key light at working distance — but **calibration should characterise the usable
band under actual lighting** rather than assuming the full 0–1 range is available in
practice. Worth confirming before tolerances are tuned.

## ADC vs Wi-Fi — the debt from M0, now closed

Three Wi-Fi off/on cycles with the LDR fitted: readings moved by at most **7 counts in
4095 (0.17%)**. `A0` is on ADC1 and unaffected by the radio, so the brightness channel is
safe with SoftAP running permanently. Method and reasoning in `docs/00-BOARD.md` §3.2.

## Bring-up is complete

Every sensor and output in the device contract is now proven on hardware:
distance, brightness, display — plus the buzzer and switch, which are proven but still
scope-undecided (**D6**).

**Next: M2**, LittleFS persistence. **D1 and D2 must be settled before M3** freezes the
HTTP surface.
