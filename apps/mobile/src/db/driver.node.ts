import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlParam } from './driver';

/**
 * Test/tooling-only driver backed by Node's built-in node:sqlite.
 *
 * Never imported by app code (see driver.expo.ts for the on-device driver);
 * exists so repository and migration logic can be tested against a real
 * SQLite engine, including real file persistence across a close()/reopen,
 * without a device or emulator. See jest.config.js.
 */
export function openNodeDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');

  let depth = 0;

  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params: SqlParam[] = []) {
      const info = db.prepare(sql).run(...params);
      return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
    },
    all<T>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    get<T>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    transaction<T>(fn: () => T): T {
      if (depth > 0) {
        // SQLite doesn't nest BEGIN; a nested call just joins the outer one.
        return fn();
      }
      depth += 1;
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        depth -= 1;
      }
    },
    close() {
      db.close();
    },
  };
}
