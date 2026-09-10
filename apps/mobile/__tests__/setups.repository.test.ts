import {
  archiveSetup,
  createSetup,
  getCurrentVersion,
  listSetups,
  listVersions,
  publishSetupVersion,
  restoreSetup,
  trashSetup,
} from '../src/repositories/setups';
import { buildManualSnapshot } from '../src/services/captureService';
import { openTestDbMemory } from './testDb';
import type { SqlDriver } from '../src/db/driver';

describe('setups repository', () => {
  let db: SqlDriver;
  beforeEach(() => {
    db = openTestDbMemory();
  });
  afterEach(() => db.close());

  it('creates a setup with no current version until a version is published', () => {
    const setup = createSetup(db, { title: 'Untitled setup', category: 'portrait' });
    expect(setup.currentVersionId).toBeNull();
  });

  it('publishing a version sets it as current and preserves the missing-vs-zero distinction', () => {
    const setup = createSetup(db, { title: 'Key light only', category: 'portrait' });
    const version = publishSetupVersion(db, {
      setupId: setup.id,
      parentVersionId: null,
      snapshot: buildManualSnapshot({ light: { distanceM: 1.5 } }), // heightM deliberately omitted
    });
    const current = getCurrentVersion(db, setup.id);
    expect(current?.id).toBe(version.id);
    const distance = current!.snapshot.objects[0].measurements.find((m) => m.kind === 'distance');
    const height = current!.snapshot.objects[0].measurements.find((m) => m.kind === 'height');
    expect(distance?.value).toBe(1.5);
    expect(height).toBeUndefined(); // not present, not a fabricated 0
  });

  it('editing a setup creates a NEW version and does not mutate the earlier one (immutability)', () => {
    const setup = createSetup(db, { title: 'Product shot', category: 'product' });
    const v1 = publishSetupVersion(db, {
      setupId: setup.id,
      parentVersionId: null,
      snapshot: buildManualSnapshot({ light: { distanceM: 1.0 } }),
    });
    const v2 = publishSetupVersion(db, {
      setupId: setup.id,
      parentVersionId: v1.id,
      snapshot: buildManualSnapshot({ light: { distanceM: 2.0 } }),
    });

    expect(v1.id).not.toBe(v2.id);
    expect(v2.parentVersionId).toBe(v1.id);

    const versions = listVersions(db, setup.id);
    expect(versions).toHaveLength(2);
    const reloadedV1 = versions.find((v) => v.id === v1.id)!;
    expect(reloadedV1.snapshot.objects[0].measurements[0].value).toBe(1.0); // untouched by the v2 edit

    const current = getCurrentVersion(db, setup.id);
    expect(current?.id).toBe(v2.id);
  });

  it('refuses to publish against a stale parent version (would silently branch)', () => {
    const setup = createSetup(db, { title: 'Branch guard', category: 'portrait' });
    const v1 = publishSetupVersion(db, { setupId: setup.id, parentVersionId: null, snapshot: buildManualSnapshot({}) });
    publishSetupVersion(db, { setupId: setup.id, parentVersionId: v1.id, snapshot: buildManualSnapshot({}) }); // v2, now current

    expect(() =>
      publishSetupVersion(db, { setupId: setup.id, parentVersionId: v1.id, snapshot: buildManualSnapshot({}) }),
    ).toThrow(/not the current version/);
  });

  it('archive and Trash are distinct: an archived setup still lists, a trashed one does not', () => {
    const archived = createSetup(db, { title: 'Archived one', category: 'portrait' });
    const trashed = createSetup(db, { title: 'Trashed one', category: 'portrait' });
    const active = createSetup(db, { title: 'Active one', category: 'portrait' });

    archiveSetup(db, archived.id);
    trashSetup(db, trashed.id);

    const defaultList = listSetups(db).map((s) => s.title);
    expect(defaultList).toContain('Active one');
    expect(defaultList).not.toContain('Archived one');
    expect(defaultList).not.toContain('Trashed one');

    const withArchived = listSetups(db, { includeArchived: true }).map((s) => s.title);
    expect(withArchived).toContain('Archived one');
    expect(withArchived).not.toContain('Trashed one');

    const trashView = listSetups(db, { onlyTrashed: true }).map((s) => s.title);
    expect(trashView).toEqual(['Trashed one']);
  });

  it('restoring a trashed setup returns it to the active list', () => {
    const setup = createSetup(db, { title: 'Restore me', category: 'portrait' });
    trashSetup(db, setup.id);
    expect(listSetups(db).map((s) => s.title)).not.toContain('Restore me');
    restoreSetup(db, setup.id);
    expect(listSetups(db).map((s) => s.title)).toContain('Restore me');
  });

  it('search filters by title substring', () => {
    createSetup(db, { title: 'Studio portrait key', category: 'portrait' });
    createSetup(db, { title: 'Product on white', category: 'product' });
    const results = listSetups(db, { query: 'portrait' }).map((s) => s.title);
    expect(results).toEqual(['Studio portrait key']);
  });
});
