import type { SqlDriver } from '../db/driver';
import type { Evaluation, EvaluationMetric, PoseTransform, RecreationOutcome, ToleranceSet } from '../domain/types';
import { computeDelta, computeGuidance, computeMatchState } from '../guidance/guidance';
import type { ObservationQuality } from '../guidance/guidance';
import { completeRecreation, startRecreation } from '../repositories/recreations';
import { getCurrentVersion, getVersion } from '../repositories/setups';

/**
 * Live guidance for one recreation attempt: current-vs-saved-target deltas
 * and the authoritative match state, computed the same way regardless of
 * whether the pose came from manual entry or a (future) live provider - see
 * src/spatial/SpatialProvider.ts.
 */
export function evaluateRecreation(params: {
  target: PoseTransform;
  current: PoseTransform | null;
  observationQuality: ObservationQuality;
  referenceValid: boolean;
  tolerances: ToleranceSet;
}) {
  const delta = params.current ? computeDelta(params.target, params.current) : null;
  const guidance = delta ? computeGuidance(delta, params.tolerances) : null;
  const matchState = computeMatchState({
    delta,
    observationQuality: params.observationQuality,
    referenceValid: params.referenceValid,
    tolerances: params.tolerances,
  });
  return { delta, guidance, matchState };
}

/** Begins an attempt against the setup's exact current version (never a moving pointer). */
export function beginRecreation(db: SqlDriver, setupId: string, tolerances: ToleranceSet, shootId?: string) {
  const version = getCurrentVersion(db, setupId);
  if (!version) {
    throw new Error(`setup ${setupId} has no published version yet - nothing to recreate`);
  }
  return startRecreation(db, { setupVersionId: version.id, shootId: shootId ?? null, tolerances });
}

export interface RecordOutcomeInput {
  recreationId: string;
  outcome: RecreationOutcome;
  durationMs?: number;
  measuredMetrics?: EvaluationMetric[];
  notes?: string;
}

/**
 * Records a recreation outcome. A photographer-reported outcome (M09/US09)
 * is always accepted; a measured `evaluation` is only attached when real
 * per-metric measurements were supplied - never synthesised from the
 * photographer's own outcome choice, which would silently manufacture a
 * "measured" result from an opinion.
 */
export function recordOutcome(db: SqlDriver, input: RecordOutcomeInput) {
  let evaluation: Evaluation | undefined;
  if (input.measuredMetrics && input.measuredMetrics.length > 0) {
    const allWithin = input.measuredMetrics.every((m) => m.status === 'within');
    const anyInvalid = input.measuredMetrics.some((m) => m.status === 'unavailable' || m.status === 'invalid');
    evaluation = {
      schemaVersion: 1,
      method: 'measured',
      algorithmVersion: 'mobile-guidance-v1',
      evaluatedAt: new Date().toISOString(),
      metrics: input.measuredMetrics,
      result: anyInvalid ? 'unverifiable' : allWithin ? 'matched' : 'not_matched',
    };
  }

  return completeRecreation(db, input.recreationId, {
    outcome: input.outcome,
    durationMs: input.durationMs,
    evaluation,
    feedback: input.notes ? { notes: input.notes } : undefined,
  });
}

export function getRecreationTarget(db: SqlDriver, setupVersionId: string): PoseTransform | null {
  const version = getVersion(db, setupVersionId);
  return version?.snapshot.referenceFrame?.worldFromReference ?? null;
}
