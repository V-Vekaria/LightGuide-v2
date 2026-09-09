> LEGACY NANO ESP32 ONLY — not the N8R8 evaluation-kit wiring, firmware or current task list. Dated status/commands below require rechecking before use. Start new work from [the current handoff](../../../CLAUDE.md) and [BOM](../../../docs/V1_BOM.md).

# M3 — SoftAP + HTTP  ⚠️ freeze gate

**Sketch:** `03_softap_http.ino` *(historical standalone placeholder; see integrated firmware)*

SoftAP on a fixed address, no captive portal. Serve the built v2 bundle from LittleFS at
`/`. Implement the `/api/*` routes.

**Acceptance:** a phone joins the AP, loads the app, and `GET /api/setups` returns the
stored library.

> 🔒 **Do not start until `../../docs/03-OPEN-DECISIONS.md` D1 and D2 are resolved.**
> This milestone makes the HTTP surface real. Changing it later means reflashing and
> re-testing everything above it.

Contract: `../../docs/01-API-CONTRACT.md` §2.
