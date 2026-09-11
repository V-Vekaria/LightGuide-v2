# Codex application implementation and validation

Date: 11 September 2026. Branch: `codex/offline-mobile-app`. Baseline: `56e9603`.

The user requested an independent Codex build for comparison with Claude's implementation. This branch must not be merged into `main` or another implementation without that comparison decision. Mobile application ID is `com.lightguide.codex`; the separate measurement harness is `com.lightguide.codex.phase0`.

## Implemented

- React Native/TypeScript/Expo Router application under `apps/mobile/`.
- Actual SQLite migrations, seven domain tables and isolated guest workspace; local drafts/media/settings infrastructure; parameterised SQL and strict input/snapshot validation.
- Capture, local photo copying/optimisation, multiple lights, equipment and camera settings, lightweight shoots, search, version history and competing scene-version preservation.
- Manual recreation against an immutable target version; original/new photographs, adjustments, active guidance time and photographer-reported outcome. Manual outcomes remain algorithmically unverifiable.
- Archive/Trash distinction, 30-day restore deadline, permanent deletion with retained shared image references and retryable media cleanup.
- Clearly labelled demonstration/simulation; invalid/stale/foreign-reference/synthetic poses cannot assert real measured matches.
- Android harness source corrections: 3 cm / 3 degree defaults, full fresh tracking, stable capture, reference/marker-width compatibility, safe reset, consistent logs and no cosmetic score.
- Local development API hardening and updated legacy test tooling.

## Executed checks

| Check | Result |
|---|---|
| Mobile TypeScript | Passed |
| Mobile SQLite/domain suite | 23 passed, including disk close/reopen and failed-transaction rollback |
| Legacy tests | 412 passed; 1 physical hardware test skipped |
| Legacy production build | Passed |
| Mobile web export | Passed |
| Android JavaScript/Hermes export | Passed after dependency fixes and source formatting |
| Expo Android prebuild | Passed; generated project uses separate package ID |
| Browser workflow tests | 3 Chromium journeys passed, including equipment/shoot/multiple-light/camera/export flows: capture/reload/versioning/offline manual outcome/Trash/restore and mobile photos/reload/simulation/invalid route. Corrected SQLite web startup/response framing and routing compatibility issues. |
| Root dependency audit | 0 known vulnerabilities after tooling updates |
| Mobile dependency audit | 0 known vulnerabilities after fixes; repeat after final lockfile |
| Native APK/JVM builds | Not yet verified; local Android SDK unavailable and Gradle download blocked |
| Physical AR/BLE/iOS checks | Not run; require actual devices |

A successful JavaScript export is not an APK or proof of native module compatibility. GitHub workflow results/artifacts must be inspected separately.

## Endpoint and security review

The new mobile application has no remote API, account endpoint, analytics upload or AI call. It does not connect to the legacy mock or firmware. Network transport and cloud authorization therefore remain unimplemented, not implicitly secure.

| Legacy mock surface | Verified behaviour |
|---|---|
| GET `/api/info` | Existing protocol/device health contract; JSON content type |
| GET `/api/setups` | Active list; strict `include_deleted=1` tombstone export |
| PUT `/api/setups/:id` | Bound path shape, required record fields, body/storage limits; atomic disk replacement |
| DELETE `/api/setups/:id` | Tombstone and empty 204 response |
| GET/POST/DELETE `/api/active` | Read/set/clear; complete finite target required; malformed JSON rejected |
| OPTIONS | Allowed local origins only |
| WS `/live` | Existing telemetry contract; hostile origin rejected, payload/client/backpressure limits |
| Unsupported route/method | 404; no catch-all mutation |

New attack tests exercise hostile origins, `null` origin, rebinding Host, oversized/malformed payloads, unsupported content types, nested route paths, hostile WebSocket upgrades and damaged store preservation. The mock now listens only on loopback and allows browser origins on localhost/127.0.0.1 ports 5173, 5174 and 8081. It is not an authenticated LAN or internet service. The unchanged legacy physical firmware is not covered by these mock security fixes.

Application tests cover SQL-injection-shaped strings as bound data, owner-field injection, invalid UUID/path/schema/number rejection, cross-setup foreign keys, immutable completed evidence and image cleanup references. Images are locally selected and re-encoded; no arbitrary remote image fetching is implemented. Native image-picker/storage permission behaviour still needs device testing.

`npm audit` is a dependency advisory check, not a penetration test or proof that all security threats are eliminated. The application uses OS/browser storage isolation, not an application-level encryption scheme. Android backups are disabled; uninstall/clear-data can destroy local work. Notes export omits image bytes and has no import UI, so it is not a complete backup.

## Web compatibility corrections

Expo SQLite's experimental web worker originally used a CPU-dependent loop-count timeout and wrote a response length through an 8-bit array. A source-checked postinstall patch uses elapsed time and a 32-bit length header. Startup opens the database asynchronously before the repository is exposed. The router keeps query-string's existing API while a small compatibility patch consumes the updated decoder's ESM default export. Native SQLite is not patched. These fixes must be reviewed on dependency upgrades; install fails on unexpected source changes.

## Delivery and physical checks

Follow [the application README](../../apps/mobile/README.md) for commands, installation and comparison steps. No hardware accuracy, new-board wiring, BLE firmware, cloud sync, iOS compatibility or commercial MVP validation is claimed. Use the exact marker assets and independent measurements in [TEST_PLAN.md](../TEST_PLAN.md) for physical trials.
