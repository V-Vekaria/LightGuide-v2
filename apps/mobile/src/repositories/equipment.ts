import type { SqlDriver } from '../db/driver';
import { newUuid, nowIso } from '../domain/ids';
import type { Equipment, EquipmentDetails, EquipmentKind } from '../domain/types';

const EMPTY_DETAILS: EquipmentDetails = {
  mount: null,
  focalLengthMinMm: null,
  focalLengthMaxMm: null,
  modifierWidthM: null,
  modifierHeightM: null,
  specifications: [],
};

interface EquipmentRow {
  id: string;
  owner_id: string | null;
  kind: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  details: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  purge_after: string | null;
}

function rowToEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind as EquipmentKind,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    details: JSON.parse(row.details) as EquipmentDetails,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    purgeAfter: row.purge_after,
  };
}

/** Lightweight equipment record per M2 "implement lightweight equipment records where the core flow needs them" - individual selection only, no kits (deferred, APP_MVP_PLAN.md Should list). */
export function createEquipment(
  db: SqlDriver,
  input: { kind: EquipmentKind; name: string; manufacturer?: string; model?: string; details?: Partial<EquipmentDetails> },
): Equipment {
  const id = newUuid();
  const now = nowIso();
  const details: EquipmentDetails = { ...EMPTY_DETAILS, ...input.details };
  db.run(
    `INSERT INTO equipment (id, owner_id, kind, name, manufacturer, model, details, notes, created_at, updated_at, archived_at, deleted_at, purge_after)
     VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL)`,
    [id, input.kind, input.name, input.manufacturer ?? null, input.model ?? null, JSON.stringify(details), now, now],
  );
  return getEquipment(db, id)!;
}

export function getEquipment(db: SqlDriver, id: string): Equipment | undefined {
  const row = db.get<EquipmentRow>('SELECT * FROM equipment WHERE id = ?', [id]);
  return row ? rowToEquipment(row) : undefined;
}

export function listEquipment(db: SqlDriver, includeDeleted = false): Equipment[] {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.all<EquipmentRow>(`SELECT * FROM equipment ${where} ORDER BY name ASC`).map(rowToEquipment);
}
