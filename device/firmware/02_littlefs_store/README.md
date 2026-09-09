> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M2 — LittleFS store

**Sketch:** `02_littlefs_store.ino` *(historical standalone placeholder; see integrated firmware)*

Mount/format LittleFS. Store `Setup` objects as JSON (~200 B each). Soft delete sets the
`deleted` flag — **never erase the record**; tombstones are what make restore correct.

**Acceptance:** write setups, pull USB, reboot, read them back byte-identical.

Type definition lives in `../../../../../src/contract/types.ts`. Do not restate it.
