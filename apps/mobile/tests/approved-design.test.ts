import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  Repository,
  type Database,
  type SqlValue,
} from "../src/data/repository";
import {
  todayKey,
  dateKey,
  dateError,
  shootState,
  scheduledAt,
} from "../src/domain/shoot-dates";
import { exportRecords, parseBackup, restoreRecords } from "../src/data/backup";
import { emptyScene } from "../src/domain/schema";
function open() {
  const sql = new DatabaseSync(":memory:");
  const db: Database = {
    exec: (s) => sql.exec(s),
    run: (s, ...p) => ({ changes: Number(sql.prepare(s).run(...p).changes) }),
    all: <T>(s: string, ...p: SqlValue[]) => sql.prepare(s).all(...p) as T[],
    close: () => sql.close(),
  };
  return new Repository(db, randomUUID, () => new Date("2026-09-27T12:00:00Z"));
}
const shoot = (scheduled_at: string | null) => ({
  name: "Portrait shoot",
  category: "portrait",
  status: "planned",
  scheduled_at,
  notes: null,
  planned_equipment_ids: [],
});
test("London calendar rejects past and impossible dates, permits today and preserves historic edits", () => {
  assert.equal(todayKey(new Date("2026-09-26T23:05:00Z")), "2026-09-27");
  assert.ok(dateError("20-09-2026", "2026-09-27"));
  assert.ok(dateError("31-09-2026", "2026-09-27"));
  assert.ok(dateError("2026-09-27Tinvalid", "2026-09-27"));
  assert.equal(dateError("27-09-2026", "2026-09-27"), null);
  assert.equal(
    dateError("20-09-2026", "2026-09-27", scheduledAt("20-09-2026")),
    null,
  );
  assert.equal(dateKey(scheduledAt("20-09-2026")), "2026-09-20");
  assert.equal(
    shootState(shoot(scheduledAt("20-09-2026")), "2026-09-27"),
    "Date passed",
  );
  assert.equal(
    shootState(shoot(scheduledAt("27-09-2026")), "2026-09-27"),
    "Planned",
  );
  assert.equal(
    shootState(shoot(scheduledAt("27-09-2026")), "2026-09-28"),
    "Date passed",
  );
});
test("repository enforces shoot date validation independently of the screen", () => {
  const r = open();
  try {
    assert.throws(
      () => r.saveShoot(shoot(scheduledAt("20-09-2026"))),
      /today or a future/,
    );
    const id = r.saveShoot(shoot(scheduledAt("27-09-2026")));
    assert.equal(r.shoots()[0]?.scheduled_at, scheduledAt("27-09-2026"));
    assert.throws(() => r.saveShoot(shoot(scheduledAt("21-09-2026")), id));
    assert.equal(r.shoots().length, 1);
  } finally {
    r.db.close();
  }
});
test("shoots remain planned after noon until the London calendar day ends", () => {
  const plan = shoot(scheduledAt("27-09-2026"));
  assert.equal(shootState(plan, todayKey(new Date("2026-09-27T22:59:00Z"))), "Planned");
  assert.equal(shootState(plan, todayKey(new Date("2026-09-27T23:00:00Z"))), "Date passed");
  assert.equal(shootState({ ...plan, status: "completed" }, "2026-09-27"), "Completed");
});
test("legacy recreation readings migrate without overwriting newer values or claiming freshness", () => {
  const r = open();
  try {
    const setup = r.publish({ title: "Upgrade", category: "portrait", scene: emptyScene() });
    const attempt = r.startRecreation(setup.versionId);
    const legacy = { readings: { first: { height: "160", distance: "150" }, second: { height: "180", distance: "200" } }, camera: { iso: "640" } };
    r.setSetting("workspace:" + attempt, legacy);
    const migrated = r.recreationReadings(attempt);
    assert.deepEqual(migrated.first, { height: "160", distance: "150", updatedAt: "" });
    assert.deepEqual(migrated.second, { height: "180", distance: "200", updatedAt: "" });
    assert.deepEqual(r.setting("workspace:" + attempt, null), legacy);
    const newer = { first: { height: "175", distance: "150", updatedAt: "2026-09-27T12:00:00Z" } };
    r.setSetting("attempt-readings:" + attempt, newer);
    assert.deepEqual(r.recreationReadings(attempt), newer);
    r.abandonRecreation(attempt);
    assert.deepEqual(r.recreationReadings(attempt), {});
    assert.equal(r.setting("workspace:" + attempt, null), null);
    assert.equal(r.setting("attempt-readings:" + attempt, null), null);
  } finally { r.db.close(); }
});
test("workspace backup restores versions and attempt drafts without changing their identity", () => {
  const r = open();
  try {
    const setup = r.publish({
        title: "Preserved",
        category: "portrait",
        scene: emptyScene(),
      }),
      attempt = r.startRecreation(setup.versionId);
    r.setSetting("workspace:" + attempt, {
      stage: 2,
      light: 0,
      readings: {},
      camera: { iso: "640" },
    });
    r.saveRecreationProgress(attempt, 2, "Keep this note", "not_evaluated");
    const backup = parseBackup(JSON.stringify(exportRecords(r)));
    r.publish({ title: "Later", category: "portrait", scene: emptyScene() });
    restoreRecords(r, backup);
    assert.equal(r.setups().length, 1);
    assert.equal(r.setups()[0]?.id, setup.id);
    assert.equal(r.recreation(attempt).setup_version_id, setup.versionId);
    assert.equal(
      r.setting("workspace:" + attempt, { camera: { iso: "" } }).camera.iso,
      "640",
    );
    assert.equal(
      r.setting("attempt:" + attempt, { notes: "" }).notes,
      "Keep this note",
    );
  } finally {
    r.db.close();
  }
});
test("malformed backup rolls back the entire replacement and retains existing records", () => {
  const r = open();
  try {
    const setup = r.publish({
      title: "Keep me",
      category: "portrait",
      scene: emptyScene(),
    });
    const b = exportRecords(r);
    b.tables.setups![0]!.current_version_id = randomUUID();
    assert.throws(() => restoreRecords(r, b), /incomplete|FOREIGN KEY/);
    assert.equal(r.setups()[0]?.id, setup.id);
    assert.equal(r.setups()[0]?.current_version_id, setup.versionId);
    assert.throws(
      () => parseBackup(JSON.stringify({ ...b, tables: {} })),
      /required/,
    );
  } finally {
    r.db.close();
  }
});
