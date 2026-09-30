import { z } from "zod";
import { dateError, dateKey, todayKey } from "../domain/shoot-dates";
import { migration, migrationV2 } from "./migration";
import {
  parseScene,
  uuid,
  category,
  equipmentInput,
  shootInput,
  outcomeSchema,
  tolerances,
  type Scene,
  type Outcome,
} from "../domain/schema";

export type SqlValue = string | number | null;
export type AttemptReading = {
  distance: string;
  height: string;
  updatedAt: string;
};
export interface Database {
  exec(sql: string): void;
  run(sql: string, ...values: SqlValue[]): { changes: number };
  all<T>(sql: string, ...values: SqlValue[]): T[];
  close(): void;
}
export type Setup = {
  id: string;
  title: string;
  category: "portrait" | "product";
  current_version_id: string;
  archived_at: string | null;
  deleted_at: string | null;
  purge_after: string | null;
  created_at: string;
  updated_at: string;
};
export type Version = {
  id: string;
  setup_id: string;
  parent_version_id: string | null;
  snapshot: string;
  created_at: string;
};
export type Equipment = {
  id: string;
  kind: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  notes: string | null;
  details: string;
};
export type Shoot = {
  id: string;
  scheduled_at: string | null;
  name: string;
  category: "portrait" | "product";
  status: string;
  notes: string | null;
  planned_equipment_ids: string;
};
export type Recreation = {
  id: string;
  setup_version_id: string;
  shoot_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  outcome: Outcome | null;
  duration_ms: number | null;
  actual_snapshot: string | null;
  feedback: string;
  evaluation: string | null;
};
export type ImageRecord = {
  id: string;
  mime_type: string;
  width_px: number;
  height_px: number;
  byte_size: number;
  sha256: string;
  optimised_path: string;
  upload_state: string;
};
export const captureDraftSchema = z
  .object({
    title: z.string().max(120),
    category,
    notes: z.string().max(4000),
    role: z.string().max(80),
    power: z.string().max(80),
    modifier: z.string().max(240),
    distance: z.string().max(20),
    height: z.string().max(20),
    equipmentIds: z.array(uuid).max(32),
    camera: z
      .object({
        focal: z.string().max(30),
        aperture: z.string().max(30),
        shutter: z.string().max(30),
        iso: z.string().max(30),
        equipmentIds: z.array(uuid).max(32),
      })
      .strict()
      .optional(),
    images: z
      .array(
        z
          .object({
            image_id: uuid,
            role: z.enum(["result", "setup", "reference", "pose"]),
            object_id: uuid.nullable(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export type CaptureDraft = z.infer<typeof captureDraftSchema>;
const imageSchema = z
  .object({
    id: uuid,
    mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    width_px: z.number().int().min(1).max(20000),
    height_px: z.number().int().min(1).max(20000),
    byte_size: z.number().int().min(1).max(10485760),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    optimised_path: z.string().regex(/^[a-f0-9-]{36}\.(jpg|png|webp)$/),
    original_path: z
      .string()
      .regex(/^[a-f0-9-]{36}\.original$/)
      .optional(),
  })
  .strict();
const TRASH_DAYS = 30;

export const DEMO_SETUP_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_RESULT_IMAGE_ID = "10000000-0000-4000-8000-000000000003";
export const DEMO_PLACEMENT_IMAGE_ID = "10000000-0000-4000-8000-000000000004";

export class Repository {
  constructor(
    readonly db: Database,
    readonly id: () => string,
    readonly now: () => Date = () => new Date(),
  ) {
    db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    const v = db.all<{ user_version: number }>("PRAGMA user_version")[0]!
      .user_version;
    if (v > 2)
      throw new Error(
        "This database needs a newer LightGuide app. Your data has been preserved.",
      );
    if (v === 0) this.atomic(() => db.exec(migration));
    if (v < 2)
      this.atomic(() => {
        db.exec(migrationV2);
        if (db.all("PRAGMA foreign_key_check").length)
          throw new Error(
            "Upgrade integrity check failed; existing data preserved.",
          );
      });
    if (
      db.all<{ foreign_keys: number }>("PRAGMA foreign_keys")[0]
        ?.foreign_keys !== 1
    )
      throw new Error("Data integrity checks could not be enabled");
  }

  ensureAcceptanceSeed() {
    if (this.setting("acceptance-seed-v1", false)) return;
    const at = this.timestamp();
    this.atomic(() => {
      const versionId = "10000000-0000-4000-8000-000000000002";
      const keyLightId = "10000000-0000-4000-8000-000000000005";
      const cameraId = "10000000-0000-4000-8000-000000000006";
      const frameId = "10000000-0000-4000-8000-000000000007";
      const subjectId = "10000000-0000-4000-8000-000000000014";
      const equipment = [
        ["10000000-0000-4000-8000-000000000010", "light", "Main flash — Demo", null, null],
        ["10000000-0000-4000-8000-000000000011", "modifier", "Softbox 100 cm — Demo", null, null],
        ["10000000-0000-4000-8000-000000000012", "camera", "Sony A7 III — Demo", "Sony", "A7 III"],
        ["10000000-0000-4000-8000-000000000013", "lens", "85 mm lens — Demo", "Sony", "FE 85 mm f/1.8"],
      ] as const;
      for (const [id, kind, name, manufacturer, model] of equipment)
        this.db.run(
          "INSERT OR IGNORE INTO equipment(id,created_at,updated_at,kind,name,manufacturer,model,details,notes) VALUES(?,?,?,?,?,?,?,'{}',?)",
          id,
          at,
          at,
          kind,
          name,
          manufacturer,
          model,
          "Bundled example equipment. Edit or remove it from your inventory at any time.",
        );
      const imageRows = [
        [DEMO_RESULT_IMAGE_ID, 1408, 1408, 2042742, "80dac44bb41aba6ec220ea26cb9c6ca392d3710c1479b4c95331bad5da88757e"],
        [DEMO_PLACEMENT_IMAGE_ID, 1456, 1088, 1894051, "d8087a87d3b7b281736b39c553a403d0b11f9784dc08dbd97894d83bb8ce492c"],
      ] as const;
      for (const [id, width, height, bytes, sha] of imageRows) {
        this.db.run(
          "INSERT OR IGNORE INTO images(id,created_at,updated_at,mime_type,width_px,height_px,byte_size,sha256) VALUES(?,?,?,'image/png',?,?,?,?)",
          id,
          at,
          at,
          width,
          height,
          bytes,
          sha,
        );
        this.db.run(
          "INSERT OR IGNORE INTO local_media(image_id,optimised_path,transfer_state) VALUES(?,?,'available')",
          id,
          id + ".png",
        );
      }
      const measurement = (
        id: string,
        kind: "height" | "distance",
        value: number,
        target: string | null,
      ) => ({
        id,
        kind,
        value,
        unit: "m",
        source: "manual" as const,
        captured_at: at,
        quality: "valid" as const,
        uncertainty: null,
        device_id: null,
        device_uptime_ms: null,
        firmware_version: null,
        target_object_id: target,
        reference_frame_id: frameId,
        calibration: null,
        supersedes_measurement_id: null,
      });
      const scene: Scene = {
        schema_version: 1,
        reference_frame: {
          id: frameId,
          convention: "subject_floor_rh_v1",
          reference_image_id: DEMO_PLACEMENT_IMAGE_ID,
          marker_id: null,
          marker_width_m: null,
          established_at: at,
          source: "manual",
          status: "valid",
          world_from_reference: null,
        },
        objects: [
          {
            id: subjectId,
            kind: "subject",
            role: "Portrait subject",
            name: "Demo subject position",
            device_id: null,
            equipment: [],
            measurements: [],
            settings: {
              power_label: null,
              focal_length_mm: null,
              aperture_f: null,
              exposure_time_s: null,
              iso: null,
              modifier_description: null,
              pose_image_id: null,
            },
            notes: "Front of the stool aligned with the saved floor reference.",
          },
          {
            id: keyLightId,
            kind: "light",
            role: "Key light",
            name: "Main softbox",
            device_id: null,
            equipment: equipment.slice(0, 2).map(([equipment_id, kind, name, manufacturer, model]) => ({
              equipment_id,
              kind,
              name,
              manufacturer,
              model,
              details: {},
            })),
            measurements: [
              measurement("10000000-0000-4000-8000-000000000008", "height", 1.7, null),
              measurement("10000000-0000-4000-8000-000000000009", "distance", 1.5, subjectId),
            ],
            settings: {
              power_label: "1/8",
              focal_length_mm: null,
              aperture_f: null,
              exposure_time_s: null,
              iso: null,
              modifier_description: "Softbox 100 cm",
              pose_image_id: DEMO_PLACEMENT_IMAGE_ID,
            },
            notes: "Example data — manual measurements only. Height is not device-measured.",
          },
          {
            id: cameraId,
            kind: "camera",
            role: "Main camera",
            name: "Sony A7 III",
            device_id: null,
            equipment: equipment.slice(2).map(([equipment_id, kind, name, manufacturer, model]) => ({
              equipment_id,
              kind,
              name,
              manufacturer,
              model,
              details: {},
            })),
            measurements: [],
            settings: {
              power_label: null,
              focal_length_mm: 85,
              aperture_f: 4,
              exposure_time_s: 0.005,
              iso: 100,
              modifier_description: null,
              pose_image_id: null,
            },
            notes: "White balance 5600 K",
          },
        ],
        images: [
          { image_id: DEMO_RESULT_IMAGE_ID, role: "result", object_id: null },
          { image_id: DEMO_PLACEMENT_IMAGE_ID, role: "setup", object_id: keyLightId },
        ],
        notes: "EXAMPLE SETUP / DEMO. Bundled for first-run testing; it is not user-created content.",
      };
      parseScene(scene);
      this.db.run(
        "INSERT OR IGNORE INTO setups(id,created_at,updated_at,title,category,current_version_id) VALUES(?,?,?,?,?,?)",
        DEMO_SETUP_ID,
        at,
        at,
        "Soft portrait — Example setup",
        "portrait",
        versionId,
      );
      this.db.run(
        "INSERT OR IGNORE INTO setup_versions(id,created_at,updated_at,setup_id,parent_version_id,snapshot_schema_version,snapshot) VALUES(?,?,?,?,NULL,1,?)",
        versionId,
        at,
        at,
        DEMO_SETUP_ID,
        JSON.stringify(scene),
      );
      this.db.run(
        "INSERT OR IGNORE INTO local_settings(key,value) VALUES('acceptance-seed-v1','true')",
      );
    });
  }

  isExampleSetup(id: string) {
    return id === DEMO_SETUP_ID;
  }
  atomic<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = work();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private timestamp() {
    return this.now().toISOString();
  }
  private one<T>(sql: string, ...args: SqlValue[]): T {
    const row = this.db.all<T>(sql, ...args)[0];
    if (!row) throw new Error("This record is unavailable.");
    return row;
  }
  setups(
    filter: "active" | "archive" | "trash" = "active",
    query = "",
  ): Setup[] {
    const where =
      filter === "trash"
        ? "deleted_at IS NOT NULL"
        : filter === "archive"
          ? "deleted_at IS NULL AND archived_at IS NOT NULL"
          : "deleted_at IS NULL AND archived_at IS NULL";
    return this.db.all<Setup>(
      `SELECT * FROM setups WHERE ${where} AND instr(lower(title),lower(?))>0 ORDER BY updated_at DESC,id`,
      query.slice(0, 120),
    );
  }
  setup(id: string): Setup {
    return this.one("SELECT * FROM setups WHERE id=?", uuid.parse(id));
  }
  version(id: string): Version {
    return this.one("SELECT * FROM setup_versions WHERE id=?", uuid.parse(id));
  }
  versions(setupId: string): Version[] {
    return this.db.all(
      "SELECT * FROM setup_versions WHERE setup_id=? ORDER BY created_at DESC,rowid DESC",
      uuid.parse(setupId),
    );
  }
  scene(versionId: string): Scene {
    return parseScene(JSON.parse(this.version(versionId).snapshot));
  }
  private checkImages(scene: Scene) {
    const refs = new Set([
      ...scene.images.map((i) => i.image_id),
      ...scene.objects.flatMap((o) =>
        o.settings.pose_image_id ? [o.settings.pose_image_id] : [],
      ),
      ...(scene.reference_frame?.reference_image_id
        ? [scene.reference_frame.reference_image_id]
        : []),
    ]);
    for (const id of refs)
      this.one(
        "SELECT id FROM images WHERE id=? AND owner_id IS NULL AND deleted_at IS NULL AND upload_state NOT IN ('purging','purged')",
        id,
      );
  }
  publish(input: {
    id?: string;
    baseVersion?: string;
    title: string;
    category: "portrait" | "product";
    scene: Scene;
    draftKey?: string;
  }): { id: string; versionId: string; conflict: boolean } {
    const title = z
      .string()
      .trim()
      .min(1, "Give this setup a name")
      .max(120)
      .parse(input.title);
    category.parse(input.category);
    const scene = parseScene(input.scene),
      stamp = this.timestamp(),
      id = input.id ? uuid.parse(input.id) : this.id(),
      versionId = this.id();
    return this.atomic(() => {
      this.checkImages(scene);
      let parent: string | null = null,
        conflict = false;
      if (input.id) {
        const old = this.setup(id);
        if (old.deleted_at)
          throw new Error("Restore this setup from Trash before editing.");
        parent = uuid.parse(input.baseVersion);
        const v = this.version(parent);
        if (v.setup_id !== id)
          throw new Error("Version belongs to another setup");
        conflict = old.current_version_id !== parent;
      } else
        this.db.run(
          "INSERT INTO setups(id,created_at,updated_at,title,category) VALUES(?,?,?,?,?)",
          id,
          stamp,
          stamp,
          title,
          input.category,
        );
      this.db.run(
        "INSERT INTO setup_versions(id,created_at,updated_at,setup_id,parent_version_id,snapshot_schema_version,snapshot) VALUES(?,?,?,?,?,1,?)",
        versionId,
        stamp,
        stamp,
        id,
        parent,
        JSON.stringify(scene),
      );
      if (!conflict)
        this.db.run(
          "UPDATE setups SET current_version_id=?,title=?,category=?,updated_at=? WHERE id=?",
          versionId,
          title,
          input.category,
          stamp,
          id,
        );
      if (input.draftKey)
        this.db.run("DELETE FROM working_drafts WHERE id=?", input.draftKey);
      return { id, versionId, conflict };
    });
  }
  chooseVersion(setupId: string, versionId: string, expected: string) {
    this.atomic(() => {
      const s = this.setup(setupId);
      if (s.deleted_at || s.current_version_id !== expected)
        throw new Error("Setup changed. Reopen its history before choosing.");
      if (this.version(versionId).setup_id !== setupId)
        throw new Error("Version belongs to another setup");
      this.db.run(
        "UPDATE setups SET current_version_id=?,updated_at=? WHERE id=?",
        versionId,
        this.timestamp(),
        setupId,
      );
    });
  }
  archive(id: string, archived: boolean) {
    const s = this.setup(id);
    if (s.deleted_at) throw new Error("Restore from Trash first");
    this.db.run(
      "UPDATE setups SET archived_at=?,updated_at=? WHERE id=?",
      archived ? this.timestamp() : null,
      this.timestamp(),
      id,
    );
  }
  trash(id: string) {
    const s = this.setup(id);
    if (s.deleted_at) return;
    const at = this.now(),
      purge = new Date(at.getTime() + TRASH_DAYS * 86400000).toISOString();
    this.db.run(
      "UPDATE setups SET deleted_at=?,purge_after=?,updated_at=? WHERE id=?",
      at.toISOString(),
      purge,
      at.toISOString(),
      id,
    );
  }
  restore(id: string) {
    const s = this.setup(id);
    if (!s.deleted_at) return;
    if (s.purge_after! <= this.timestamp())
      throw new Error("The 30-day restore period has expired.");
    this.db.run(
      "UPDATE setups SET deleted_at=NULL,purge_after=NULL,updated_at=? WHERE id=?",
      this.timestamp(),
      id,
    );
  }
  purgeSetup(id: string) {
    this.atomic(() => {
      const s = this.setup(id);
      if (!s.deleted_at)
        throw new Error(
          "Move the setup to Trash before permanently deleting it.",
        );
      for (const r of this.recreations(id)) {
        this.db.run(
          "DELETE FROM working_drafts WHERE id=?",
          "attempt-photos:" + r.id,
        );
        this.db.run(
          "DELETE FROM local_settings WHERE key IN (?,?,?,?)",
          "attempt:" + r.id,
          "timer:" + r.id,
          "attempt-readings:" + r.id,
          "workspace:" + r.id,
        );
      }
      this.db.run("UPDATE setups SET current_version_id=NULL WHERE id=?", id);
      this.db.run("DELETE FROM setups WHERE id=?", id);
      this.db.run("DELETE FROM working_drafts WHERE entity_id=?", id);
    });
  }
  purgeExpired() {
    for (const s of this.db.all<Setup>(
      "SELECT * FROM setups WHERE purge_after IS NOT NULL AND purge_after<=?",
      this.timestamp(),
    ))
      this.purgeSetup(s.id);
  }
  equipment(): Equipment[] {
    return this.db.all(
      "SELECT * FROM equipment WHERE deleted_at IS NULL ORDER BY name",
    );
  }
  saveEquipment(value: unknown, id?: string) {
    const e = equipmentInput.parse(value),
      key = id ? uuid.parse(id) : this.id(),
      at = this.timestamp();
    if (id)
      this.one(
        "SELECT id FROM equipment WHERE id=? AND deleted_at IS NULL",
        id,
      );
    this.db.run(
      "INSERT INTO equipment(id,created_at,updated_at,kind,name,manufacturer,model,details,notes) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,kind=excluded.kind,name=excluded.name,manufacturer=excluded.manufacturer,model=excluded.model,details=excluded.details,notes=excluded.notes",
      key,
      at,
      at,
      e.kind,
      e.name,
      e.manufacturer,
      e.model,
      JSON.stringify(e.details),
      e.notes,
    );
    return key;
  }
  removeEquipment(id: string) {
    uuid.parse(id);
    this.atomic(() => {
      this.db.run(
        "UPDATE equipment SET deleted_at=?,purge_after=?,updated_at=? WHERE id=?",
        this.timestamp(),
        new Date(this.now().getTime() + TRASH_DAYS * 86400000).toISOString(),
        this.timestamp(),
        id,
      );
      // Future packing lists reference live inventory. Historical scene snapshots
      // remain immutable and retain the equipment as it was at capture time.
      for (const shoot of this.shoots()) {
        const ids: string[] = JSON.parse(shoot.planned_equipment_ids);
        if (ids.includes(id))
          this.db.run(
            "UPDATE shoots SET planned_equipment_ids=?,updated_at=? WHERE id=?",
            JSON.stringify(ids.filter((item) => item !== id)),
            this.timestamp(),
            shoot.id,
          );
      }
    });
  }
  shoots(): Shoot[] {
    return this.db.all(
      "SELECT * FROM shoots WHERE deleted_at IS NULL ORDER BY updated_at DESC",
    );
  }
  saveShoot(value: unknown, id?: string) {
    const s = shootInput.parse(value),
      key = id ? uuid.parse(id) : this.id(),
      at = this.timestamp();
    const previous = id
      ? this.one<Shoot>(
          "SELECT * FROM shoots WHERE id=? AND deleted_at IS NULL",
          id,
        )
      : null;
    const invalidDate = dateError(
      dateKey(s.scheduled_at),
      todayKey(this.now()),
      previous?.scheduled_at,
    );
    if (invalidDate) throw new Error(invalidDate);
    const previousIds: string[] = previous
      ? JSON.parse(previous.planned_equipment_ids)
      : [];
    const plannedIds = s.planned_equipment_ids.filter((equipmentId) => {
      const equipment = this.one<{ deleted_at: string | null }>(
        "SELECT deleted_at FROM equipment WHERE id=?",
        equipmentId,
      );
      if (!equipment.deleted_at) return true;
      // Repair packing lists saved before inventory deletion cleared references.
      if (previousIds.includes(equipmentId)) return false;
      throw new Error("Selected equipment is no longer available.");
    });
    this.db.run(
      "INSERT INTO shoots(id,created_at,updated_at,name,category,status,scheduled_at,notes,planned_equipment_ids) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,name=excluded.name,category=excluded.category,status=excluded.status,scheduled_at=excluded.scheduled_at,notes=excluded.notes,planned_equipment_ids=excluded.planned_equipment_ids",
      key,
      at,
      at,
      s.name,
      s.category,
      s.status,
      s.scheduled_at,
      s.notes,
      JSON.stringify([...new Set(plannedIds)]),
    );
    return key;
  }
  saveDraft(
    key: string,
    value: unknown,
    entityId: string | null = null,
    baseVersion: string | null = null,
  ) {
    const data = captureDraftSchema.parse(value);
    if (entityId) uuid.parse(entityId);
    if (baseVersion) uuid.parse(baseVersion);
    this.db.run(
      "INSERT INTO working_drafts(id,entity_type,entity_id,base_version_id,payload,updated_at) VALUES(?,'capture',?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
      key,
      entityId,
      baseVersion,
      JSON.stringify(data),
      this.timestamp(),
    );
  }
  draft(
    key: string,
  ): { data: CaptureDraft; baseVersion: string | null } | null {
    const r = this.db.all<{ payload: string; base_version_id: string | null }>(
      "SELECT payload,base_version_id FROM working_drafts WHERE id=?",
      key,
    )[0];
    return r
      ? {
          data: captureDraftSchema.parse(JSON.parse(r.payload)),
          baseVersion: r.base_version_id,
        }
      : null;
  }
  discardDraft(key: string) {
    this.db.run("DELETE FROM working_drafts WHERE id=?", key);
  }
  startRecreation(versionId: string, shootId: string | null = null) {
    const v = this.version(versionId),
      s = this.setup(v.setup_id);
    if (s.deleted_at) throw new Error("Restore this setup first");
    if (shootId)
      this.one(
        "SELECT id FROM shoots WHERE id=? AND deleted_at IS NULL",
        uuid.parse(shootId),
      );
    const id = this.id(),
      at = this.timestamp();
    this.db.run(
      "INSERT INTO recreations(id,created_at,updated_at,setup_version_id,shoot_id,started_at,status,tolerances) VALUES(?,?,?,?,?,?,'in_progress',?)",
      id,
      at,
      at,
      versionId,
      shootId,
      at,
      JSON.stringify(tolerances),
    );
    return id;
  }
  recreation(id: string): Recreation {
    return this.one(
      "SELECT * FROM recreations WHERE id=? AND deleted_at IS NULL",
      uuid.parse(id),
    );
  }
  recreations(setupId?: string): Recreation[] {
    return setupId
      ? this.db.all(
          "SELECT r.* FROM recreations r JOIN setup_versions v ON r.setup_version_id=v.id WHERE v.setup_id=? AND r.deleted_at IS NULL ORDER BY r.started_at DESC",
          uuid.parse(setupId),
        )
      : this.db.all(
          "SELECT r.* FROM recreations r JOIN setup_versions v ON r.setup_version_id=v.id JOIN setups s ON v.setup_id=s.id WHERE r.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY r.started_at DESC",
        );
  }
  saveRecreationProgress(
    id: string,
    step: number,
    notes: string,
    outcome?: Outcome,
  ) {
    z.number().int().min(0).max(128).parse(step);
    z.string().max(4000).parse(notes);
    const r = this.recreation(id);
    if (r.status !== "in_progress")
      throw new Error("Attempt is already finished");
    this.db.run(
      "INSERT INTO local_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      "attempt:" + id,
      JSON.stringify({
        step,
        notes,
        outcome: outcomeSchema
          .nullable()
          .parse(
            outcome ??
              this.setting<{ outcome?: Outcome | null }>("attempt:" + id, {})
                .outcome ??
              null,
          ),
      }),
    );
  }
  recreationReadings(id: string): Record<string, AttemptReading> {
    if (this.recreation(id).status !== "in_progress") return {};
    const saved = this.setting<Record<string, AttemptReading> | null>(
      "attempt-readings:" + id, null,
    );
    if (saved !== null) return saved;
    const legacy = this.setting<{
      readings?: Record<string, { distance: string; height: string }>;
    }>("workspace:" + id, {});
    const readings = Object.fromEntries(
      Object.entries(legacy.readings ?? {}).map(([key, value]) => [key, {
        distance: value.distance,
        height: value.height,
        // Older builds did not record when these manual values were entered.
        updatedAt: "",
      }]),
    );
    if (Object.keys(readings).length) this.setSetting("attempt-readings:" + id, readings);
    return readings;
  }
  abandonRecreation(id: string) {
    const attempt = this.recreation(id);
    if (attempt.status !== "in_progress") return;
    this.atomic(() => {
      this.db.run(
        "UPDATE recreations SET status='abandoned',updated_at=? WHERE id=?",
        this.timestamp(),
        id,
      );
      this.db.run(
        "DELETE FROM local_settings WHERE key IN (?,?,?,?)",
        "attempt:" + id,
        "timer:" + id,
        "attempt-readings:" + id,
        "workspace:" + id,
      );
      this.db.run("DELETE FROM working_drafts WHERE id=?", "attempt-photos:" + id);
    });
  }
  completeRecreation(
    id: string,
    outcome: Outcome,
    notes: string,
    actual: Scene | null,
    durationMs: number | null,
  ) {
    outcomeSchema.parse(outcome);
    z.string().max(4000).parse(notes);
    if (durationMs !== null)
      z.number().int().nonnegative().safe().parse(durationMs);
    this.atomic(() => {
      const r = this.recreation(id),
        s = this.setup(this.version(r.setup_version_id).setup_id);
      if (r.status !== "in_progress" || s.deleted_at)
        throw new Error("This attempt cannot be changed.");
      if (actual) {
        actual = parseScene(actual);
        this.checkImages(actual);
      }
      const at = this.timestamp();
      if (at < r.started_at)
        throw new Error(
          "The device clock moved backwards. Correct it before finishing.",
        );
      this.db.run(
        "UPDATE recreations SET status='completed',outcome=?,completed_at=?,updated_at=?,duration_ms=?,actual_snapshot=?,evaluation=?,feedback=? WHERE id=?",
        outcome,
        at,
        at,
        durationMs,
        actual ? JSON.stringify(actual) : null,
        JSON.stringify({
          schema_version: 1,
          method: "manual",
          algorithm_version: "manual-v1",
          evaluated_at: at,
          metrics: [],
          result: "unverifiable",
        }),
        JSON.stringify({ notes, difficulty: null, usefulness: null }),
        id,
      );
      this.db.run("DELETE FROM local_settings WHERE key=?", "attempt:" + id);
      this.db.run("DELETE FROM local_settings WHERE key=?", "attempt-readings:" + id);
    });
  }
  registerImage(value: unknown) {
    const im = imageSchema.parse(value),
      at = this.timestamp();
    if (
      !im.optimised_path.startsWith(im.id + ".") ||
      (im.original_path && im.original_path !== im.id + ".original")
    )
      throw new Error("Image path must match its identity");
    this.atomic(() => {
      this.db.run(
        "INSERT INTO images(id,created_at,updated_at,mime_type,width_px,height_px,byte_size,sha256) VALUES(?,?,?,?,?,?,?,?)",
        im.id,
        at,
        at,
        im.mime_type,
        im.width_px,
        im.height_px,
        im.byte_size,
        im.sha256,
      );
      this.db.run(
        "INSERT INTO local_media(image_id,optimised_path,original_path,transfer_state) VALUES(?,?,?,'available')",
        im.id,
        im.optimised_path,
        im.original_path ?? null,
      );
    });
    return im.id;
  }
  image(id: string): ImageRecord | null {
    return (
      this.db.all<ImageRecord>(
        "SELECT i.*,m.optimised_path FROM images i JOIN local_media m ON i.id=m.image_id WHERE i.id=? AND i.deleted_at IS NULL AND i.upload_state NOT IN ('purging','purged')",
        uuid.parse(id),
      )[0] ?? null
    );
  }
  orphanImages(): ImageRecord[] {
    const used = new Set<string>();
    const add = (s: Scene) => {
      s.images.forEach((i) => used.add(i.image_id));
      s.objects.forEach((o) => {
        if (o.settings.pose_image_id) used.add(o.settings.pose_image_id);
      });
      if (s.reference_frame?.reference_image_id)
        used.add(s.reference_frame.reference_image_id);
    };
    for (const v of this.db.all<{ snapshot: string }>(
      "SELECT snapshot FROM setup_versions",
    ))
      add(parseScene(JSON.parse(v.snapshot)));
    for (const a of this.db.all<{ actual_snapshot: string }>(
      "SELECT actual_snapshot FROM recreations WHERE actual_snapshot IS NOT NULL",
    ))
      add(parseScene(JSON.parse(a.actual_snapshot)));
    for (const d of this.db.all<{ payload: string }>(
      "SELECT payload FROM working_drafts WHERE entity_type='capture'",
    ))
      captureDraftSchema
        .parse(JSON.parse(d.payload))
        .images.forEach((i) => used.add(i.image_id));
    return this.db
      .all<ImageRecord>(
        "SELECT i.*,m.optimised_path FROM images i JOIN local_media m ON i.id=m.image_id",
      )
      .filter((i) => !used.has(i.id));
  }
  markImagePurging(id: string) {
    if (!this.orphanImages().some((i) => i.id === id))
      throw new Error("Image is still referenced");
    this.db.run("UPDATE images SET upload_state='purging' WHERE id=?", id);
  }
  finishImagePurge(id: string) {
    this.db.run("DELETE FROM images WHERE id=? AND upload_state='purging'", id);
  }
  setting<T>(key: string, fallback: T): T {
    const r = this.db.all<{ value: string }>(
      "SELECT value FROM local_settings WHERE key=?",
      key,
    )[0];
    return r ? (JSON.parse(r.value) as T) : fallback;
  }
  setSetting(key: string, value: unknown) {
    const encoded = JSON.stringify(value);
    if (encoded.length > 65536) throw new Error("Setting is too large");
    this.db.run(
      "INSERT INTO local_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      encoded,
    );
  }
  exportSetup(id: string) {
    const s = this.setup(id);
    return JSON.stringify(
      {
        format: "lightguide-setup-notes",
        schema_version: 1,
        exported_at: this.timestamp(),
        photos_included: false,
        setup: s,
        versions: this.versions(id).map((v) => ({
          ...v,
          snapshot: JSON.parse(v.snapshot),
        })),
        recreations: this.recreations(id).map((r) => ({
          ...r,
          actual_snapshot: r.actual_snapshot
            ? JSON.parse(r.actual_snapshot)
            : null,
          feedback: JSON.parse(r.feedback),
        })),
      },
      null,
      2,
    );
  }
}
