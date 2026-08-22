# 03 — Open decisions

> **Corrected 20 August 2026.** This file previously listed five open items taken from
> `../../.superpowers/sdd/progress.md`. That file had been **superseded**: the app
> team resolved most of them and wrote the outcome in
> `../../.superpowers/sdd/device-contract-report.md`.
>
> Nothing here was decided by this project. They were already answered; we were reading a
> stale source. **Verify against the app repo before treating any item below as open.**

---

## ✅ D1 — Export drops tombstones — **RESOLVED**

`GET /api/setups?include_deleted=1` returns everything including tombstones; the ordinary
list keeps its no-tombstones guarantee unconditionally. The flag is **strict** — absent or
exactly `1`, anything else `400`, so a typo cannot silently produce a resurrecting backup.

Chosen as a query parameter rather than `/api/setups/all`, which would have collided with
the `/api/setups/:id` pattern.

**Cost accepted by the app team, worth knowing:** import is now a *merge*, not a snapshot
restore. A newer tombstone beats an older live copy, so re-importing yesterday's backup no
longer undoes today's deletion. Argued at length in the report §2.

## ✅ D2 — `setActiveTarget(null)` serialised to `{}` — **RESOLVED**

`DELETE /api/active` is now the only way to clear. `POST /api/active` requires a **complete**
`Target` and rejects `{}` or an empty body with `400`.

The reasoning is better than "it was ugly": the old key-counting inference meant a
**truncated request body** — a real outcome on a flaky access point — would have been read as
"stop guiding".

`GET /api/active` was added alongside, returning `{"target": …|null}`. Without a read,
clearing is untestable over the wire: firmware that accepted the `DELETE` and did nothing
would pass every test the suite could write.

## ✅ D4 — Conformance never ran over HTTP — **RESOLVED**

`../../src/device/conformance.http.test.ts` now exists and exercises the suite
against `HttpDeviceClient`.

## 🟡 D3 — Dead surface — **PARTIALLY OPEN**

`GET /api/ambient` is still **not called anywhere** in the app (`ambient` reaches it through
the WebSocket frame instead), but it remains in the contract report as a required route.

**Decide:** implement it because the contract says so, or ask the app team to drop it.
Implementing is cheap — it is one line beside a value firmware already maintains — so the
default is: implement, and do not spend a negotiation on it.

`seq` / `ts` are settled: they stay in the frame. On real hardware they are the only way to
diagnose dropped or stale frames, and the app has already had two stale-frame bugs.

## 🟡 D5 — No UI component tests — **NOT OURS**

App-side. Recorded so it is not lost; nothing for firmware to do.

## 🟡 D6 — Device-side I/O the contract has no place for

Unchanged and still genuinely open — see below. This is the **only decision this project
actually owns.**

A **buzzer** (`D9`) and a **switch** (`D7`) were wired on 20 August 2026.
**Neither is in the v2 contract**, and the same reasoning covers both.

The v2 spec settles that **"the device measures; the app computes"** — so guidance copy and
tolerances change without reflashing a board. Device-side audio puts part of the guidance
logic back on the device, which is what that split was meant to prevent: to beep at the
right moment, firmware needs the target and the tolerance, i.e. a copy of the app's verdict.

Against that: audio is the one feedback channel that works when the photographer is **not
looking at the phone** — which is most of the time while positioning a stand. That is a real
argument, not a nicety.

v1 had a working buzzer on `D9`, so the hardware is proven, and it is re-confirmed here:
**passive, driven by LEDC at 3000 Hz** (`reports/M0c_peripherals_acceptance.md`).
Nothing is blocked today.

One factor for the decision: **it is quiet.** A piezo single-ended off a 3.3 V GPIO manages
only 3.3 V p-p. Differential drive would add ~6 dB for one wire, a transistor and 5 V more
again — but if audio has to compete with a room, the phone's speaker starts well ahead.

The **switch** raises the same question from the other direction: v1 used a button to trigger
captures (`firmware/02b_button_logger`), but in v2 capture is driven from the app. A physical
button either does nothing, or it needs a device→app event path that the contract does not
currently have — the WebSocket only carries `Reading` frames *outward*.

**Decide before M4 freezes the WebSocket frame:**
- Buzzer: does the device beep on its own — accepting that duplication — or does audio belong
  to the phone, where the verdict logic already lives?
- Switch: does it earn a device→app event channel, or is it bench-only hardware?

*(An earlier draft of this item also covered a gyro. There is no gyro — the part was an
HC-SR04, which is squarely in scope as the distance channel.)*

---

## Decision log

Append the outcome here as each is settled — date, decision, and reason.

| Date | ID | Decision | Reason |
|---|---|---|---|
| 2026-08-20 | — | ~~Install Arduino IDE 2.x~~ → **register `nanoesp32.inf` from the core instead** | The IDE turned out to be already installed and ships no driver. The correct driver was in the ESP32 core's `drivers/` folder all along, just never registered. `pnputil /add-driver … /install`, elevated. `docs/00-BOARD.md` §5. |
| 2026-08-19 | — | *(superseded)* Install Arduino IDE 2.x for the DFU driver | M1 sensor bring-up is many flash cycles, not a handful. The `B1` jumper route works but costs a minute per flash. Installing the driver once removes it permanently. Not a D1–D5 item; recorded here because it is a standing decision about how we work. |
