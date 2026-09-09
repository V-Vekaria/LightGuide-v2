# Offline Sync Procedure v1

**Status:** Implementation specification; no sync service has been deployed or tested by this document.
**Scope:** Single-owner, local-first prototype; one active cloud-sync worker per local workspace.
**Companion:** [Database Schema v1](DATABASE_SCHEMA.md).
**Gate:** Cloud sync follows the Phase-0 experiment; manual/local recreation must not require it.

## 1. Invariants

- A successful local save means the SQLite transaction and required local media write succeeded, not that cloud backup exists.
- Product records, their pending operation and any draft transition commit atomically locally.
- Use revisions for concurrency; never compare phone wall-clock times to choose a winner.
- Retries repeat the SAME operation ID and immutable payload.
- Saved scene versions are immutable and competing edits are preserved.
- Product-data transactions and image uploads are separate; partial media upload cannot corrupt a saved setup.
- Tombstones stop old clients resurrecting deleted records.
- Do not send live BLE streams to the sync API. Confirmed snapshots and bounded evaluation evidence are enough.

## 2. Internal persistence (separate from seven product tables)

### Local SQLite

| Record/table | Required fields |
|---|---|
| sync_outbox | operation_id UUID PK, account_id NULL for guest, client_id UUID, epoch UUID NULL, local_order integer unique per workspace, action text, immutable payload JSON, payload_hash text, base_revisions JSON, depends_on UUID array, status queued/in_flight/retry/conflict/blocked, attempts integer, next_retry_at timestamp NULL, last_error_code text NULL |
| sync_state | account_id UUID PK, client_id UUID, epoch UUID, cursor bigint, last_success_at timestamp NULL |
| working_drafts | id UUID PK, entity_type text, entity_id UUID, base_revision bigint, base_version_id UUID NULL, payload JSON, updated_at timestamp, conflict_details JSON NULL |
| local_media | image_id UUID PK, original_path text NULL, optimised_path text NULL, download_path text NULL, transfer_state queued/uploading/uploaded/downloading/available/failed, retry_count integer, last_error text NULL |
| local_settings | key text PK, value JSON; guest preferences, current node/mount/calibration configuration and schema version |

A workspace is guest or one authenticated account. Tokens are held in platform-appropriate secure credential storage, not these tables. Do not reuse one user's outbox or cached files under another user's session.

Keep acknowledged cloud base rows distinct from pending drafts/outbox overlays. Pulling a new cloud revision must not overwrite unsent local work. UI reads the effective local state, labelling a conflict if the cloud base changes underneath it.

### Server operational storage when cloud sync is implemented

Two private infrastructure tables are sufficient for this baseline:

| Table | Fields and purpose |
|---|---|
| sync_heads | owner_id UUID PK, epoch UUID, last_sequence bigint, minimum_cursor bigint; serialises an owner's sync transactions and supports full-reset rules |
| sync_operations | owner_id UUID, epoch UUID, operation_id UUID, payload_hash text, sequence bigint NULL, result_code text, result_summary JSON, changes JSON, accepted_at timestamp; unique (owner_id,epoch,operation_id), and unique (owner_id,epoch,sequence) when sequence is not NULL |

changes is an array of {entity_type,id,revision,kind:upsert/tombstone}; no photographs, scene payloads, feedback or client names. result_summary contains only IDs, revisions, outcome codes and current-pointer IDs. Do not retain copies of sensitive scene/image data in a hidden log.

This is explicitly seven DOMAIN tables plus infrastructure, not seven physical tables total. Authentication/provider infrastructure is also separate.

## 3. Mutation envelope and responses

Request:
- protocol_version: 1;
- operation_id UUID, client_id UUID, epoch UUID;
- action from the allowlist below;
- base_revisions: entity IDs mapped to expected revision decimal strings (0 for create);
- payload: validated action-specific values.

Server derives owner from the authenticated token, never trusts a supplied owner_id. It computes a SHA-256 digest over a specified canonical JSON encoding of the validated request content excluding transport/auth headers. Same ID with different digest is rejected as OPERATION_ID_REUSED.

Allowlist:
- create_equipment, edit_equipment;
- create_shoot, edit_shoot;
- edit_profile;
- publish_setup_version (may create the initial setup atomically);
- edit_setup_metadata, choose_current_version;
- create_recreation, update_recreation;
- register_image, finalize_image;
- trash_record, restore_record, request_permanent_delete.

No generic arbitrary table upsert endpoint.

