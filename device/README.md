# LightGuide ESP32

**Device-side firmware for the LightGuide v2 companion app.**
Arduino Nano ESP32 (ESP32-S3) · started 19 August 2026 · **skeleton, no firmware yet**

The app in this repo is finished and reviewed, but has only ever talked to a mock device.
This is the firmware that replaces that mock with real hardware.

---

## Read this first

**[`AGENTS.md`](AGENTS.md)** — the contract. Scope, the one rule, the milestone list, the
progress log. Start every session there.
**[`STATUS.md`](STATUS.md)** — what to do next, in one screen.

| Doc | What it holds |
|---|---|
| [`docs/00-BOARD.md`](docs/00-BOARD.md) | Verified board facts, toolchain state, **and the 5 V / ADC2 hazards — read before wiring** |
| [`docs/01-API-CONTRACT.md`](docs/01-API-CONTRACT.md) | The HTTP + WebSocket surface the firmware must serve |
| [`docs/02-MILESTONES.md`](docs/02-MILESTONES.md) | Six steps with acceptance checks |
| [`docs/03-OPEN-DECISIONS.md`](docs/03-OPEN-DECISIONS.md) | Five decisions, two of which block milestone 3 |
| [`RUN.md`](RUN.md) | Every command, in order |

## Layout

```
firmware/    one sketch per milestone, 00 → 05
docs/        the plan and the contract
tools/       host-side scripts (serial sniffing, flashing helpers)
reports/     acceptance evidence as milestones pass
```

## How this fits the repo

| Path | What it is |
|---|---|
| `../src` | the companion app — Preact, 15.89 KB gz |
| `../mock-device` | the mock this firmware replaces |
| `../.superpowers/sdd/device-contract-report.md` | **the authoritative device contract** |
| `device/` (here) | the firmware |

App and firmware are versioned together on purpose: the firmware serves the app's built
bundle from flash, so a mismatched pair is not a working product.

## Elsewhere

| Repo | What it is | Status |
|---|---|---|
| `../../LightGuide-Edge` | v1, COM683 CW2, Nano 33 BLE Sense | **Submitted and frozen — do not touch** |

> v1 is a different SoC with different pins and **no on-board sensors on this board**.
> Very little carries over — see [`docs/00-BOARD.md`](docs/00-BOARD.md) §2.
