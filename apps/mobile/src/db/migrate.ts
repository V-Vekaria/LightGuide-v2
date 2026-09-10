import type { SqlDriver } from './driver';
import { MIGRATIONS } from './schema';

/**
 * Applies every migration with version > the highest already-applied one, in
 * order, each in its own transaction. Repeatable: running it again against
 * an up-to-date database is a no-op. This is what M1's "migrations are
 * repeatable" exit criterion refers to.
 */
export function migrate(driver: SqlDriver): { appliedVersions: number[] } {
  driver.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    driver.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version),
  );

  const appliedVersions: number[] = [];
  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    driver.transaction(() => {
      for (const statement of migration.statements) {
        driver.exec(statement);
      }
      driver.run('INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.description,
        new Date().toISOString(),
      ]);
    });
    appliedVersions.push(migration.version);
  }
  return { appliedVersions };
}
