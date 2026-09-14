import { openDatabaseAsync } from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import { Repository, type Database, type SqlValue } from "./repository";

let instance: Repository | undefined;
let pending: Promise<Repository> | undefined;
export async function openRepository(): Promise<Repository> {
  if (instance) return instance;
  if (pending) return pending;
  pending = createRepository();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
async function createRepository(): Promise<Repository> {
  const sqlite = await openDatabaseAsync("lightguide-guest-v1.db");
  const db: Database = {
    exec: (sql) => sqlite.execSync(sql),
    run: (sql, ...values) => sqlite.runSync(sql, values),
    all: <T>(sql: string, ...values: SqlValue[]) =>
      sqlite.getAllSync<T>(sql, values),
    close: () => sqlite.closeSync(),
  };
  try {
    instance = new Repository(db, randomUUID);
  } catch (e) {
    sqlite.closeSync();
    throw e;
  }
  return instance;
}
