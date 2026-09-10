import { openNodeDriver } from '../src/db/driver.node';
import { migrate } from '../src/db/migrate';

describe('migrate()', () => {
  it('creates all seven domain tables plus local_settings', () => {
    const driver = openNodeDriver(':memory:');
    migrate(driver);
    const tables = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'profiles',
        'equipment',
        'shoots',
        'setups',
        'setup_versions',
        'images',
        'recreations',
        'local_settings',
      ]),
    );
    driver.close();
  });

  it('is repeatable: running it again against an up-to-date database is a no-op', () => {
    const driver = openNodeDriver(':memory:');
    const first = migrate(driver);
    const second = migrate(driver);
    expect(first.appliedVersions).toEqual([1]);
    expect(second.appliedVersions).toEqual([]);
    driver.close();
  });

  it('enforces foreign keys', () => {
    const driver = openNodeDriver(':memory:');
    migrate(driver);
    expect(() =>
      driver.run(
        `INSERT INTO setup_versions (id, owner_id, setup_id, parent_version_id, snapshot_schema_version, snapshot, created_at)
         VALUES ('v1', NULL, 'missing-setup', NULL, 1, '{}', '2026-01-01T00:00:00Z')`,
      ),
    ).toThrow();
    driver.close();
  });
});
