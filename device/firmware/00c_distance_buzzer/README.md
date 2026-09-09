> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M0c — HC-SR04 + buzzer bring-up

**Sketch:** `00c_distance_buzzer.ino`

| Part | Board |
|---|---|
| HC-SR04 VCC | **`3V3`** — ⚠️ not 5 V, see below |
| HC-SR04 GND | `GND` |
| HC-SR04 TRIG | `D2` |
| HC-SR04 ECHO | `D3` — **direct, no divider** |
| Buzzer + | `D9` |
| Buzzer − | `GND` |

**Acceptance:** distance tracks a moving hand plausibly with a low dropout rate, and one
of the two buzzer bursts is audible.

## Why ECHO needs no divider here

The module drives `ECHO` at whatever voltage it is powered at. Because VCC is **`3V3`**,
`ECHO` is a 3.3 V signal and connects straight to a GPIO. At 5 V it would need a divider.

**The two are locked together** — if VCC ever moves to 5 V, add the divider. See
`../../docs/00-BOARD.md` §3.1.

The trade is range: a standard HC-SR04 is specified for 5 V and underruns at 3.3 V; some
units will not fire at all. The **HC-SR04P** variant is rated 3.0–5.5 V. The sketch reports
a **dropout percentage** so a weak module is visible immediately.

| Symptom | Meaning |
|---|---|
| 0 valid readings | TRIG/ECHO swapped or wrong pins; or a standard module that won't run at 3V3 |
| >25% dropouts | underpowered standard module — usable, but characterise the range limit |
| Distance reads `-1` | timeout. Reported as `-1`, never `0` — the contract says a missed read is null, and the app would believe a zero |

## The buzzer test identifies the type by ear

| Audible | Type | Consequence |
|---|---|---|
| Burst 1 only (tone sweep) | **passive** | must use `ledcWriteTone` |
| Burst 2 only (steady HIGH) | **active** | `digitalWrite` is enough |
| Both | **active** | also responds to the PWM carrier |
| Neither | not working | wrong pin, not wired, or needs a transistor |

> ⚠️ **The ESP32 Arduino core has no `tone()`.** Passive buzzers need LEDC. Any tutorial
> using `tone()` will not compile here.

> **Scope:** the buzzer is not in the v2 contract — `../../docs/03-OPEN-DECISIONS.md` **D6**.
> The HC-SR04 *is* (distance is a core channel).
