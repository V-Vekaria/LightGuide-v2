/**
 * Versioned local SQLite schema.
 *
 * Local-first subset of docs/product/DATABASE_SCHEMA.md's seven domain
 * tables. Cloud-only concerns (server revision counters, RLS, upload_state
 * transitions, the sync_outbox/sync_state/working_drafts operational
 * tables) are deliberately NOT implemented - there is no backend yet, and
 * ADR-015/the M1 handoff both say not to build one as a prerequisite. What
 * IS kept, because it costs nothing locally and matters for correctness:
 * immutable setup_versions, archive vs. Trash (deleted_at/purge_after)
 * distinct from archived_at, and JSON snapshot storage with a
 * schema_version column.
 *
 * owner_id is nullable throughout: this is a guest-only local workspace
 * (OFFLINE_SYNC.md "A workspace is guest or one authenticated account");
 * there is no authentication in this delivery, so every row's owner_id is
 * NULL. The column is kept so a future sync layer does not need a schema
 * migration to add it.
 */

export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

const LIFECYCLE_COLUMNS = `
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  purge_after TEXT
`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'seven domain tables + local_settings',
    statements: [
      `CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        experience_level TEXT NOT NULL DEFAULT 'beginner',
        preferred_units TEXT NOT NULL DEFAULT 'metric',
        photography_preference TEXT NOT NULL DEFAULT 'both',
        default_tolerances TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE equipment (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        manufacturer TEXT,
        model TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        notes TEXT,
        ${LIFECYCLE_COLUMNS}
      )`,
      `CREATE TABLE shoots (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        scheduled_at TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        notes TEXT,
        planned_equipment_ids TEXT NOT NULL DEFAULT '[]',
        ${LIFECYCLE_COLUMNS}
      )`,
      `CREATE TABLE setups (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        current_version_id TEXT,
        ${LIFECYCLE_COLUMNS}
      )`,
      `CREATE TABLE setup_versions (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        setup_id TEXT NOT NULL REFERENCES setups(id),
        parent_version_id TEXT REFERENCES setup_versions(id),
        snapshot_schema_version INTEGER NOT NULL DEFAULT 1,
        snapshot TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE images (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        local_uri TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        width_px INTEGER,
        height_px INTEGER,
        byte_size INTEGER,
        sha256 TEXT,
        exif TEXT NOT NULL DEFAULT '{}',
        ${LIFECYCLE_COLUMNS}
      )`,
      `CREATE TABLE recreations (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        setup_version_id TEXT NOT NULL REFERENCES setup_versions(id),
        shoot_id TEXT REFERENCES shoots(id),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL DEFAULT 'in_progress',
        outcome TEXT,
        actual_snapshot TEXT,
        tolerances TEXT NOT NULL,
        evaluation TEXT,
        feedback TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      // Guest preferences, current profile pointer and misc local flags -
      // OFFLINE_SYNC.md's local_settings, trimmed to what a sync-less guest
      // workspace actually needs today.
      `CREATE TABLE local_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE INDEX idx_setups_owner_updated ON setups(owner_id, updated_at)`,
      `CREATE INDEX idx_setup_versions_setup ON setup_versions(setup_id, created_at)`,
      `CREATE INDEX idx_recreations_setup_version ON recreations(setup_version_id, started_at)`,
      `CREATE INDEX idx_recreations_shoot ON recreations(shoot_id)`,
      `CREATE INDEX idx_equipment_purge ON equipment(purge_after) WHERE purge_after IS NOT NULL`,
      `CREATE INDEX idx_setups_purge ON setups(purge_after) WHERE purge_after IS NOT NULL`,
    ],
  },
];