Terminal results:
- APPLIED: operation committed once, includes affected IDs/revisions and cursor;
- BRANCH_SAVED: version committed but setup current pointer left unchanged;
- CONFLICT: no requested mutation applied; includes conflicting IDs/current revisions;
- TARGET_DELETED: no resurrection; pending local draft preserved;
- VALIDATION_FAILED or OPERATION_ID_REUSED: needs correction with a new operation ID;
- RESET_REQUIRED: epoch/cursor no longer usable; full refresh required.

Unauthenticated requests return AUTH_REQUIRED. Retryable failures (network, rate limit, temporary server failure) are not terminal outcomes. Error messages do not disclose another owner's object existence.

## 4. Local save and initial account attachment

### Capture

1. Write photographs to app-owned durable local storage using a temporary file plus final move. If writing fails, do not report the photo saved.
2. Validate capture data; manual/photo-only snapshots may have no reference frame.
3. Autosave working_drafts locally. Do not publish a version for every keystroke.
4. On Save, seal a new version UUID, target parent/version reference, and scene snapshot.
5. Commit the locally saved version, setup pointer update and immutable queued publish operation in ONE SQLite transaction. Guest operations remain local-only until attachment.
6. Show Saved on this phone. Cloud status remains pending until acknowledged; image backup status is separate.

### Sign-up/sign-in

1. Authenticate first; ask for explicit confirmation to attach guest work to that account.
2. Open the account workspace and load its cloud profile without overwriting guest preferences.
3. Atomically copy/attach selected guest product records with unchanged product UUIDs, assign account owner IDs, move associated local-media references and build a dependency-ordered outbox. Preserve a local recovery checkpoint until attachment succeeds.
4. Existing account preferences win unless the user chooses the guest preferences. Do not overwrite cloud equipment/shoots by name.
5. Fetch epoch/cursor baseline before sending writes. Profile and referenced image metadata/records must exist before publication.
6. UUID collision with different cloud content is a conflict, not permission to overwrite. Pause and preserve the local import.

Sign-out/account switching pauses that workspace's worker. Never silently discard unsynced work. Cached private data remains isolated; removing this device's local data requires an explicit action.

## 5. Server transaction and retry safety

For each request:

1. Authenticate, enforce size/action limits and parse schema.
2. Begin database transaction; lock the owner's sync_heads row FOR UPDATE. Initialise the row through a race-safe unique owner insert if needed.
3. Verify epoch, then look up the operation receipt.
4. Same operation/digest: return the recorded outcome without applying it twice. Different digest: reject.
5. Validate ownership of every referenced record, lifecycle state, expected revisions and snapshot structure.
6. Apply the action, using action-specific conflict rules below. Increment changed mutable rows' revisions. Immutable versions are inserted once with revision 1.
7. Increment last_sequence for committed data changes; insert receipt and changed-record identifiers/tombstones in the SAME transaction. Terminal conflicts can have a NULL sequence receipt.
8. Commit, release owner lock, then return acknowledgment. Notifications, if any, are hints to pull, not the authoritative feed.

All background purge/media-finalisation mutations use the same transaction/sequence path. Direct writes that omit the feed are prohibited.

Serialisation is per owner, never global. Holding the owner row lock until commit gives commit-ordered per-owner sequences. A standalone SQL sequence allocated before commit does NOT give this guarantee.

If a response is lost after commit, the retry returns the receipt. The phone acknowledges only that operation; later edits have new IDs and remain queued. Do not overwrite a newer local/cloud revision with a stale receipt payload. On terminal APPLIED/BRANCH_SAVED, atomically remove only that acknowledged outbox item and persist the result IDs/revisions or conflict information locally. Fetch canonical rows through pull; pending successor operations/drafts remain. A crash before local acknowledgment safely repeats the same server operation.

## 6. Conflict procedures

### Competing setup edits

- Both edits carry parent_version_id and expected setup revision/current pointer.
- If setup is active and parent exists, store the incoming immutable version even if another phone already advanced the setup.
- Matching base: make the new version current and return APPLIED.
- Stale base: leave current unchanged, return BRANCH_SAVED, surface both versions.
- Choosing a current version is a separate choose_current_version operation with expected setup revision. A stale choice conflicts again; no silent overwrite.
- A combined version is a new snapshot selected/assembled by the owner. Preserve both branches; do not auto-merge individual light coordinates.
- Deleted setup: return TARGET_DELETED; preserve the pending snapshot locally. Do not save a cloud branch under a deleted parent.

