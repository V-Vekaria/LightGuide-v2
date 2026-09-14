# LightGuide branch consolidation — 14 September 2026

## User decision

The user prefers the Codex application and explicitly authorised merging useful work and deleting unnecessary branches. This supersedes the previous comparison-only restriction. Main becomes the sole maintained application baseline.

## Reviewed branch inventory

| Branch | Reviewed tip | Disposition | Recovery tag |
|---|---|---|---|
| `codex/offline-mobile-app` | `d6110136934b3b78456a90b570d58ce00885145c` | Merge the selected app/harness source; retire branch after main CI passes. | `archive/2026-09-14/codex/offline-mobile-app` |
| `docs/professional-product-stack` | `2b11c43ff3021c88b3ce12e83f4bde86e3b6ed46` | Already an ancestor of main; no unmerged changes. | `archive/2026-09-14/docs/professional-product-stack` |
| `docs/v1-architecture-freeze` | `30fc99698fa1c1afed4f97bb067a7a1f9ead20fa` | Superseded architecture snapshot; current topic documents retain the evolved decisions. Do not reapply old documents. | `archive/2026-09-14/docs/v1-architecture-freeze` |
| `experiment/phase-0-ar-positioning` | `5bc532b0d1bfd94f8f554867eec94e7403d1a7ce` | All 39 experiment files already recovered on main; only README differs from that historical snapshot. Selected Codex source adds later hardening. | `archive/2026-09-14/experiment/phase-0-ar-positioning` |
| `feat/companion-app` | `85a43f69f75d7af60ad687870bf54d0d07380edf` | Already an ancestor of main; legacy source remains in main. | `archive/2026-09-14/feat/companion-app` |
| `feat/offline-app-delivery` | `7184b71aa9e6d97138021cc44a34a0a05573b6f7` | Alternative Claude UI/data/harness implementation; user selected Codex. Preserve alternate source/tests for recovery, without mixing implementations. | `archive/2026-09-14/feat/offline-app-delivery` |

Keep main. No open pull requests were present during the initial audit. The two already-merged branches are ancestors of main; the superseded AR source was checked by blob identity. Claude's alternative has unique implementations/tests, so preserve its exact tip rather than imply its code was merged.

## Integration and verification

- Merge parent one: main at bb62073d749e9bef2e5c2f5c56456314d04d015a.
- Merge parent two: selected Codex at d6110136934b3b78456a90b570d58ce00885145c.
- Preserve Codex runtime files, package IDs, dependency lockfiles and native harness. Preserve main's latest acceptance/workflow documentation and all branch evidence reports.
- Resolve README/status/decision conflicts in favour of the new selected-main state, not the obsolete two-app instructions.
- Existing selected-source [CI run 34707182893](https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34707182893) is successful. CI is extended to main and pull requests so the integration is verified again.
- Application identity remains com.lightguide.codex, version 0.1.2/build 3; this repository operation does not reinstall or rename the user's app.

## Guarded retirement

The dated maintenance workflow runs only after the successful main push integration workflow with the matching consolidation commit message. It checks all four required jobs, the unchanged tested main tip, default branch, selected-source ancestry, branch protection and each exact reviewed tip.

All recovery tags must be created and verified before any branch deletion. A moved/protected branch or conflicting tag stops cleanup instead of deleting new work. Already-absent branches require the correct recovery tag, making reruns safe. The procedure never deletes main, tags, source files or other repositories.

Deletion is pending until the workflow and final branch/tag inspection confirm success. Recovery tags retain the complete old code/history while keeping the active branch list clean. After confirmation the one-time maintenance workflow/script can be removed; this record and recovery tags remain.

## Validation limits

Successful software/browser/native build/emulator checks do not establish physical AR accuracy, calibration, BLE integration, iOS or photographer validation. Those remain in the existing test plan and validation log.
