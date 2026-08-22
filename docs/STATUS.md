# Status and handover

Written for whoever picks this up next — including a future session with no memory of
building it. [`README.md`](../README.md) covers what the app is and how to run it. This
file covers **what is unfinished, what is deliberate, and what will bite you.**

Last updated: 20 August 2026.

---

## Where it stands

The companion app is complete and verified against a mock device: **254 tests**,
`tsc --noEmit` clean, ~26 KB gzipped against a 50 KB budget.

**The ESP32 hardware does not exist yet.** Nothing here has ever run against a real board.
That is the single biggest caveat on everything below.

## Open items

**The vendored traces contain zero sensor dropouts.** `missed=1` on 0 of 1832 rows in the
source dataset. So default replay never exercises the null-reading path, even though that
path is central to the design. Use `MOCK_DROPOUT_PCT=100` to exercise it — that is how the
per-axis staleness behaviour was verified, and it is worth re-running after any change to
`src/guidance/` or `src/store/store.ts`.

**One anomalous test run, cause unconfirmed.** The suite once reported 192 of 207 with no
failure output and exit 127, with `conformance.http.test.ts` absent from the file list. Not
reproduced in 8+ subsequent runs, and the file passes repeatedly in isolation. A prior
investigation traced a similar crash to the forked worker being killed at OS level and
moved the suite to `pool: 'threads'` (see the comment in `vite.config.ts`), but the
anomaly was observed *after* that change. This repository lives inside OneDrive, whose file
locking would produce the same signature — plausible but unproven. **If you see a run
under-report, it is this. Do not assume a test genuinely failed without reading the output.**

**Tombstones accumulate forever.** Deleted setups are retained as `deleted: true` records so
deletions survive export/import and, later, sync. Nothing prunes them. At this scale
(~200 bytes per setup) it does not matter, but a device that has been in use for years will
carry every deletion it ever made. Prune only with a rule that cannot resurrect a deletion
another copy has not yet seen.

**No component tests beyond the guidance screen.** `src/ui/LiveGuidance.test.tsx` exists;
the other screens have none. Logic that could live in a pure module mostly does, but the
assembly is untested.

## Traps

**`main` is the truth, and history is preserved.** The app was merged from
`feat/companion-app` as a merge commit (`61c600e`), so all 41 commits are on `main` and the
merge can be reverted with `git revert -m 1 61c600e`.

**Two things look like dead code and are load-bearing.** `void tick.value` appears in
`src/store/store.ts` and `src/ui/LiveGuidance.tsx`. It subscribes the reader to a 500 ms
heartbeat signal. Preact signals only re-render on a *write*, and nothing writes a signal
when time merely passes — so deleting these silently breaks staleness detection, and the
app will happily display a frozen reading as live. Both are commented. Leave them.

**`TargetView` needs `guidingOnLight` passed explicitly.** `verdict.brightness_state`
cannot distinguish "this setup has no light target, nothing to verify" from "this setup
guides on light and the sensor dropped out" — both report `'unknown'`, and they must render
differently. The information genuinely is not in the verdict. Do not try to infer it.

**Staleness is per axis.** `lastGoodAt` is the *distance* clock; `lastGoodLightAt` is the
light clock. Gating one axis on the other's stamp was a real bug: it disabled the
light-capture flow whenever the ultrasonic missed, and displayed a message blaming a sensor
that was working perfectly. Use the per-axis accessors in `store.ts`.

**Light has exactly one definition of zero.** Both capture and guidance compute
`brightness - ambient` against `Reading.ambient`, the device's own estimate. An earlier
revision had capture snapshotting raw brightness as its own baseline, which made the
capture flow dead-end and guidance permanently wrong. If you change one side, change both.

## When the hardware arrives

1. Read the **Firmware requirements** block in `src/contract/types.ts`. It states frame
   cadence, why `seq`/`ts` must be unique per frame, the exact HTTP semantics including
   `?include_deleted=1`, and why `ambient` must be a maintained estimate rather than a raw
   reading.
2. Point the conformance suite at the board. `src/device/conformance.ts` is written to run
   against any `DeviceClient` unchanged; `conformance.http.test.ts` already drives it over
   real HTTP and WebSocket against the mock.
3. Expect the contract to be wrong somewhere. It has never met real firmware. When it is,
   fix the contract and the mock together — a change that lands in only one is exactly the
   drift the conformance suite exists to catch.

## Design record

- Approved spec: [`docs/superpowers/specs/2026-08-18-lightguide-companion-design.md`](superpowers/specs/2026-08-18-lightguide-companion-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-08-18-companion-app.md`](superpowers/plans/2026-08-18-companion-app.md)

The spec was rewritten after implementation to match what was actually built — the capture
model, the screen map, per-axis staleness, and the honest state of test coverage. Treat it
as current, not aspirational.