### Other mutable records

For equipment, shoots, profile, setup metadata and in-progress recreation:
- expected revision must equal current;
- otherwise return CONFLICT, retain cloud base plus local candidate in working_drafts;
- owner chooses cloud, local or a manually combined value;
- accepting cloud explicitly discards the candidate only after confirmation;
- choosing local/combined queues a NEW operation against the latest revision;
- do not automatically merge fields in v1.

Completed recreation evidence cannot be overwritten; feedback changes remain revision-checked. Images cannot replace bytes in place.

A dependent operation blocks while a prerequisite conflicts or returns BRANCH_SAVED. Independent queued work may continue. For multiple offline saves, expected revisions can be calculated from the preceding queued operations' successful effects. Before sending a dependent request, verify those expected effects against its acknowledgments; if they differ, preserve the candidate and require reconciliation with a new operation ID. Never mutate an already-sent payload to rebase it.

## 7. Pull and reconnect

Trigger on app foreground, successful sign-in, connectivity recovery and explicit Retry. Background execution is best effort, not a promise of continuous connection.

1. Recover in_flight rows to retry after restart; preserve IDs/payloads.
2. Pull before push, applying cloud base changes without deleting pending overlays.
3. Push ready outbox operations in dependency order: profile/metadata parents, image metadata, setup/version publication, recreations; serialize mutations for the same entity.
4. Upload pending optimised media independently, then finalize metadata.
5. Pull again to capture concurrently accepted work.
6. Mark Synced only when domain operations are acknowledged; show image backup pending separately.

Pull request: epoch, cursor, limit (default 100 operations, maximum 500).
Within a consistent database read snapshot, capture a high-water sequence, read changed IDs after cursor up to that water, and fetch their current authorised row state. Deduplicate changed IDs within a page. Current state may include later events within that same snapshot; apply by revision and safely process their feed events again later.
Return rows, tombstones, next_cursor, has_more and epoch. Cursor advances to the last included feed event, not a phone timestamp.

Apply each page and its cursor in one local transaction. Upsert by UUID/revision, ignore already applied equal/older revisions, apply tombstones to the acknowledged base, retain unresolved local drafts. Parent/child ordering and deferred constraints must be respected.

## 8. Media procedure

1. Create optimised image locally, calculate digest/dimensions/byte size.
2. register_image creates pending metadata and returns an owner-scoped private object key, shaped ownerUUID/imageUUID/sha256.extension.
3. Upload using a scoped authenticated/signed upload mechanism; never arbitrary client-selected paths. No public bucket.
4. Retry to the same identity. Existing bytes are accepted only after digest/size verification; changed bytes require a new image ID.
5. finalize_image verifies object existence, size, type and digest using trusted server-side inspection, then records uploaded through the sync transaction.
6. Downloads use short-lived authorised access, verify digest and persist to local_media before reporting available.
7. A broken upload never deletes the original or prevents opening the scene metadata.

UI labels: Saved on this phone; Sync pending; Synced / photos pending; Fully backed up (optimised copies); Conflict; Sign in to resume; Sync failed.
Original-resolution files remaining on the phone are not claimed as cloud-backed-up.

## 9. Trash and permanent deletion

- Archive affects organisation only.
- trash_record requires expected revision. Set deleted_at to server time and purge_after to +30 days. Offline UI shows pending deletion until accepted.
- Deleted setup immediately disappears from active views; descendants are read-only and hidden through parent state. Local-only unsent setup deletion uses the device's time for its local retention.
- restore_record succeeds only before purge starts and with the expected revision. Clear both timestamps; restoring a setup reveals retained versions and attempts.
- Deleting a shoot keeps reusable setups and recreation evidence: on shoot purge set recreations.shoot_id NULL with new revisions/feed events.
- Deleting equipment preserves historical snapshot copies. On equipment purge remove its ID from shoot planning lists through revisioned updates; snapshot inventory links become unavailable but embedded details remain.
- Permanent setup deletion requires confirmation that ALL its versions and associated recreation attempts will be removed. Account deletion is separately confirmed and revokes sessions.
- Expiry or explicit permanent deletion first marks the deletion irreversible and publishes invalidation. New references, restoration and uploads for affected records are rejected.
- Purge removes target records in safe FK order, emits per-record tombstones and finds unreferenced image assets by scanning retained snapshot references. For the small beta, this scan avoids introducing an image-link table.
- Under the owner lock, mark orphan images purging before releasing it. Image reference validation rejects purging/purged assets. A retryable worker deletes their storage objects, then marks purged via sync. Only then remove metadata and emit its tombstone.
- Images still referenced by a different retained setup/attempt are kept. Explicitly deleting an individual image may invalidate those historic photo links and requires that warning.
- Keep only minimal IDs/owner/epoch/deletion evidence in tombstones/receipts, not deleted scene/photo payloads. Storage failure remains pending purge, not falsely reported as fully erased.
- Offline phones apply deletion when they reconnect; a disconnected device cannot be remotely erased immediately. Offer explicit local-data removal. Infrastructure backups follow their separately documented retention, not an instant-erasure claim.

