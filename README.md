# LightGuide v2 — Companion App

**Tell the device where you want the light. It walks you there.**

A photographer wants a light stand at a specific distance from their subject and can't
place it accurately by eye. You type a target — `50 cm` — and an ESP32 measures the live
distance and light level and guides you to it: *"Move 10.6 cm closer."*

> **Status:** the app is complete and runs today against a mock device that replays real
> recorded sensor traces. **The ESP32 hardware has not been built yet.** See
> [Firmware](#firmware) for what the board must implement, and
> [`docs/STATUS.md`](docs/STATUS.md) for what is unfinished and what will bite you.

---

## Run it

Two terminals:

```bash
npm install
npm run mock      # mock device on :8080, replaying real sensor traces at 10 Hz
```

```bash
npm run dev       # app on :5173
```

The mock stands in for the ESP32 over the same HTTP + WebSocket surface the firmware will
implement, replaying traces recorded from the predecessor project — so the live view is
exercised against genuine sensor noise rather than invented data.

```bash
npm test          # 408 tests
npm run build     # ~33 KB gzipped
```

**Exercising sensor dropout:** the recorded traces contain *zero* dropouts — `missed=1` on
0 of 1832 source rows. To exercise the null-reading path, start the mock with
`MOCK_DROPOUT_PCT=100`.

## What it does

- **Quick guide** — type a distance, get walked to it, nothing saved. The common case.
- **Setup library** — named setups worth keeping, recalled weeks later, with a one-tap
  save after a quick guide.
- **Live guidance** — a two-axis target (distance horizontal, light vertical) plus one
  instruction at a time. Distance is corrected before light, because moving the stand
  changes the light level.

Built for the actual situation: a dim studio, hands on a light stand, a phone propped a
couple of metres away. The screen is kept awake while guiding, and crossing into tolerance
fires a vibration and a chime — so you can work with your eyes on the light, not the phone.

## Architecture

Three layers with a typed contract at the hinge, so the app could be built and tested
before any hardware existed.

```
Companion app  (Vite · Preact · TypeScript)
      ↕
device/  — the typed DeviceClient contract
      ↕            ↕
InMemoryDeviceClient   HttpDeviceClient
   (tests)          (mock server, and later the real board)
```

`src/device/conformance.ts` is a shared suite every implementation must pass. It runs
against both clients today — including over real HTTP and WebSocket — and is designed to
be pointed at real firmware **unchanged** the day a board arrives.

| Area | Where |
|---|---|
| Guidance maths, stability filtering, staleness | `src/guidance/` |
| Device contract and clients | `src/device/`, `src/contract/types.ts` |
| State | `src/store/` |
| Export / import | `src/backup/` |
| Screens | `src/ui/` |
| Mock device | `mock-device/` |
| Design spec and implementation plan | `docs/superpowers/` |

## Design decisions worth knowing

**Never render a stale reading as live.** A wrong *"you're on target"* is worse than a
visible disconnect. Readings are gated per axis: a missed ultrasonic ping greys the
distance channel while the light channel keeps working.

**Light is stored above ambient, never raw.** A raw level captured at 9 pm with the blinds
shut is wrong at 2 pm the next day. Capture and guidance share one definition of zero —
`Reading.ambient`, the device's own ambient estimate.

**Guidance is filtered, not instantaneous.** Ultrasonic sensors are noisy. A rolling median
plus a deadband and hysteresis turn a reading that would change the instruction 174 times
over a noisy 20-second trace into one that changes 6 times, while a genuine 20 cm move
still lands in 300 ms.

**Export/import is the only backup.** There is no cloud tier. Exports carry deletion
tombstones, imports preview exactly what they will add, replace and delete before touching
anything, and nothing tells you a deletion can be undone — because it can't.

## Firmware

Lives in **[`device/`](device/)**, in this repo. App and firmware are versioned together
because they ship as one product: the board serves the app's built bundle from flash, so a
mismatched pair is not a working product.

**Hardware bring-up is complete** on an Arduino Nano ESP32 — display, ultrasonic distance,
LDR, buzzer and switch all verified, with measurements in `device/reports/`. The remaining
milestones are persistence, SoftAP + HTTP, the live WebSocket, and conformance on real
hardware.

Start with **[`device/AGENTS.md`](device/AGENTS.md)** (scope and milestone list) and
**[`device/STATUS.md`](device/STATUS.md)** (what to do next).

Two authoritative sources for what the board must implement, in this order:

1. **`.superpowers/sdd/device-contract-report.md` §1** — every route, status code and
   validation rule, with the reasoning
2. `src/contract/types.ts` — the **Firmware requirements** block: frame cadence, why
   `seq`/`ts` must be unique per frame, and why `ambient` must be a maintained estimate
   rather than a raw reading

`device/docs/01-API-CONTRACT.md` deliberately *points* at those rather than restating them —
it was a copy once, drifted, and reported settled decisions as open.

## Lineage

Descends from **[LightGuide Edge](https://github.com/V-Vekaria/LightGuide-Edge)** — the
COM683 Edge & Embedded Intelligence coursework that classified a lighting setup against a
captured reference on an Arduino Nano 33 BLE Sense.

v2 inverts the interaction. v1 could only compare against a reference you had physically
captured; v2 lets you *state* the target and be guided to it, so a setup can be authored
with no hardware present and is portable across boards. It reuses v1's calibration method
and replays v1's recorded traces, but shares no code — different language, different stack,
different problem.
