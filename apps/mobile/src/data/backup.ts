import { z } from "zod";
import { parseScene } from "../domain/schema";
import {
  captureDraftSchema,
  type Repository,
  type SqlValue,
} from "./repository";
const tables = [
  "profiles",
  "equipment",
  "shoots",
  "setups",
  "setup_versions",
  "images",
  "recreations",
  "working_drafts",
  "local_media",
  "local_settings",
] as const;
const row = z.record(
  z.string(),
  z.union([z.string(), z.number().finite(), z.null()]),
);
const backupSchema = z
  .object({
    format: z.literal("lightguide-android-backup"),
    version: z.literal(1),
    tables: z.record(z.string(), z.array(row).max(10000)),
    photos: z.record(z.string(), z.string().max(14000000)),
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;
export function exportRecords(repo: Repository): Backup {
  return {
    format: "lightguide-android-backup",
    version: 1,
    tables: Object.fromEntries(
      tables.map((t) => [
        t,
        repo.db.all<Record<string, SqlValue>>("SELECT * FROM " + t),
      ]),
    ),
    photos: {},
  };
}
export function parseBackup(raw: string): Backup {
  if (raw.length > 70 * 1024 * 1024)
    throw new Error("Backup is larger than the 70 MB import limit.");
  const backup = backupSchema.parse(JSON.parse(raw));
  if (
    Object.keys(backup.tables).length !== tables.length ||
    tables.some((t) => !backup.tables[t])
  )
    throw new Error("Backup is missing required records.");
  for (const v of backup.tables.setup_versions!) {
    parseScene(JSON.parse(String(v.snapshot)));
  }
  for (const v of backup.tables.recreations!) {
    if (v.actual_snapshot) parseScene(JSON.parse(String(v.actual_snapshot)));
  }
  for (const v of backup.tables.working_drafts!) {
    if (v.entity_type === "capture")
      captureDraftSchema.parse(JSON.parse(String(v.payload)));
  }
  for (const v of backup.tables.local_media!) {
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(String(v.optimised_path)))
      throw new Error("Invalid photo path in backup.");
    v.original_path = null;
    v.download_path = null;
  }
  for (const key of Object.keys(backup.photos)) {
    if (
      !/^[a-f0-9-]{36}$/.test(key) ||
      !backup.tables.images!.some((i) => i.id === key)
    )
      throw new Error("Unexpected photo in backup.");
  }
  for (const v of backup.tables.local_settings!) {
    if (String(v.value).length > 65536)
      throw new Error("Invalid preference in backup.");
    JSON.parse(String(v.value));
  }
  return backup;
}
export function restoreRecords(repo: Repository, backup: Backup) {
  // Parameterised values and a fixed table/column allowlist; never execute backup SQL.
  repo.atomic(() => {
    repo.db.exec("PRAGMA defer_foreign_keys=ON");
    for (const table of [...tables].reverse())
      repo.db.run("DELETE FROM " + table);
    for (const table of tables) {
      const columns = repo.db
        .all<{ name: string }>("PRAGMA table_info(" + table + ")")
        .map((c) => c.name);
      for (const row of backup.tables[table]!) {
        const keys = Object.keys(row);
        if (
          keys.length !== columns.length ||
          keys.some((k) => !columns.includes(k))
        )
          throw new Error("Unsupported backup columns.");
        repo.db.run(
          "INSERT INTO " +
            table +
            " (" +
            keys.join(",") +
            ") VALUES (" +
            keys.map(() => "?").join(",") +
            ")",
          ...keys.map((k) => row[k]!),
        );
      }
    }
    if (repo.db.all("PRAGMA foreign_key_check").length)
      throw new Error(
        "Backup references are incomplete. Existing data was preserved.",
      );
  });
}
