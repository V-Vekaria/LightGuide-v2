> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M1 — Sensor check

**Sketch:** `01_sensor_check.ino` *(source present; legacy Nano implementation)*

HC-SR04 distance in cm, LDR brightness normalised `0..1`, a first ambient estimator.
Print all three at ≥10 Hz. No networking in this sketch.

**Acceptance:** distance tracks a moving hand plausibly and monotonically; shading the LDR
drops brightness. Missed ultrasonic reads report **`null`, never `0`**.

> ⚠️ **Wire the ECHO divider before powering up.** HC-SR04 drives 5 V; the ESP32-S3 is not
> 5 V tolerant. `../../docs/00-BOARD.md` §3.1.

On passing, fill in the pin map at `../../docs/00-BOARD.md` §4 and freeze it.
