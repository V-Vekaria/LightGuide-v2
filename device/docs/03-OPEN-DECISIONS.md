> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../CLAUDE.md) and [BOM](../../docs/V1_BOM.md).

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

## ✅ D6 — Device-side I/O — **RESOLVED, and it was never really open**

Buzzer (`D9`), switch (`D7`) and the on-board RGB are all implemented and match v1.

**Settled 23 August by the user restating the framing: v2 is v1 upgraded, not a new
product.** That dissolves the question. These are v1 features being carried forward, so
they never needed to be justified against the app's architecture — the app is the addition,
not the baseline.

The concern that produced this item was that device-side feedback duplicates the app's
verdict logic. It does compute locally, but it computes against **the target and tolerance
the app sent**, so the policy still lives in one place: change a tolerance in the app and
the board's screen, buzzer and LED all follow with no reflash. Nothing derived on the device
is ever sent back, so the app remains the only thing that words a verdict for a customer.

What v2 adds is *where the target comes from*: v1 had only the button hold, v2 has that and
the phone.

---

## Decision log

Append the outcome here as each is settled — date, decision, and reason.

| Date | ID | Decision | Reason |
|---|---|---|---|
| 2026-08-20 | — | ~~Install Arduino IDE 2.x~~ → **register `nanoesp32.inf` from the core instead** | The IDE turned out to be already installed and ships no driver. The correct driver was in the ESP32 core's `drivers/` folder all along, just never registered. `pnputil /add-driver … /install`, elevated. `docs/00-BOARD.md` §5. |
| 2026-08-19 | — | *(superseded)* Install Arduino IDE 2.x for the DFU driver | M1 sensor bring-up is many flash cycles, not a handful. The `B1` jumper route works but costs a minute per flash. Installing the driver once removes it permanently. Not a D1–D5 item; recorded here because it is a standing decision about how we work. |
