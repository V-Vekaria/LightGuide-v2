import type { SqlDriver } from '../db/driver';
import { newUuid, nowIso } from '../domain/ids';
import type { SceneSnapshot, Setup, SetupVersion, ShootCategory } from '../domain/types';
import { validateSceneSnapshot } from '../domain/validation';

const TRASH_RETENTION_DAYS = 30;

interface SetupRow {
  id: string;
  owner_id: string | null;
  title: string;
  category: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  purge_after: string | null;
}

interface SetupVersionRow {
  id: string;
  owner_id: string | null;
  setup_id: string;
  parent_version_id: string | null;
  snapshot_schema_version: number;
  snapshot: string;
  created_at: string;
}

function rowToSetup(row: SetupRow): Setup {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    category: row.category as ShootCategory,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    purgeAfter: row.purge_after,
  };
}

function rowToVersion(row: SetupVersionRow): SetupVersion {
  return {
    id: row.id,
    ownerId: row.owner_id,
    setupId: row.setup_id,
    parentVersionId: row.parent_version_id,
    snapshotSchemaVersion: 1,
    snapshot: JSON.parse(row.snapshot) as SceneSnapshot,
    createdAt: row.created_at,
  };
}

/**
 * Creates an unpublished setup shell (no current version yet). Per M02/US02,
 * this alone is not shown as a usable capture until a version is published -
 * see publishSetupVersion.
 */
export function createSetup(
  db: SqlDriver,
  input: { title: string; category: ShootCategory; ownerId?: string | null },
): Setup {
  const id = newUuid();
  const now = nowIso();
  db.run(
    `INSERT INTO setups (id, owner_id, title, category, current_version_id, created_at, updated_at, archived_at, deleted_at, purge_after)
     VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL)`,
    [id, input.ownerId ?? null, input.title, input.category, now, now],
  );
  return getSetup(db, id)!;
}

/**
 * Publishes an immutable new version and, if the setup is still active
 * (not trashed), atomically makes it current - both in one transaction, so a
 * crash between the two is impossible and a reader never observes a
 * dangling current_version_id. Mirrors OFFLINE_SYNC.md's publish_setup_version
 * semantics (APPLIED vs BRANCH_SAVED) without the network/conflict machinery,
 * which is explicitly deferred for this offline-only delivery.
 */
export function publishSetupVersion(
  db: SqlDriver,
  input: { setupId: string; parentVersionId: string | null; snapshot: SceneSnapshot },
): SetupVersion {
  validateSceneSnapshot(input.snapshot);

  return db.transaction(() => {
    const setup = db.get<SetupRow>('SELECT * FROM setups WHERE id = ?', [input.setupId]);
    if (!setup) {
      throw new Error(`setup ${input.setupId} does not exist`);
    }
    if (input.parentVersionId && input.parentVersionId !== setup.current_version_id) {
      throw new Error(
        `parentVersionId ${input.parentVersionId} is not the current version of setup ${input.setupId} ` +
          `(current is ${String(setup.current_version_id)}); this would silently branch. Re-read the setup first.`,
      );
    }

    const versionId = newUuid();
    const now = nowIso();
    db.run(
      `INSERT INTO setup_versions (id, owner_id, setup_id, parent_version_id, snapshot_schema_version, snapshot, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [versionId, setup.owner_id, input.setupId, input.parentVersionId, JSON.stringify(input.snapshot), now],
    );

    const setupIsActive = setup.deleted_at === null;
    if (setupIsActive) {
      db.run('UPDATE setups SET current_version_id = ?, updated_at = ? WHERE id = ?', [versionId, now, input.setupId]);
    }

    return getVersion(db, versionId)!;
  });
}

export function getSetup(db: SqlDriver, id: string): Setup | undefined {
  const row = db.get<SetupRow>('SELECT * FROM setups WHERE id = ?', [id]);
  return row ? rowToSetup(row) : undefined;
}

export function getVersion(db: SqlDriver, id: string): SetupVersion | undefined {
  const row = db.get<SetupVersionRow>('SELECT * FROM setup_versions WHERE id = ?', [id]);
  return row ? rowToVersion(row) : undefined;
}

export function getCurrentVersion(db: SqlDriver, setupId: string): SetupVersion | undefined {
  const setup = getSetup(db, setupId);
  if (!setup?.currentVersionId) return undefined;
  return getVersion(db, setup.currentVersionId);
}

/** Newest first. A setup's full, immutable history - see M2's "preserve immutable target versions". */
export function listVersions(db: SqlDriver, setupId: string): SetupVersion[] {
  return db
    .all<SetupVersionRow>('SELECT * FROM setup_versions WHERE setup_id = ? ORDER BY created_at DESC', [setupId])
    .map(rowToVersion);
}

export interface ListSetupsFilter {
  query?: string;
  includeArchived?: boolean;
  onlyTrashed?: boolean;
}

/** Search/open per M06. Trashed setups are excluded unless onlyTrashed is set - archive and Trash are always distinct views, never merged. */
export function listSetups(db: SqlDriver, filter: ListSetupsFilter = {}): Setup[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.onlyTrashed) {
    clauses.push('deleted_at IS NOT NULL');
  } else {
    clauses.push('deleted_at IS NULL');
    if (!filter.includeArchived) {
      clauses.push('archived_at IS NULL');
    }
  }
  if (filter.query) {
    clauses.push('title LIKE ?');
    params.push(`%${filter.query}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .all<SetupRow>(`SELECT * FROM setups ${where} ORDER BY updated_at DESC`, params)
    .map(rowToSetup);
}

export function renameSetup(db: SqlDriver, id: string, title: string): void {
  db.run('UPDATE setups SET title = ?, updated_at = ? WHERE id = ?', [title, nowIso(), id]);
}

export function archiveSetup(db: SqlDriver, id: string): void {
  db.run('UPDATE setups SET archived_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), id]);
}

export function unarchiveSetup(db: SqlDriver, id: string): void {
  db.run('UPDATE setups SET archived_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]);
}

/**
 * Soft-deletes into Trash with a 30-day purge window (OFFLINE_SYNC.md
 * section 9). STATUS: the retention window is recorded; there is no
 * background purge worker in this delivery, so purge_after currently has no
 * enforcement effect - a trashed setup stays recoverable indefinitely until
 * that worker exists. This is a deliberate, documented gap, not a bug.
 */
export function trashSetup(db: SqlDriver, id: string): void {
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  db.run('UPDATE setups SET deleted_at = ?, purge_after = ?, updated_at = ? WHERE id = ?', [
    now.toISOString(),
    purgeAfter.toISOString(),
    now.toISOString(),
    id,
  ]);
}

export function restoreSetup(db: SqlDriver, id: string): void {
  db.run('UPDATE setups SET deleted_at = NULL, purge_after = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]);
}