The pending media purge state is persistent in images.upload_state; do not rely on an in-memory job to finish deletion.

## 10. Tombstone retention, reset and failures

Prototype policy: retain current-epoch receipts and minimal tombstones; no silent TTL pruning during beta. Monitor log size. This prevents forgotten clients replaying old create operations after target rows are purged.

Before compacting a feed, rotate the owner's epoch atomically under the same lock. Old-epoch writes are rejected BEFORE receipt/application logic. A stale client must:
1. preserve unsynced drafts/outbox as local recovery data;
2. download a complete owner snapshot with a cursor from the SAME consistent read snapshot;
3. atomically replace acknowledged base and sync_state, not pending drafts;
4. explicitly reconcile pending edits against the new base;
5. never automatically re-upload a missing/deleted old record as a create. Offer discard or an explicitly confirmed new setup with a new ID after reviewing the recovered data.

Use a pinned consistent snapshot for paged full exports; restarting an expired export is safer than mixing pages from different moments. The full-export transport is an implementation task; its consistency guarantee is mandatory.

Retry schedule: exponential delay starting at 2 seconds, capped at 60 seconds, with jitter. Respect Retry-After. Stop hot retries while offline/backgrounded; Retry can resume immediately.
- AUTH_REQUIRED: attempt normal token refresh once, then pause and request sign-in; do not delete local work.
- Network/5xx/rate limit: retry same ID.
- Validation/conflict/deleted target: stop that operation, show recovery action, retain candidate.
- Disk full: fail local save visibly; never show Saved.
- Unknown protocol/schema: preserve local data; request supported app version, no automatic downgrade.
- Server receipt retention and deletion jobs must never expose cross-owner state.

## 11. Acceptance tests

| Scenario | Required result |
|---|---|
| Airplane-mode capture, force close, reopen | Saved snapshot and local photos intact. |
| Crash between local version and outbox write | Entire transaction commits or rolls back; no half-save. |
| Server commits but reply is lost | Same-ID retry yields one version and original receipt. |
| Same operation ID, changed payload | Rejected without mutation. |
| Two phones publish from one parent | Both children retained; only one becomes current automatically. |
| Two devices edit equipment | Conflict preserves local candidate and cloud record. |
| Cloud pull arrives while editing locally | Pending draft is not overwritten. |
| Update races with Trash | Revision conflict or TARGET_DELETED; no resurrection. |
| Reconnect after permanent purge | Tombstone blocks old upload; local recovery remains explicit. |
| Epoch rotated while device is offline | Full refresh required before any old work is applied. |
| One of several images fails upload | Setup usable; image backup visibly incomplete; original retained. |
| Image reference races with orphan cleanup | Owner lock/lifecycle check prevents a valid reference to an asset being purged. |
| Guest attaches to existing account | Product IDs retained; no account/preferences overwrite without choice. |
| Account switches with queued uploads | No data or operations cross account boundaries. |
| Phone clock wrong / transactions commit out of order | Cursor/revision logic loses no committed change. |
| Foreign owner ID/image ID injected | Rejected with no data disclosure. |
| Parent deleted while dependent operation queued | Child blocked, not silently orphaned or uploaded. |
| Shared-by-reference image survives setup purge | Retained while another valid snapshot references it. |
| Purge storage request fails then worker restarts | Persistent purging state retries; no false deletion-complete status. |
| Capture/source is stale or frame unknown | May save evidence, never produce measured Match. |

Run these against real SQLite persistence plus the implemented PostgreSQL transaction/API, not only mocked happy-path responses. No test is claimed passed by this specification.

## Sources

The custom protocol relies on transaction/locking semantics described in [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html). Access enforcement must follow [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Supabase is not being assumed to provide this custom offline-sync protocol automatically.
