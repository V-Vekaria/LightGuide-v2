# M2 — LittleFS store

**Sketch:** `02_littlefs_store.ino` *(not written yet)*

Mount/format LittleFS. Store `Setup` objects as JSON (~200 B each). Soft delete sets the
`deleted` flag — **never erase the record**; tombstones are what make restore correct.

**Acceptance:** write setups, pull USB, reboot, read them back byte-identical.

Type definition lives in `../../../../../src/contract/types.ts`. Do not restate it.
