# Lean Prototype Database Design

**Status:** CONFIRMED logical design; not an implemented database or executable schema.
**Decision:** ADR-012 in [DECISIONS.md](../DECISIONS.md).
**Scope:** Measure → Save → Recreate application prototype.
**Engineering priority:** The native Android/ARCore Phase-0 positioning experiment remains first. This document does not require a full application backend before that gate passes.

## Decision

Use seven core application tables with structured, versioned scene snapshots. Preserve the information required for trustworthy recreation without separate tables for every light, measurement or calibration.

This supersedes the earlier conversation proposal for separate scene_objects, measurements, calibrations, equipment_kit_items and setup_version_images tables in the first application prototype. No existing database or data is deleted by this documentation decision.

Seven is the application-domain starting point, not a promise that authentication, local synchronisation infrastructure or provider-managed services require no additional tables.

## Core tables

| Table | Responsibility |
|---|---|
| profiles | User preferences, experience level and display units; linked to the authentication identity when accounts are enabled. |
| equipment | Reusable user-owned camera, lens, light and modifier inventory. |
| shoots | Photography sessions, category, status and notes. |
| setups | Reusable setup identity, ownership, title and current-version reference. |
| setup_versions | Exact saved scene snapshots, parent-version lineage and snapshot-format version. |
| images | Photograph metadata and cloud object references; image bytes remain in file/object storage. |
| recreations | Attempts against a specific setup version, associated shoot, captured actual state, applied tolerances, outcome and feedback. |

Authentication identities are not a custom password table. Guest operation must not depend on an authenticated cloud identity.

## Relationships and historical integrity

- A setup has multiple versions; a recreation references the exact version attempted, never a moving latest-version target.
- Scene objects and captured measurements belong inside the setup-version snapshot.
- A recreation stores its actual-state snapshot separately from the original target.
- Equipment inventory references enable reuse, but historical equipment names/specifications/settings needed for recreation are copied into the snapshot. Later inventory edits must not rewrite old setups.
- Image IDs and their roles can be referenced from setup/recreation snapshots. Reference validation and safe media deletion remain required even without a separate image-link table.
- Shoots organise actual photography sessions; reusable setups are not permanently restricted to one shoot.
- Stable scene-object and node IDs support multiple lights in the format, while engineering validation begins with one node.

## Structured scene snapshot

Use a defined, validated JSON structure, not arbitrary free-form JSON. Include a schema_version so future format changes can be migrated deliberately.

The snapshot preserves, when available:

- subject/studio reference-frame identity and coordinate conventions;
- light, camera, subject and background objects with stable IDs;
- positions and orientations in a documented, platform-neutral representation;
- distance/depth, orientation and spectral observations;
- manual power settings, camera settings, modifiers and equipment context;
- measurement units, sources and timestamps;
- quality, validity and uncertainty when known;
- device identity, firmware and calibration/mounting context needed to interpret captured measurements;
- manual corrections without silently losing the original observation;
- photograph references and their roles.

Do not store native ARCore/ARKit runtime objects as portable product data. Missing, unsupported, stale or invalid readings must not become fake zero measurements.

Matching tolerance is not sensor accuracy. Record the tolerances used for an attempt so later changes to defaults cannot change historical results. Coordinate conventions, orientation representation and field validation are now specified in [Database Schema v1](DATABASE_SCHEMA.md); implementing and testing them is still required.

## Local-first persistence and sync

The existing architecture proposes SQLite locally and optional Supabase PostgreSQL/image storage after Phase 0. This logical design does not turn those future services into a Phase-0 dependency.

Keep local operational records separately for:

- pending sync operations, unique operation IDs and retry state;
- last-synchronised revisions/cursors and conflict state;
- local image paths and media transfer status;
- current remembered-node configuration and calibration.

The local operational table layout is specified in [Offline Sync v1](OFFLINE_SYNC.md). Local filesystem paths must not become cloud-portable image locations.

Core safeguards:

1. Autosave into a working draft. Completed versions are immutable; further edits create a new draft/version.
2. Preserve divergent setup edits as separate versions. The owner chooses the current version; last-write-wins must not silently discard a scene.
3. One owner per setup. Enforce ownership in cloud data access when enabled, not only in the interface.
4. Guest work remains local until explicitly attached to an account, preserving IDs and data.
5. Deleted setups enter Trash for 30 days. Permanent deletion, media cleanup and sync tombstones need a coordinated implementation.
6. A long-offline client must not resurrect deleted data. Tombstone retention or mandatory full resynchronisation must be specified before sync is shipped.
7. Keep local originals by default; uploading an optimised image is not permission to delete the original.
8. Store confirmed measurement snapshots by default, not an indefinite record of every BLE update.

Bounded diagnostic/trial logging remains permitted where the Phase-0 test plan requires it. Reducing routine telemetry storage does not remove validation evidence.

## Deferred or combined

| Earlier component | Prototype treatment |
|---|---|
| scene_objects and measurements tables | Structured scene snapshots inside versions and recreation results. |
| calibration history table | Captured calibration context inside measurement snapshots; current configuration locally. |
| equipment_kits and equipment_kit_items | Defer reusable kit feature; select equipment individually. |
| persistent fleet/device-management tables | Local remembered-node configuration plus stable identity in snapshots. |
| setup_version_images | Validated image-ID/role references in snapshots; retain images table. |
| collaboration/sharing permissions | Defer feature and dedicated tables. |
| dedicated analytics/feedback tables | Essential outcome/feedback in recreations; retain bounded validation exports. |
| AI recommendation/training-consent tables | Defer until those features exist; customer images are not used for training by default. |

## Trade-offs

This reduces joins and simplifies saving a complete, internally consistent scene. It does not remove offline-sync complexity or security obligations.

It makes independent concurrent edits to individual lights and advanced cross-setup measurement analysis less convenient. Those are acceptable prototype trade-offs, not claims that JSON removes all complexity.

A future migration can extract nested data into tables if demonstrated needs justify it. Preserve stable IDs and snapshot-format versions to make that possible.

## Detailed implementation specification

The two follow-on specifications now define the baseline:

- [Database Schema v1](DATABASE_SCHEMA.md): exact domain fields, types, constraints, snapshot format, coordinate conventions and access rules.
- [Offline Sync v1](OFFLINE_SYNC.md): local-save transactions, account attachment, revisions, conflict procedures, media, Trash, tombstones, retries and acceptance tests.

See ADR-013 in [DECISIONS.md](../DECISIONS.md). Seven core tables remain unchanged; local/server operational sync tables are explicitly additional infrastructure.

## Remaining implementation and verification

- Write versioned SQLite/PostgreSQL migrations and runtime JSON validators.
- Implement the specified transactional mutations, private storage access and owner checks.
- Implement and test the local outbox, conflict UI, guest attachment and media retry worker.
- Test rollback, backup/recovery, old-format migrations and every sync acceptance scenario.
- Validate spatial adapters, calibration interpretation and matching behaviour on real hardware.

The database specification is now documented. No database has been deployed and no implementation/acceptance tests are claimed passed. The native Android/ARCore positioning experiment remains the immediate engineering priority.

## Technical reference

PostgreSQL supports relational columns and structured JSON together. Its documentation recommends predictable JSON structure and explains concurrency trade-offs:
[PostgreSQL JSON document design](https://www.postgresql.org/docs/current/datatype-json.html#JSON-DOC-DESIGN).
