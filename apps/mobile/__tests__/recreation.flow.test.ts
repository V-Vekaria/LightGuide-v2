import { DEFAULT_TOLERANCES } from '../src/domain/types';
import { createSetup, publishSetupVersion } from '../src/repositories/setups';
import { getRecreation } from '../src/repositories/recreations';
import { saveQuickCapture } from '../src/services/captureService';
import { beginRecreation, evaluateRecreation, recordOutcome } from '../src/services/recreationService';
import { openTestDbMemory } from './testDb';
import type { SqlDriver } from '../src/db/driver';

/**
 * End-to-end coverage of the M2 core offline journey: save -> find -> begin
 * recreation -> guidance -> record outcome, plus the specific invariant
 * called out in the handoff: "editing a setup must not rewrite an earlier
 * recreation's target."
 */
describe('save -> recreate -> record outcome', () => {
  let db: SqlDriver;
  beforeEach(() => {
    db = openTestDbMemory();
  });
  afterEach(() => db.close());

  it('completes the full offline journey and produces a durable recreation record', () => {
    const setup = saveQuickCapture(db, {
      title: 'Window light portrait',
      category: 'portrait',
      light: { role: 'key', distanceM: 1.2, heightM: 1.7, directionDeg: 15 },
    });

    const recreation = beginRecreation(db, setup.id, DEFAULT_TOLERANCES);
    expect(recreation.status).toBe('in_progress');

    // Simulated "current" pose: operator has entered/estimated it, not a live capture.
    const evaluation = evaluateRecreation({
      target: { positionM: [0, 1.7, 1.2], quaternionXyzw: [0, 0, 0, 1] },
      current: { positionM: [0.01, 1.7, 1.21], quaternionXyzw: [0, 0, 0, 1] },
      observationQuality: 'fresh',
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(evaluation.matchState).toBe('in_tolerance');

    const completed = recordOutcome(db, {
      recreationId: recreation.id,
      outcome: 'matched',
      durationMs: 45_000,
    });

    expect(completed.status).toBe('completed');
    expect(completed.outcome).toBe('matched');
    expect(completed.completedAt).not.toBeNull();

    const reloaded = getRecreation(db, recreation.id)!;
    expect(reloaded.durationMs).toBe(45_000);
  });

  it('a lost/relocalising observation never yields a matched outcome claim from evaluateRecreation', () => {
    const evaluation = evaluateRecreation({
      target: { positionM: [0, 0, 0], quaternionXyzw: [0, 0, 0, 1] },
      current: { positionM: [0, 0, 0], quaternionXyzw: [0, 0, 0, 1] }, // numerically perfect
      observationQuality: 'inferred', // but not actually observed fresh
      referenceValid: true,
      tolerances: DEFAULT_TOLERANCES,
    });
    expect(evaluation.matchState).toBe('unverifiable');
  });

  it('editing a setup after a recreation does not change that recreation\'s target version', () => {
    const setup = saveQuickCapture(db, {
      title: 'Two-light setup',
      category: 'portrait',
      light: { distanceM: 1.0 },
    });
    const recreation = beginRecreation(db, setup.id, DEFAULT_TOLERANCES);
    const targetVersionAtStart = recreation.setupVersionId;

    // Photographer edits the setup afterwards - publishes v2.
    publishSetupVersion(db, {
      setupId: setup.id,
      parentVersionId: targetVersionAtStart,
      snapshot: { schemaVersion: 1, referenceFrame: null, objects: [], images: [], notes: 'edited after recreation' },
    });

    const reloadedRecreation = getRecreation(db, recreation.id)!;
    expect(reloadedRecreation.setupVersionId).toBe(targetVersionAtStart);
  });

  it('completed recreation evidence is immutable: completing twice is refused', () => {
    const setup = saveQuickCapture(db, { title: 'Immutable evidence', category: 'product' });
    const recreation = beginRecreation(db, setup.id, DEFAULT_TOLERANCES);
    recordOutcome(db, { recreationId: recreation.id, outcome: 'matched' });
    expect(() => recordOutcome(db, { recreationId: recreation.id, outcome: 'unsuccessful' })).toThrow(/already completed/);
  });

  it('beginning a recreation against an unpublished setup fails clearly', () => {
    // A setup shell with no published version - createSetup, not saveQuickCapture.
    const setup = createSetup(db, { title: 'Never saved', category: 'portrait' });
    expect(() => beginRecreation(db, setup.id, DEFAULT_TOLERANCES)).toThrow(/no published version/);
  });
});
