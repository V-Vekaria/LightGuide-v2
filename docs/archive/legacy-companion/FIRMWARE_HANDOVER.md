> ARCHIVED HISTORY — not current instructions, not current hardware status, and not a task to execute.
> Original path: `device/AGENTS.md`. Original text below is preserved verbatim; its relative references and dated status statements belong to that original context.
> For current work use [the repository handoff](../../../CLAUDE.md) and [documentation map](../../DOCUMENTATION_MAP.md).

# AGENTS.md — LightGuide ESP32 firmware

> **This file is the contract. Read it first, every session, before touching anything else.**
> The job is one thing: **make an Arduino Nano ESP32 serve the device API that
> this repo's app already speaks.** Anything that is not on the milestone list in
> §5 is out of scope until the list is finished.

---

## 1. Identity

| Field | Value |
|---|---|
| Project | **LightGuide ESP32** — device-side firmware for the LightGuide v2 companion app |
| Location | `device/` inside the **LightGuide-v2** repo — same repo as the app it serves |
| Related | `../../LightGuide-Edge` — v1, COM683 CW2, **submitted and frozen**, a separate repo and a different board |
| Board | **Arduino Nano ESP32** (ESP32-S3), FQBN `arduino:esp32:nano_nora` |
| Started | 19 August 2026 |
| Status | **Skeleton only.** No firmware written yet. |

---

## 2. Why this folder exists

The app was built and reviewed to completion against a **mock device**
(`../mock-device/server.mjs`). The spec deferred the real firmware
explicitly — *"ESP32 firmware (when devices arrive)"*. The device has now arrived.

This folder is where the firmware gets written.

**It lives in the same repo as the app, deliberately.** The two ship as one product — the
firmware serves the app's built bundle from flash, so neither is usable alone — and they
share a contract. An earlier attempt to keep firmware in its own repo produced exactly the
predictable failure: the contract doc here became a *copy* of the app's spec, drifted, and
wrongly reported two settled decisions as still open. One repo makes that reference an
ordinary relative path that cannot go stale unnoticed.

---

## 3. The one rule

**The app is the client and it is finished. The firmware is the server and it must
conform.** Where firmware and app disagree, the app wins — unless the disagreement is
one of the open contract items in `docs/03-OPEN-DECISIONS.md`, which are the only
places the app is allowed to change.

Do not "improve" the app while working here. Do not add device features the app cannot
call. Do not re-open settled v2 design decisions.

---

## 4. Scope

### In scope
- Firmware for the Arduino Nano ESP32 implementing the device API in `docs/01-API-CONTRACT.md`
- Sensor bring-up: HC-SR04 distance, LDR brightness, ambient tracking
- LittleFS persistence of the setup library
- SoftAP + HTTP + WebSocket, serving the v2 bundle from flash
- Resolving the open contract items in `docs/03-OPEN-DECISIONS.md`
- Running the v2 conformance suite against real hardware

### The framing that settles most scope questions

**v2 is v1 upgraded, not a different product.** Same job — the device tells you where to
put the light — on a new board, with a phone app added on top.

So **v1's device behaviour is the baseline, not scope creep.** The buzzer, the button
capture, the on-screen verdict and the RGB LED are v1 features carried forward. They do not
need justifying against the app's architecture; they are the product, and the app is what is
new. What v2 changes is where the *target* comes from: v1 had only the button hold, v2 has
that and the phone.

This was written down on 23 August after the question kept being re-raised as if open.

### Out of scope
- Any change to `../LightGuide-Edge` — it is submitted coursework, frozen
- New app features, UI work, or redesign in `../src` — same repo now, still not our remit
- Cloud tier, accounts, station-mode Wi-Fi (all deferred in the v2 spec)
- **The ML classifier.** v1 ran a decision tree on-board because it had to decide for itself
  what "optimal" meant. Here the app sends the target and the tolerance, so the board
  compares rather than infers — which is what lets a tolerance change without a reflash. The
  five words on screen are v1's; the mechanism behind them is not. Carrying v1's *feedback*
  forward is no argument for carrying its *inference* forward.

---

## 5. Milestones — the skeleton work tree

Each maps to a directory in `firmware/`. Work them **in order**; each one has an
acceptance check that must be observed before moving on.

