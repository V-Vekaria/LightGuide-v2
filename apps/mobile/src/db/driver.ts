/**
 * Storage-agnostic SQLite driver interface.
 *
 * Repository code (src/repositories/*) is written against this interface
 * only. Two implementations exist:
 *  - driver.node.ts, backed by Node's built-in node:sqlite, used by Jest so
 *    repository/migration logic is tested against a REAL, file-backed SQLite
 *    engine (restart durability included), not a mock.
 *  - driver.expo.ts, backed by expo-sqlite's synchronous API, used by the
 *    app at runtime on-device.
 * Both speak plain SQL, so a schema/query change is exercised the same way
 * in both places. Only driver.expo.ts touches React Native/Expo imports;
 * nothing else in src/db or src/repositories does, which is what lets the
 * test suite run under plain Node/Jest.
 */
export type SqlParam = string | number | null;

export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: SqlParam[]): { changes: number; lastInsertRowid: number };
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): T | undefined;
  /** Runs fn inside BEGIN/COMMIT, rolling back on throw. Not reentrant. */
  transaction<T>(fn: () => T): T;
  close(): void;
}
