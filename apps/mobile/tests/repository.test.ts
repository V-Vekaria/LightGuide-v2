import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Repository,
  type Database,
  type SqlValue,
} from "../src/data/repository";
import { emptyScene, emptySettings, parseScene } from "../src/domain/schema";
import { blankDraft, sceneFromDraft } from "../src/domain/capture";

function open(
  path = ":memory:",
  now = () => new Date("2026-09-10T12:00:00.000Z"),
) {
  const sql = new DatabaseSync(path);
  const db: Database = {
    exec: (s) => sql.exec(s),
    run: (s, ...p) => ({ changes: Number(sql.prepare(s).run(...p).changes) }),
    all: <T>(s: string, ...p: SqlValue[]) => sql.prepare(s).all(...p) as T[],
    close: () => sql.close(),
  };
  try {
    return new Repository(db, randomUUID, now);
  } catch (error) {
    sql.close();
    throw error;
  }
}
const setup = (r: Repository, title = "Portrait") =>
  r.publish({ title, category: "portrait", scene: emptyScene() });

test("capture, drafts and immutable recreation target survive closing the actual SQLite file", () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-"));
  let r = open(join(dir, "workspace.db"));
  try {
    const s = setup(r);
    const a = r.startRecreation(s.versionId);
    r.saveDraft("capture:new", { ...blankDraft, title: "Interrupted capture" });
    r.publish({
      id: s.id,
      baseVersion: s.versionId,
      title: "Changed",
      category: "portrait",
      scene: { ...emptyScene(), notes: "New light power" },
    });
    r.db.close();
    r = open(join(dir, "workspace.db"));
    assert.equal(r.setups()[0]?.title, "Changed");
    assert.equal(r.recreation(a).setup_version_id, s.versionId);
    assert.equal(r.scene(s.versionId).notes, null);
    assert.equal(r.draft("capture:new")?.data.title, "Interrupted capture");
  } finally {
    r.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("failed initial publication rolls back the setup and version together", () => {
  const r = open();
  try {
    r.db.exec(
      "CREATE TRIGGER reject_versions BEFORE INSERT ON setup_versions BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;",
    );
    assert.throws(() => setup(r), /simulated disk failure/);
    assert.equal(r.setups().length, 0);
    assert.equal(r.db.all("SELECT * FROM setup_versions").length, 0);
  } finally {
    r.db.close();
  }
});
test("competing edits preserve both children and never silently replace current", () => {
  const r = open();
  try {
    const s = setup(r),
      one = r.publish({
        id: s.id,
        baseVersion: s.versionId,
        title: "First",
        category: "portrait",
        scene: { ...emptyScene(), notes: "first" },
      }),
      two = r.publish({
        id: s.id,
        baseVersion: s.versionId,
        title: "Second",
        category: "portrait",
        scene: { ...emptyScene(), notes: "second" },
      });
    assert.equal(two.conflict, true);
    assert.equal(r.versions(s.id).length, 3);
    assert.equal(r.setup(s.id).current_version_id, one.versionId);
    r.chooseVersion(s.id, two.versionId, one.versionId);
    assert.equal(r.setup(s.id).current_version_id, two.versionId);
    assert.throws(
      () => r.chooseVersion(s.id, one.versionId, one.versionId),
      /changed/,
    );
  } finally {
    r.db.close();
  }
});
test("SQL rejects cross-setup pointers and attempts to mutate a sealed version", () => {
  const r = open();
  try {
    const a = setup(r),
      b = setup(r);
    assert.throws(
      () =>
        r.db.run(
          "UPDATE setup_versions SET snapshot=? WHERE id=?",
          "{}",
          a.versionId,
        ),
      /immutable/,
    );
    assert.throws(
      () =>
        r.atomic(() =>
          r.db.run(
            "UPDATE setups SET current_version_id=? WHERE id=?",
            b.versionId,
            a.id,
          ),
        ),
      /FOREIGN KEY/,
    );
    assert.equal(r.setup(a.id).current_version_id, a.versionId);
  } finally {
    r.db.close();
  }
});
test("archive is reversible organisation; Trash blocks edits and preserves history", () => {
  const r = open();
  try {
    const a = setup(r);
    r.archive(a.id, true);
    assert.equal(r.setups().length, 0);
    assert.equal(r.setups("archive").length, 1);
    r.trash(a.id);
    assert.equal(r.setups("trash").length, 1);
    assert.throws(() => r.startRecreation(a.versionId), /Restore/);
    assert.throws(
      () =>
        r.publish({
          id: a.id,
          baseVersion: a.versionId,
          title: "resurrect",
          category: "portrait",
          scene: emptyScene(),
        }),
      /Restore/,
    );
    r.restore(a.id);
    assert.equal(r.setups("archive").length, 1);
    r.archive(a.id, false);
    assert.equal(r.setups().length, 1);
  } finally {
    r.db.close();
  }
});
test("30-day expiry purges descendants and cannot restore expired records", () => {
  let date = new Date("2026-09-10T12:00:00Z");
  const r = open(":memory:", () => date);
  try {
    const a = setup(r);
    r.startRecreation(a.versionId);
    r.trash(a.id);
    date = new Date("2026-10-11T12:00:00Z");
    assert.throws(() => r.restore(a.id), /expired/);
    r.purgeExpired();
    assert.equal(r.db.all("SELECT * FROM setups").length, 0);
    assert.equal(r.db.all("SELECT * FROM setup_versions").length, 0);
    assert.equal(r.db.all("SELECT * FROM recreations").length, 0);
  } finally {
    r.db.close();
  }
});
test("manual matched outcome never becomes algorithmically measured match; completed evidence is immutable", () => {
  const r = open();
  try {
    const s = setup(r),
      a = r.startRecreation(s.versionId);
    r.completeRecreation(a, "matched", "Looked close", emptyScene(), 1200);
    assert.equal(
      JSON.parse(r.recreation(a).evaluation!).result,
      "unverifiable",
    );
    assert.equal(JSON.parse(r.recreation(a).evaluation!).method, "manual");
    assert.throws(
      () => r.completeRecreation(a, "unsuccessful", "overwrite", null, 0),
      /cannot be changed/,
    );
    assert.throws(
      () =>
        r.db.run("UPDATE recreations SET outcome='unsuccessful' WHERE id=?", a),
      /immutable/,
    );
  } finally {
    r.db.close();
  }
});
test("user strings are bound as data, unknown IDs and owner injection are rejected", () => {
  const r = open();
  try {
    const title = "Robert'); DROP TABLE setups;--",
      a = setup(r, title);
    assert.equal(r.setup(a.id).title, title);
    assert.equal(r.setups("active", "' OR 1=1 --").length, 0);
    assert.throws(() => r.setup("' OR 1=1 --"));
    assert.throws(() =>
      r.saveEquipment({
        kind: "light",
        name: "Test",
        manufacturer: null,
        model: null,
        details: {},
        notes: null,
        owner_id: randomUUID(),
      }),
    );
    assert.throws(() =>
      r.db.run("UPDATE setups SET owner_id=? WHERE id=?", randomUUID(), a.id),
    );
  } finally {
    r.db.close();
  }
});
test("missing and purging images cannot be attached; shared historical references survive cleanup", () => {
  const r = open();
  try {
    const id = randomUUID(),
      im = {
        id,
        mime_type: "image/jpeg",
        width_px: 100,
        height_px: 100,
        byte_size: 123,
        sha256: "a".repeat(64),
        optimised_path: id + ".jpg",
      };
    const s = {
      ...emptyScene(),
      images: [{ image_id: id, role: "result" as const, object_id: null }],
    };
    assert.throws(
      () => r.publish({ title: "Missing", category: "portrait", scene: s }),
      /unavailable/,
    );
    r.registerImage(im);
    const a = r.publish({ title: "A", category: "portrait", scene: s }),
      b = r.publish({ title: "B", category: "portrait", scene: s });
    r.trash(a.id);
    r.purgeSetup(a.id);
    assert.equal(r.orphanImages().length, 0);
    r.trash(b.id);
    r.purgeSetup(b.id);
    assert.equal(r.orphanImages().length, 1);
    r.markImagePurging(id);
    assert.throws(
      () => r.publish({ title: "Race", category: "portrait", scene: s }),
      /unavailable/,
    );
    r.finishImagePurge(id);
    assert.equal(r.image(id), null);
  } finally {
    r.db.close();
  }
});
test("image metadata validates storage names and never accepts a traversal path", () => {
  const r = open();
  try {
    assert.throws(() =>
      r.registerImage({
        id: randomUUID(),
        mime_type: "image/jpeg",
        width_px: 100,
        height_px: 100,
        byte_size: 123,
        sha256: "a".repeat(64),
        optimised_path: "../../private.txt",
      }),
    );
  } finally {
    r.db.close();
  }
});
test("unknown schema, nonfinite values and unrelated reference frames are rejected", () => {
  assert.throws(() => parseScene({ ...emptyScene(), schema_version: 99 }));
  assert.throws(() =>
    parseScene({ ...emptyScene(), notes: "x".repeat(600000) }),
  );
  const r = open();
  try {
    const scene = sceneFromDraft(
      { ...blankDraft, title: "Manual", distance: "150", height: "180" },
      r,
    );
    assert.equal(
      scene.objects.find((o) => o.kind === "light")!.measurements[0]!.source,
      "manual",
    );
    scene.objects
      .find((o) => o.kind === "light")!
      .measurements.find((m) => m.kind === "height")!.reference_frame_id =
      randomUUID();
    assert.throws(() => parseScene(scene), /unrelated reference/);
    assert.throws(
      () => sceneFromDraft({ ...blankDraft, distance: "Infinity" }, r),
      /measurement/,
    );
  } finally {
    r.db.close();
  }
});
test("inventory edits cannot alter equipment-at-capture snapshots", () => {
  const r = open();
  try {
    const value = {
        kind: "light",
        name: "Original",
        manufacturer: null,
        model: null,
        details: {},
        notes: null,
      },
      id = r.saveEquipment(value);
    const s = r.publish({
      title: "Light",
      category: "portrait",
      scene: sceneFromDraft({ ...blankDraft, equipmentIds: [id] }, r),
    });
    r.saveEquipment({ ...value, name: "Renamed" }, id);
    r.removeEquipment(id);
    assert.equal(
      r.scene(s.versionId).objects[0]!.equipment[0]!.name,
      "Original",
    );
  } finally {
    r.db.close();
  }
});
test("re-running migrations preserves data; newer schema is refused without deleting data", () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-")),
    path = join(dir, "db");
  let r = open(path);
  try {
    setup(r);
    r.db.exec("PRAGMA user_version=99");
    r.db.close();
    assert.throws(() => open(path), /newer LightGuide/);
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM setups").get()!.n, 1);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("clearing a manual measurement records an unknown correction and retains original evidence", () => {
  const r = open();
  try {
    const original = sceneFromDraft({ ...blankDraft, distance: "150" }, r);
    const next = sceneFromDraft({ ...blankDraft, distance: "" }, r, original);
    const ms = next.objects[0]!.measurements;
    assert.equal(ms[0]!.value, 1.5);
    assert.equal(ms[1]!.value, null);
    assert.equal(ms[1]!.quality, "unavailable");
    assert.equal(ms[1]!.supersedes_measurement_id, ms[0]!.id);
  } finally {
    r.db.close();
  }
});
test("adding and editing another light leaves the first light intact", () => {
  const r = open();
  try {
    const original = sceneFromDraft(
      { ...blankDraft, role: "Key", distance: "150" },
      r,
    );
    const id = r.id();
    const next = sceneFromDraft(
      { ...blankDraft, role: "Fill", distance: "200" },
      r,
      original,
      id,
    );
    const lights = next.objects.filter((o) => o.kind === "light");
    assert.equal(lights.length, 2);
    assert.deepEqual(lights[0], original.objects[0]);
    assert.equal(lights[1]!.id, id);
    assert.equal(lights[1]!.measurements[0]!.value, 2);
  } finally {
    r.db.close();
  }
});
test("permanent setup deletion removes unfinished attempt photo references", () => {
  const r = open();
  try {
    const s = setup(r),
      a = r.startRecreation(s.versionId),
      id = r.id();
    r.registerImage({
      id,
      mime_type: "image/jpeg",
      width_px: 1,
      height_px: 1,
      byte_size: 100,
      sha256: "a".repeat(64),
      optimised_path: id + ".jpg",
      original_path: id + ".original",
    });
    r.saveDraft("attempt-photos:" + a, {
      ...blankDraft,
      images: [{ image_id: id, role: "result", object_id: null }],
    });
    assert.equal(r.orphanImages().length, 0);
    r.trash(s.id);
    r.purgeSetup(s.id);
    assert.equal(r.orphanImages().length, 1);
    assert.equal(r.draft("attempt-photos:" + a), null);
  } finally {
    r.db.close();
  }
});

test("removing inventory equipment clears future shoot references without changing captured evidence", () => {
  const r = open();
  try {
    const gear = r.saveEquipment({
      kind: "reflector",
      name: "Silver reflector",
      manufacturer: null,
      model: null,
      details: {},
      notes: null,
    });
    const shootId = r.saveShoot({
      name: "Portrait session",
      category: "portrait",
      status: "planned",
      scheduled_at: null,
      notes: null,
      planned_equipment_ids: [gear],
    });
    const saved = r.publish({
      title: "Portrait",
      category: "portrait",
      scene: sceneFromDraft({ ...blankDraft, equipmentIds: [gear] }, r),
    });
    r.removeEquipment(gear);
    const plan = r.shoots().find((s) => s.id === shootId)!;
    assert.deepEqual(JSON.parse(plan.planned_equipment_ids), []);
    // Model an existing older-build packing list that still contains a deleted ID.
    r.db.run(
      "UPDATE shoots SET planned_equipment_ids=? WHERE id=?",
      JSON.stringify([gear]),
      shootId,
    );
    r.saveShoot(
      {
        name: plan.name,
        category: plan.category,
        status: plan.status,
        scheduled_at: null,
        notes: null,
        planned_equipment_ids: [gear],
      },
      shootId,
    );
    assert.deepEqual(
      JSON.parse(
        r.shoots().find((s) => s.id === shootId)!.planned_equipment_ids,
      ),
      [],
    );

    assert.doesNotThrow(() =>
      r.saveShoot(
        {
          name: plan.name,
          category: plan.category,
          status: plan.status,
          scheduled_at: null,
          notes: null,
          planned_equipment_ids: JSON.parse(plan.planned_equipment_ids),
        },
        shootId,
      ),
    );
    assert.equal(
      r.scene(saved.versionId).objects.find((o) => o.kind === "light")!
        .equipment[0]!.name,
      "Silver reflector",
    );
  } finally {
    r.db.close();
  }
});

test("recreation outcome choice survives note and step saves", () => {
  const r = open();
  try {
    const saved = setup(r);
    const attempt = r.startRecreation(saved.versionId);
    r.saveRecreationProgress(attempt, 1, "Adjust key", "adapted");
    r.saveRecreationProgress(attempt, 2, "Adjust fill");
    assert.equal(r.setting<any>("attempt:" + attempt, {}).outcome, "adapted");
  } finally {
    r.db.close();
  }
});