| # | Milestone | Directory | Acceptance | Status |
|---|---|---|---|---|
| 0 | Board probe | `firmware/00_board_probe/` | Chip ID, flash size, PSRAM, I²C scan printed over serial | ✅ **PASS** 20 Aug (ADC re-test owed) |
| 0b | Display bring-up | `firmware/00b_display_test/` | OLED ACKs on I²C and shows the test pattern | ✅ **PASS** 19 Aug |
| 0c | Peripherals | `firmware/00c–00j/` | HC-SR04, buzzer and switch all verified | ✅ **PASS** 20 Aug |
| 1 | Sensor check | `firmware/01_sensor_check/` | Live distance (cm) and raw brightness (0..1) at ≥10 Hz, plausible values | ✅ **PASS** 20 Aug |
| 2 | LittleFS store | `firmware/02_littlefs_store/` | Setup JSON survives power cycle; library round-trips | ⬜ not started |
| 3 | SoftAP + HTTP | `firmware/03_softap_http/` | Phone joins AP, loads the v2 bundle, `/api/setups` responds | ⬜ not started |
| 4 | Live WebSocket | `firmware/04_websocket_live/` | `/live` streams valid `Reading` frames the app accepts | ⬜ not started |
| 5 | Integration | `firmware/05_integration/` | v2 conformance suite passes against the board | ⬜ not started |

**Gate on M3 — revised 20 Aug.** D1/D2/D4 turned out to be **already resolved** by the app
team; we were reading a superseded file. The real gate is different and simpler:

> **Do not start M3 until the app's device contract is frozen.**
> Authoritative source: `../.superpowers/sdd/device-contract-report.md` §1.
> A second session is still developing the app. Re-read that file at the start of every
> session that touches the HTTP surface — this project has already been burned once by a
> stale copy of it.

M0–2 are contract-independent and can proceed regardless.

---

## 6. Progress log

Append one line per session. Newest last. Never rewrite history here.

- **2026-08-19** — Folder created. Board identified on COM10 as Arduino Nano ESP32
  (`arduino:esp32:nano_nora`), enumerates OK, silent on serial (stock sketch).
  ESP32 core **not yet installed** in arduino-cli. No firmware written.

---

## 7. Session checklist

1. Read this file and `STATUS.md`.
2. Confirm the board still enumerates: `arduino-cli board list`.
3. Pick the **lowest-numbered** milestone in §5 that is not complete.
4. Do that one thing. Observe its acceptance check.
5. Update §6 and `STATUS.md` before the session ends.
- **2026-08-19 (cont.)** — ESP32 core `2.0.18-arduino.5` installed. Display added to the
  build by the user; assumed SSD1306 128×64 @ `0x3C` per v1. Wrote M0 board probe and M0b
  display test — **both compile clean** (716 KB / 320 KB, well inside 3 MB).
  **Upload is blocked:** the board's DFU interface (`MI_00`) has no Windows driver
  (`ConfigManagerErrorCode 28`), and this FQBN has no serial-upload fallback
  (`use_1200bps_touch=false`, `upload.tool=dfu-util`). See `docs/00-BOARD.md` §5.
  The failed `dfu-util` attempt also left COM10 unopenable — needs a physical replug.
  Nothing has been flashed to the board; it still runs its factory sketch.
- **2026-08-19 (cont.)** — **Upload solved.** DFU is unusable (no Windows driver) and
  double-tapping RESET does nothing on this board — DFU is always-on as `MI_00`, there is
  no mode to enter. `B1` is a *pin*, not a button. Jumper `B1`→`GND` + tap `RST` puts the
  S3 in ROM download mode as VID `303A` (Windows inbox driver, no install), and
  `tools/flash_rom.py` flashes it. **M0b display test flashed successfully** — 4 regions,
  hashes verified. Awaiting jumper removal + reset to read the I²C scan result.
  Partition scheme is `app3M_fat9M_fact512k_16MB` — a **9 MB FAT partition** for the
  bundle, against a 50 KB budget.
- **2026-08-19 (cont.)** — **M0b PASSES.** Display confirmed on the bench: SSD1306,
  **128×64, `0x3C`**, wiring correct as built (VCC→`3V3`, SDA→`A4`, SCL→`A5`).
  `reports/M0b_display_acceptance.md`. Found the panel is **dual-colour** — top ~16 rows
  yellow, rest blue, physical not addressable; treat as a fixed title band.
  Fixed an observability flaw in the sketch: the report ran once in `setup()`, so serial
  looked dead to a monitor attaching later. `loop()` now re-reports every 10 s.
  **M0 board probe is still unflashed** — the full I²C enumeration, ADC/Wi-Fi coexistence
  and partition headroom questions are all still open.
- **2026-08-20** — **Upload solved properly.** Root cause was never the IDE: the ESP32 core
  ships `drivers/nanoesp32.inf` (WinUSB, signed, targets `VID_2341&PID_0070&MI_00`) and
  never registers it. One elevated `pnputil /add-driver … /install` + replug flipped
  `Arduino DFU` from `Error 28` to `OK`. **Plain `arduino-cli upload` now works — no jumper.**
