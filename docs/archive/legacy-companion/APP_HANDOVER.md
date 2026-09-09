> ARCHIVED HISTORY — not current instructions, not current hardware status, and not a task to execute.
> Original path: `docs/STATUS.md`. Original text below is preserved verbatim; its relative references and dated status statements belong to that original context.
> For current work use [the repository handoff](../../../CLAUDE.md) and [documentation map](../../DOCUMENTATION_MAP.md).

# Legacy prototype status and handover

> **LEGACY NOTICE — 28 August 2026:** This file describes the earlier commercial prototype based on a manually entered target plus ultrasonic/LDR sensing. It is preserved for engineering reference only. It is not the current LightGuide V1 architecture. For current work, start with `../README.md`, `../CLAUDE.md`, `V1_PRODUCT_SPEC.md`, `V1_ARCHITECTURE.md`, `DECISIONS.md`, and `TEST_PLAN.md`.

The material below is retained because it documents useful implementation details, tests and failure modes of the earlier prototype.

Last legacy update: 20 August 2026.

---

## Where the legacy prototype stands

The companion app is complete and verified against a mock device: **408 tests**,
`tsc --noEmit` clean, ~33 KB gzipped.

**On the bundle budget — corrected 20 August 2026.** Earlier docs quoted a 50 KB
ceiling "because it ships from ESP32 flash". That was set before the board was known and
is wrong. The M0 probe measured **16 MB flash, 8 MB PSRAM, and a 9.375 MB `ffat`
partition** — roughly 600x the bundle. Storage is not the constraint. What *is* real is
transfer speed and RAM when serving over SoftAP: budget around **1 MB of assets per page**,
cached, and hero imagery is entirely affordable.

**The ESP32 hardware does not exist yet.** Nothing in this legacy app/contract path has been validated end-to-end against the intended commercial V1 hardware. Treat hardware claims elsewhere in old documents cautiously.

## Open items in the legacy prototype

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
under-report, do not assume a test genuinely failed without reading the output.**

**Tombstones accumulate forever.** Deleted setups are retained as `deleted: true` records so
deletions survive export/import and, later, sync. Nothing prunes them. At this scale
(~200 bytes per setup) it does not matter, but a device that has been in use for years will
carry every deletion it ever made. Prune only with a rule that cannot resurrect a deletion
another copy has not yet seen.

**No component tests beyond the guidance screen.** `src/ui/LiveGuidance.test.tsx` exists;
the other screens have none. Logic that could live in a pure module mostly does, but the
assembly is untested.

## Traps worth preserving if code is reused

**Two things look like dead code and are load-bearing.** `void tick.value` appears in
`src/store/store.ts` and `src/ui/LiveGuidance.tsx`. It subscribes the reader to a 500 ms
heartbeat signal. Preact signals only re-render on a *write*, and nothing writes a signal
when time merely passes — so deleting these silently breaks staleness detection, and the
app will happily display a frozen reading as live. Both are commented.

**`TargetView` needs `guidingOnLight` passed explicitly.** `verdict.brightness_state`
cannot distinguish "this setup has no light target, nothing to verify" from "this setup
guides on light and the sensor dropped out" — both report `'unknown'`, and they must render
differently. The information genuinely is not in the verdict.

**Staleness is per axis.** `lastGoodAt` is the distance clock; `lastGoodLightAt` is the
light clock. Gating one axis on the other's stamp was a real bug.

**Light has exactly one definition of zero.** Both capture and guidance compute
`brightness - ambient` against `Reading.ambient`, the device's own estimate. If any of this
legacy light-guidance logic is reused, capture and guidance must retain a consistent baseline.

## Legacy design record

- `docs/superpowers/specs/2026-08-18-lightguide-companion-design.md`
- `docs/superpowers/plans/2026-08-18-companion-app.md`

Treat those as records of the earlier prototype, not current architecture authority.
