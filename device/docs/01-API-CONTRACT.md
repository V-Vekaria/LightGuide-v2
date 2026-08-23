# 01 — Device API contract

> ## ⚠️ This file is NOT the contract. It is a pointer.
>
> **The authoritative firmware-facing spec is, in two parts:**
> **`../../.superpowers/sdd/device-contract-report.md` §1** — the setup library, the
> active target and the live feed.
> **`../../.superpowers/sdd/device-connection-report.md` §1** — `GET /api/info`: identity,
> firmware version, protocol version and per-sensor health.
>
> Read both before writing any endpoint. Between them they state every route, status code
> and validation rule, with the reasoning for each.

**Why a pointer and not a copy:** on 20 August 2026 this file *was* a copy, written from
`progress.md`. The app had moved on, `progress.md` had been superseded, and the copy was
wrong — it listed two settled decisions as still open and described `POST /api/active`
behaviour the app no longer used. Nobody had done anything careless; a duplicated spec
simply drifts. So this file holds only what is *specific to implementing it on the ESP32*,
and defers everything else.

---

## 1. Surface summary — orientation only, not normative

| Route | Notes |
|---|---|
| `GET /api/info` | identity + firmware + **protocol** + sensor health; must answer even when everything else is broken |
| `GET /api/setups` | active only, tombstones omitted |
| `GET /api/setups?include_deleted=1` | everything; **any other value → `400`** |
| `PUT /api/setups/:id` | **store `updated_at` verbatim**; `deleted: true` is a legal body |
| `DELETE /api/setups/:id` | `204`; tombstones, device stamps `updated_at` |
| `POST /api/active` | complete `Target` only; **`{}` or empty → `400`** |
| `DELETE /api/active` | `204`; the only way to clear |
| `GET /api/active` | `{"target": Target｜null}` — envelope, not a bare target |
| `GET /api/ambient` | `{"ambient": 0..1}` |
| `WS /live` | `{distance_cm, brightness, ambient, seq, ts}` |

## 2. The three rules most likely to be got wrong in firmware

**1. Never re-stamp `updated_at` on `PUT`.** Last-write-wins is decided by the timestamp the
*writer* chose. A device that stamps its own clock makes every imported file look newer than
what is stored, so every merge picks the file. Take the body's value verbatim.

**2. A missed sensor read is `null`, never `0`.** The app believes a `0`. Our own bring-up
already leaned on this: `firmware/01_sensor_check` returns `-1.0` internally precisely so it
can never be confused with a real zero.

**3. `?include_deleted` must be strict.** Absent, or exactly `1`. Reject anything else with
`400`. A firmware that treated `?include_deleted=true` as "off" would hand back a
tombstone-free list, and the app would write a backup that silently resurrects deletions —
the exact bug the parameter exists to prevent.

## 3. Hardware facts the contract depends on

Established during bring-up; see `reports/M1_sensor_check_acceptance.md`.

- `brightness` and `ambient` are **0..1 fractions of sensor range**, not lux. The LDR spans
  **7–4095 (99.8% of the ADC)**, so `raw / 4095.0` maps directly and the contract's `0.08`
  tolerance sits ~65× above the ±5-count noise floor.
- `ambient` is the **shared zero for the whole brightness axis** — the device maintains it
  continuously, not only during capture. Getting this wrong caused the only CRITICAL bug in
  the v2 branch review, and it fails silently as a disabled button rather than an error.
- `distance_cm` is centimetres. The HC-SR04 reports **no target as a ~130 ms HIGH pulse** —
  map that to `null`. See `docs/00-BOARD.md` §4c.

## 4. Division of responsibility — settled, do not revisit

> **The device measures; the app computes.**

No verdicts, deltas or instruction wording in firmware. Guidance copy and tolerances change
without reflashing. This is why the buzzer is still an open question (**D6**) rather than an
obvious feature.
