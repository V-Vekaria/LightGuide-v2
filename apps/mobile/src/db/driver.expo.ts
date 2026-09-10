import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlParam } from './driver';

/**
 * On-device driver backed by expo-sqlite's synchronous API.
 *
 * STATUS: implemented against the expo-sqlite ~16 (Expo SDK 54) API surface,
 * but not executed in this environment - there is no device/emulator here.
 * It is exercised only by having the exact same repository code run for
 * real against driver.node.ts in the Jest suite (see jest.config.js and
 * README.md "Testing approach"); that proves the SQL and repository logic,
 * not this specific binding. Verify this file specifically with `expo run:android`
 * on a device before relying on it.
 */
export function openExpoDriver(name: string): SqlDriver {
  const db = SQLite.openDatabaseSync(name);
  db.execSync('PRAGMA foreign_keys = ON;');
  db.execSync('PRAGMA journal_mode = WAL;');

  let depth = 0;

  return {
    exec(sql) {
      db.execSync(sql);
    },
    run(sql, params: SqlParam[] = []) {
      const result = db.runSync(sql, params as (string | number | null)[]);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowId };
    },
    all<T>(sql: string, params: SqlParam[] = []) {
      return db.getAllSync(sql, params as (string | number | null)[]) as T[];
    },
    get<T>(sql: string, params: SqlParam[] = []) {
      return (db.getFirstSync(sql, params as (string | number | null)[]) as T | null) ?? undefined;
    },
    transaction<T>(fn: () => T): T {
      if (depth > 0) {
        return fn();
      }
      depth += 1;
      let result!: T;
      db.withTransactionSync(() => {
        result = fn();
      });
      depth -= 1;
      return result;
    },
    close() {
      db.closeSync();
    },
  };
}
