# AGENTS.md — start here

**LightGuide v2 is one product in one repo: a phone app and the firmware for the board it
talks to.** They ship together — the board serves the app's built bundle from flash — so
neither half is useful alone, and they are versioned together deliberately.

---

## Where to start, by what you were asked to do

| You were asked to… | Read first | Work in |
|---|---|---|
| change the app, UI, guidance logic | this file, then `README.md` | `src/` |
| write or debug **firmware** | **`device/AGENTS.md`** then `device/STATUS.md` | `device/` |
| **test** something | see the next section — "testing" means three different jobs here | — |
| change the **device API** | `.superpowers/sdd/device-contract-report.md` §1 | both sides |
| work on v1 / the coursework | **don't** — different repo, submitted and frozen | — |

## "Testing" is ambiguous here — pick the right one

| If you meant | Command / entry point | Needs hardware? |
|---|---|---|
| **App unit tests** | `npm test` — 254 tests | no |
| **Contract conformance** | `src/device/conformance.ts`, run over HTTP by `src/device/conformance.http.test.ts` | no (uses the mock) |
| **Firmware / hardware** | `device/RUN.md`, board on `COM10` | **yes — a physical Nano ESP32** |
| **Conformance on the real board** | milestone **M5**, `device/docs/02-MILESTONES.md` | **yes** |

If the request did not say which, **ask** before starting. They are days apart in effort and
two of them cannot be done without the board plugged in.

## Rules that hold everywhere

**The device measures; the app computes.** No verdicts, deltas or instruction wording in
firmware — that is what lets guidance copy and tolerances change without reflashing a board.

**The contract has one authority:** `.superpowers/sdd/device-contract-report.md` §1. Do not
restate it elsewhere. `device/docs/01-API-CONTRACT.md` is a deliberate *pointer* because it
was once a copy, drifted, and reported two settled decisions as still open.

**A missed sensor reading is `null`, never `0`.** The app believes a zero.

**`ambient` is the shared zero for the whole brightness axis** — maintained continuously by
the device, not only during capture. Getting this wrong fails silently as a disabled button,
not as an error. It caused the only CRITICAL bug in the branch review.

## State, as of 20 August 2026

- **App:** complete and reviewed, merged to `main`, 254 tests passing.
- **Firmware:** hardware bring-up **complete** — display, ultrasonic distance, LDR, buzzer
  and switch all verified on an Arduino Nano ESP32, with measurements in `device/reports/`.
  Next milestone is **M2, LittleFS persistence**.
- **M3 (SoftAP + HTTP) is gated** on the device contract being frozen, because that milestone
  makes the HTTP surface real and changing it afterwards means reflashing and re-testing
  everything above it.

## If more than one session is working here

It has happened, and it caused a real bug: firmware was briefly developed against a
superseded copy of the contract and nearly re-decided two settled questions.

**Re-read `.superpowers/sdd/device-contract-report.md` at the start of any session that
touches the HTTP surface.** Do not trust a local summary of it, including this file.
