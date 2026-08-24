# M5 — Conformance against real firmware: **PASS**

**Date:** 24 August 2026 · board `lg-206ef1313b04`, firmware `0.1.0`, protocol `1`
**Command:** `device/tools/run_hardware_conformance.ps1`
**Raw output:** `device/reports/conformance_hardware.txt`

```
Test Files  1 passed (1)
     Tests  21 passed (21)
```

The same suite the app is written against, run over real HTTP and a real WebSocket to
the board. Not the mock.

---

## What this actually proves

The interesting passes are the ones that behave fine in casual use and only bite later:

| Assertion | Why it matters |
|---|---|
| `updated_at` stored **verbatim** | A board that stamped its own clock would make every imported file look newer than what is saved, so every merge would pick the file |
| Tombstone kept and readable for backup | A deletion that cannot be exported comes back on the next restore |
| Deleted setups hidden from the ordinary list | …while still present via `?include_deleted=1` |
| Active target and tombstone coexist without leaking | The two lists genuinely differ |
| `null` brightness stays `null` | A distance-only guide must not become "target zero brightness" |
| `device_id` stable across calls | "The same device reconnected" vs "a different device answered" |
| `protocol` a number, distinct from `firmware` | The app refuses to drive a protocol it does not understand |

## The first run failed 8 of 21, and it was the harness

Worth recording, because the failures looked alarming and were not:

```
expected []        got 4 setups
expected length 1  got 3
expected length 1  got 6
```

Setups accumulating across tests. The mock starts a fresh instance per test; there is one
board and it remembers. `describeDeviceClient`'s contract says clean state is the caller's
job, and the caller was not providing it.

One failure looked different — `clears the active target explicitly` timed out at 5 s
rather than asserting wrongly — and that was tempting to chase as a routing bug. It was the
same cause: by that point the board was several hundred writes deep in a single run. With
clean state it passes in 3.9 s.

**The lesson: a test that shares state with 20 others is not evidence about firmware.** Six
of eight failures said nothing about the board, and the seventh actively misled.

## How isolation is done

`make()` wipes the board over the **USB serial console** before every test, not over HTTP.
The contract deliberately has no remote wipe — that would let anything associated with the
access point erase a customer's setups. A cable is a fair proof of physical access, and it
works regardless of which network the test runner has joined.

Cost: about 3.7 s per test, nearly all of it the wipe. Acceptable for 21 tests.

## Running it again

The board is a SoftAP with no internet, so the machine talking to it is offline for the
duration. `run_hardware_conformance.ps1` therefore does the whole thing unattended — join
the board's network, run the suite, write results here, restore the home network — with the
restore in a `finally` block so a failing test cannot strand the machine offline.
