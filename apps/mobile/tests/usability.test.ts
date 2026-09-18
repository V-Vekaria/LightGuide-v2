import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  Repository,
  type Database,
  type SqlValue,
} from "../src/data/repository";
import { migration } from "../src/data/migration";
import { emptyScene } from "../src/domain/schema";
import {
  blankDraft,
  sceneFromDraft,
  draftFromScene,
} from "../src/domain/capture";
import { parseShutter, formatShutter } from "../src/domain/camera-settings";
function connection() {
  const sql = new DatabaseSync(":memory:");
  const db: Database = {
    exec: (s) => sql.exec(s),
    run: (s, ...p) => ({ changes: Number(sql.prepare(s).run(...p).changes) }),
    all: <T>(s: string, ...p: SqlValue[]) => sql.prepare(s).all(...p) as T[],
    close: () => sql.close(),
  };
  return db;
}
test("camera shutter accepts fractions and seconds, round trips, rejects malformed input", () => {
  for (const [raw, expected] of [
    ["1/200", 0.005],
    ["1 / 125", 0.008],
    ["0.5", 0.5],
    ["30", 30],
  ] as const) {
    assert.equal(parseShutter(raw), expected);
    assert.equal(parseShutter(formatShutter(expected)), expected);
  }
  assert.equal(parseShutter(""), null);
  for (const input of [
    "1/0",
    "0/200",
    "-1/200",
    "1/200/2",
    "1/NaN",
    "Infinity",
    "1e999",
    "1+1",
    "0",
    "86401",
  ])
    assert.throws(() => parseShutter(input));
});
test("camera-in-capture drafts survive reopening and preserve old snapshot settings", () => {
  const db = connection();
  let r = new Repository(db, randomUUID);
  const draft = {
    ...blankDraft,
    title: "Portrait",
    camera: {
      focal: "85",
      aperture: "4",
      shutter: "1/200",
      iso: "100",
      equipmentIds: [],
    },
  };
  r.saveDraft("capture:new", draft);
  r = new Repository(db, randomUUID);
  assert.equal(r.draft("capture:new")!.data.camera!.shutter, "1/200");
  const original = sceneFromDraft(draft, r);
  const saved = r.publish({
    title: draft.title,
    category: "portrait",
    scene: original,
  });
  const edited = draftFromScene("Portrait", "portrait", original);
  edited.camera!.shutter = "1/125";
  const next = sceneFromDraft(edited, r, original);
  assert.equal(
    next.objects.find((o) => o.kind === "camera")!.settings.exposure_time_s,
    0.008,
  );
  assert.equal(
    r.scene(saved.versionId).objects.find((o) => o.kind === "camera")!.settings
      .exposure_time_s,
    0.005,
  );
  r.db.close();
});
function seedV1(db: Database) {
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migration);
  const sid = randomUUID(),
    vid = randomUUID(),
    iid = randomUUID(),
    aid = randomUUID(),
    done = randomUUID();
  const at = "2026-09-17T12:00:00.000Z";
  const scene = {
    ...emptyScene(),
    images: [{ image_id: iid, role: "result" as const, object_id: null }],
  };
  db.exec("BEGIN");
  db.run(
    "INSERT INTO setups(id,created_at,updated_at,title,category) VALUES(?,?,?,?,?)",
    sid,
    at,
    at,
    "Existing setup",
    "portrait",
  );
  db.run(
    "INSERT INTO setup_versions(id,created_at,updated_at,setup_id,snapshot_schema_version,snapshot) VALUES(?,?,?,?,1,?)",
    vid,
    at,
    at,
    sid,
    JSON.stringify(scene),
  );
  db.run("UPDATE setups SET current_version_id=? WHERE id=?", vid, sid);
  db.run(
    "INSERT INTO images(id,created_at,updated_at,mime_type,width_px,height_px,byte_size,sha256) VALUES(?,?,?,'image/jpeg',300,500,100,?)",
    iid,
    at,
    at,
    "a".repeat(64),
  );
  db.run(
    "INSERT INTO local_media(image_id,original_path,optimised_path,transfer_state) VALUES(?,?,?,'available')",
    iid,
    iid + ".original",
    iid + ".jpg",
  );
  db.run(
    "INSERT INTO recreations(id,created_at,updated_at,setup_version_id,started_at,status,tolerances) VALUES(?,?,?,?,?,'in_progress','{}')",
    aid,
    at,
    at,
    vid,
    at,
  );
  db.run(
    "INSERT INTO recreations(id,created_at,updated_at,setup_version_id,started_at,completed_at,status,outcome,tolerances,actual_snapshot) VALUES(?,?,?,?,?,?,'completed','matched','{}',?)",
    done,
    at,
    at,
    vid,
    at,
    at,
    JSON.stringify(scene),
  );
  db.run(
    "INSERT INTO local_settings(key,value) VALUES(?,?)",
    "attempt:" + aid,
    JSON.stringify({ step: 2, notes: "Keep this", outcome: "close_enough" }),
  );
  db.exec("COMMIT");
  return { sid, vid, iid, aid, done, scene };
}
test("v1 upgrade preserves records, photographs, targets and completed outcomes; unfinished rating is reconfirmed", () => {
  const db = connection(),
    old = seedV1(db),
    before = db.all("SELECT * FROM recreations WHERE id=?", old.done);
  const r = new Repository(db, randomUUID);
  assert.deepEqual(
    db.all("SELECT * FROM recreations WHERE id=?", old.done),
    before,
  );
  assert.deepEqual(r.scene(old.vid), old.scene);
  assert.equal(r.image(old.iid)!.optimised_path, old.iid + ".jpg");
  assert.equal(r.setup(old.sid).title, "Existing setup");
  assert.deepEqual(r.setting("attempt:" + old.aid, {}), {
    step: 2,
    notes: "Keep this",
  });
  r.saveRecreationProgress(old.aid, 3, "Keep this");
  assert.equal(
    r.setting<{ outcome: unknown }>("attempt:" + old.aid, { outcome: "bad" })
      .outcome,
    null,
  );
  assert.throws(() =>
    r.completeRecreation(old.aid, null as never, "", null, 0),
  );
  r.completeRecreation(old.aid, "not_evaluated", "", null, 10);
  assert.equal(r.recreation(old.aid).outcome, "not_evaluated");
  assert.throws(
    () =>
      db.run("UPDATE recreations SET outcome='adapted' WHERE id=?", old.done),
    /immutable/,
  );
  assert.deepEqual(db.all("PRAGMA foreign_key_check"), []);
  new Repository(db, randomUUID);
  assert.equal(r.recreation(old.done).outcome, "matched");
  db.close();
});
test("interrupted v2 migration rolls back to the complete v1 database", () => {
  const db = connection(),
    old = seedV1(db),
    exec = db.exec;
  db.exec = (s) => {
    exec(s);
    if (s.includes("ALTER TABLE recreations_v2"))
      throw new Error("Interrupted upgrade");
  };
  assert.throws(() => new Repository(db, randomUUID), /Interrupted upgrade/);
  assert.equal(
    db.all<{ user_version: number }>("PRAGMA user_version")[0]!.user_version,
    1,
  );
  assert.equal(
    db.all<{ outcome: string }>(
      "SELECT outcome FROM recreations WHERE id=?",
      old.done,
    )[0]!.outcome,
    "matched",
  );
  assert.equal(
    db.all("SELECT name FROM sqlite_master WHERE name='recreations_v2'").length,
    0,
  );
  db.exec = exec;
  new Repository(db, randomUUID);
  db.close();
});
