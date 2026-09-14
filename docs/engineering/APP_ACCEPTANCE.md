# LightGuide — Application Acceptance and Release Evidence

**Added 14 September 2026.** These criteria make the existing offline-app scope testable and incorporate the user's navigation, photo, layout and equipment feedback. They do not add cloud, AI or live hardware dependencies. Existing feature/stage scope in [APP_MVP_PLAN.md](../product/APP_MVP_PLAN.md) still applies.

## Requirement matrix

P0 is required when releasing the affected capability; P1 is the next usability priority. A criterion is not passed merely because it is documented. Keep software, real-phone and physical validation results separate.

| ID | Behaviour | Acceptance check | Priority |
|---|---|---|---|
| APP-01 | Navigation reuses destinations. | From Home, tap Settings four times rapidly and after transitions. One Back returns to Home. Repeat from other main tabs and an unfinished capture; draft/search state remains. Reselecting the current tab adds no history. | P0 |
| APP-02 | Completed draft work survives interruption. | Add a photo/name, navigate away and return, then force-close/reopen. Completed saved fields remain, or the user explicitly discarded them; no duplicate draft appears. | P0 |
| APP-03 | Local photo import recovers safely. | Import a supported image offline and reopen after restart. Cancel selection, deny access or use an unreadable file: no false success, lost existing fields or broken saved image reference. Record implemented format/size limits. | P0 |
| APP-04 | Layout keeps actions and text usable. | Check affected screens at default and largest supported phone text size, with keyboard open/closed. No overlap or unreachable primary action; record phone, OS and settings. | P0 |
| APP-05 | Equipment entry explains its purpose. | Add a light/modifier and associate it with a setup without inventing unknown specifications. Explain that inventory entry does not pair with or control a device. | P1 |
| APP-06 | The core local journey survives restart offline. | In airplane mode, save, force-close, reopen, search/edit, manually recreate and record the outcome. Verify durable storage rather than an in-memory mock. | P0 |
| APP-07 | Data provenance remains visible. | Unknown measurements remain unknown, not zero. Manual and simulated values cannot become sensor-measured after save/reopen/export. | P0 |
| APP-08 | Match depends on fresh, compatible measurements. | Stale/lost tracking, an invalid reference or mismatched reference identity withdraws Match; valid recovery resumes guidance. Check both sides of configured tolerance boundaries. Manual/simulation-only releases must never claim measured Match. | P0 for live guidance |
| APP-09 | Historical targets stay immutable. | Edit a setup after starting a recreation. The existing recreation retains its original target version; a new recreation may use the new version. | P0 |
| APP-10 | Visible actions report truthful results. | Save/import/export/recreate either completes, fails recoverably or explains unavailability. Repeated submission creates no duplicate records. Confirmations follow successful operations. | P0 |
| APP-11 | State is understandable without colour alone. | Tracking, match and errors have text/icons as well as colour; screen-reader labels identify primary controls. | P1 |

The Codex navigation report and successful subsequent CI are linked in [the branch evidence](../validation/BRANCH_STATUS_2026-09-14.md). They support specific automated checks, not blanket passage of this entire matrix. Retain original failure reports and link each retest to its exact build.

## Release evidence record

For each delivered build, record:

| Field | Required content |
|---|---|
| Source | Repository, branch and full commit SHA |
| Artifact | APK version name/code, package ID, build date, download reference and measured SHA-256 |
| Environment | Test device/emulator, Android version and relevant permission/font/network settings |
| Verification | Requirement ID, method/command, expected and actual result, evidence link and retest build |
| Capability | Implemented, simulated and unavailable features; physical validation recorded separately |
| Limits | Unresolved defects, unsupported actions and data-preservation/upgrade limitations |
| User retest | Installed package/version, reproduction steps, result and date |

Do not copy a checksum from an earlier APK or call a source-config version a verified installed version. Link CI results to their head commit. A successful compile is not an installation test; emulator success does not prove phone-camera behaviour or physical accuracy.

## Definition of Done

A story is software-complete when its applicable acceptance checks pass on the declared platform, offline/draft preservation works, error recovery is usable and evidence identifies the source/build. A physical capability additionally needs independent measurements under stated conditions.

An installable offline prototype, a physically validated one-light prototype and a photographer-validated MVP are separate milestones. Follow the [roadmap](../product/ROADMAP.md) and [test plan](../TEST_PLAN.md). Cloud services and artistic recommendations remain deferred.

## Security and privacy scope

Use [the existing data/sync specification](../product/OFFLINE_SYNC.md) for media, ownership, deletion and future online controls. This acceptance matrix does not replace it or certify the application free of vulnerabilities. Do not add accounts merely to satisfy a generic SRS checklist.
