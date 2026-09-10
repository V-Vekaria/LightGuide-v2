import type { SqlDriver } from '../db/driver';
import { newUuid, nowIso } from '../domain/ids';
import type {
  Evaluation,
  Recreation,
  RecreationFeedback,
  RecreationOutcome,
  RecreationStatus,
  SceneSnapshot,
  ToleranceSet,
} from '../domain/types';
import { validateToleranceSet } from '../domain/validation';

const EMPTY_FEEDBACK: RecreationFeedback = { difficulty: null, usefulness: null, notes: null };

interface RecreationRow {
  id: string;
  owner_id: string | null;
  setup_version_id: string;
  shoot_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  outcome: string | null;
  actual_snapshot: string | null;
  tolerances: string;
  evaluation: string | null;
  feedback: string;
  created_at: string;
  updated_at: string;
}

function rowToRecreation(row: RecreationRow): Recreation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    setupVersionId: row.setup_version_id,
    shootId: row.shoot_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    status: row.status as RecreationStatus,
    outcome: row.outcome as RecreationOutcome | null,
    actualSnapshot: row.actual_snapshot ? (JSON.parse(row.actual_snapshot) as SceneSnapshot) : null,
    tolerances: JSON.parse(row.tolerances) as ToleranceSet,
    evaluation: row.evaluation ? (JSON.parse(row.evaluation) as Evaluation) : null,
    feedback: JSON.parse(row.feedback) as RecreationFeedback,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Starts an attempt against one exact, immutable setup version - never a moving "latest" pointer (DATABASE_SCHEMA.md recreations.setup_version_id). */
export function startRecreation(
  db: SqlDriver,
  input: { setupVersionId: string; shootId?: string | null; tolerances: ToleranceSet },
): Recreation {
  validateToleranceSet(input.tolerances);
  const id = newUuid();
  const now = nowIso();
  db.run(
    `INSERT INTO recreations (id, owner_id, setup_version_id, shoot_id, started_at, completed_at, duration_ms, status, outcome, actual_snapshot, tolerances, evaluation, feedback, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, NULL, NULL, 'in_progress', NULL, NULL, ?, NULL, ?, ?, ?)`,
    [id, input.setupVersionId, input.shootId ?? null, now, JSON.stringify(input.tolerances), JSON.stringify(EMPTY_FEEDBACK), now, now],
  );
  return getRecreation(db, id)!;
}

/**
 * Records the outcome. completedAt/outcome are required together
 * (DATABASE_SCHEMA.md "Completed requires completed_at and outcome"); a
 * photographer-reported outcome is accepted even without a measured
 * evaluation, but a measured evaluation can never be fabricated - callers
 * that have no valid measurement must pass evaluation: null, not a fake pass.
 */
export function completeRecreation(
  db: SqlDriver,
  id: string,
  input: {
    outcome: RecreationOutcome;
    actualSnapshot?: SceneSnapshot;
    evaluation?: Evaluation;
    durationMs?: number;
    feedback?: Partial<RecreationFeedback>;
  },
): Recreation {
  const existing = getRecreation(db, id);
  if (!existing) throw new Error(`recreation ${id} does not exist`);
  if (existing.status === 'completed') {
    throw new Error(`recreation ${id} is already completed; its evidence is immutable - start a new attempt instead`);
  }

  const now = nowIso();
  const feedback: RecreationFeedback = { ...existing.feedback, ...input.feedback };
  db.run(
    `UPDATE recreations
     SET status = 'completed', outcome = ?, completed_at = ?, duration_ms = ?, actual_snapshot = ?, evaluation = ?, feedback = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.outcome,
      now,
      input.durationMs ?? null,
      input.actualSnapshot ? JSON.stringify(input.actualSnapshot) : null,
      input.evaluation ? JSON.stringify(input.evaluation) : null,
      JSON.stringify(feedback),
      now,
      id,
    ],
  );
  return getRecreation(db, id)!;
}

export function abandonRecreation(db: SqlDriver, id: string): Recreation {
  const now = nowIso();
  db.run(`UPDATE recreations SET status = 'abandoned', completed_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  return getRecreation(db, id)!;
}

export function getRecreation(db: SqlDriver, id: string): Recreation | undefined {
  const row = db.get<RecreationRow>('SELECT * FROM recreations WHERE id = ?', [id]);
  return row ? rowToRecreation(row) : undefined;
}

export function listRecreationsForSetupVersion(db: SqlDriver, setupVersionId: string): Recreation[] {
  return db
    .all<RecreationRow>('SELECT * FROM recreations WHERE setup_version_id = ? ORDER BY started_at DESC', [setupVersionId])
    .map(rowToRecreation);
}