- **2026-08-20 (cont.)** — **M0 PASSES.** ESP32-S3 rev 0, 240 MHz, 16 MB flash,
  **8 MB PSRAM**. I²C clean — only `0x3C`. Partitions: `ffat` **9.375 MB** (≈600× the
  bundle budget) and **`app0`/`app1`/`otadata` present, so OTA is possible** — worth
  considering before M4/M5 to drop USB flashing from the loop.
  ⚠️ **ADC/Wi-Fi test inconclusive** — A0 is floating (LDR not wired), so 3994→122 is
  uninterpretable. Non-zero *varying* reads with the AP up imply ADC1 and no conflict,
  but that is inference. **Re-test in M1 with a real signal on the pin.**
  `reports/M0_board_probe_acceptance.md`.
- **2026-08-20 (cont.)** — **All peripherals characterised.** HC-SR04 working on `D2`/`D3`
  from `VBUS`; OLED confirmed; buzzer on `D9` is **passive, 3000 Hz via LEDC**, quiet by
  nature at 3.3 V. Two reusable lessons banked in `docs/00-BOARD.md`: **§4b** the breadboard
  `−` rail is not grounded until you ground it, and **§4c** an HC-SR04's "no target" reply is
  a **130 ms HIGH pulse**, so a short `pulseIn()` timeout makes a working module look dead.
  `reports/M0c_peripherals_acceptance.md`. **Next: M1** — wire the LDR (10kΩ pulldown on `A0`)
  and re-run the ADC/Wi-Fi coexistence test that M0 left inconclusive.
- **2026-08-20 (cont.)** — **M0 COMPLETE.** Switch verified on `D7` (debounced count tracks
  presses one-for-one). Every part on the board is now characterised and working: OLED,
  HC-SR04, buzzer, switch. `reports/M0c_peripherals_acceptance.md`.
  Implementation note carried forward: a no-target ping blocks ~130 ms, long enough to miss
  a quick button tap — poll the switch around it, or use an interrupt.
  **M1 is next and needs one part wired: the LDR with a 10kΩ pulldown on `A0`.**
- **2026-08-20 (cont.)** — **M1 started, and the ADC/Wi-Fi debt is CLOSED.** With the LDR
  fitted on `A0` (10kΩ pulldown), three Wi-Fi off/on cycles moved the reading by at most
  **7 counts in 4095 (0.17%)**. `A0` is on ADC1; the brightness channel is safe with SoftAP
  running permanently. `docs/00-BOARD.md` §3.2. LDR idles ~2854 raw (0.697 normalised) in
  room light, ±5 counts — a quiet, usable signal.
- **2026-08-20 (cont.)** — **M1 PASSES. Hardware bring-up is complete.** LDR on `A0` spans
  **7–4095 = 99.8% of the ADC range** (v1 managed 6%), rests ~2820 / 0.69 in room light with
  ±5 counts of noise, so the contract's 0.08 tolerance sits ~65× above the noise floor.
  Caveat recorded: the top **clips at 4095** under a torch — calibration must characterise the
  real usable band. `reports/M1_sensor_check_acceptance.md`.
  **Next: M2 (LittleFS). D1 and D2 must be decided before M3 freezes the HTTP surface.**
- **2026-08-20 (cont.)** — **Contract docs were stale; corrected.** `docs/01-API-CONTRACT.md`
  had been written from `progress.md`, which the app team superseded with
  `device-contract-report.md`. It listed **D1 and D2 as open when both were already solved**
  (`?include_deleted=1` strict-validated; `DELETE /api/active` plus a new `GET /api/active`),
  and D4 too (`conformance.http.test.ts` exists). Rewrote `01-API-CONTRACT.md` as a
  **pointer** to the authoritative spec rather than a copy — duplicated specs drift, which is
  exactly what happened. Only **D3** (is `GET /api/ambient` wanted?) and **D6** (buzzer/switch
  scope) remain, and D6 is the only one this project owns.
- **2026-08-24** — **M5 PASSES: 21/21 conformance against real firmware**, over real HTTP and
  a real WebSocket. `reports/M5_conformance_acceptance.md`.
  The first run failed 8 of 21 and **none of it was firmware** — setups accumulated across
  tests because the board cannot hand out a fresh instance the way the mock does. One
  failure even presented as a 5 s timeout rather than a wrong assertion, which was tempting
  to chase as a routing bug. Fixed by wiping over the USB console before every test.
  **All five milestones are now complete.**
