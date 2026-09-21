import { z } from "zod";

export const uuid = z.string().uuid();
const stamp = z.string().datetime({ offset: true });
const finite = z.number().finite();
const positive = finite.positive();
const text = z.string().max(4000).nullable();
const short = z.string().max(120).nullable();
const vec = z.tuple([finite, finite, finite]);
const quat = z
  .tuple([finite, finite, finite, finite])
  .refine(
    (q) => Math.abs(Math.hypot(...q) - 1) <= 0.001,
    "Orientation must be a unit quaternion",
  );
const transform = z.object({ position_m: vec, quaternion_xyzw: quat }).strict();
export const category = z.enum(["portrait", "product"]);
export const kind = z.enum([
  "camera",
  "lens",
  "light",
  "modifier",
  "reflector",
  "other",
]);
export const equipmentDetails = z
  .object({
    mount: short.optional(),
    focal_length_min_mm: positive.nullable().optional(),
    focal_length_max_mm: positive.nullable().optional(),
    modifier_width_m: positive.nullable().optional(),
    modifier_height_m: positive.nullable().optional(),
    specifications: z
      .array(
        z
          .object({
            name: z.string().max(80),
            value: z.string().max(240),
            unit: short,
          })
          .strict(),
      )
      .max(32)
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.focal_length_min_mm == null ||
      v.focal_length_max_mm == null ||
      v.focal_length_min_mm <= v.focal_length_max_mm,
  );
export const equipmentInput = z
  .object({
    kind,
    name: z.string().trim().min(1).max(120),
    manufacturer: short,
    model: short,
    details: equipmentDetails,
    notes: text,
  })
  .strict();
export const shootInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    category,
    status: z.enum(["draft", "planned", "active", "completed"]),
    scheduled_at: stamp.nullable(),
    notes: text,
    planned_equipment_ids: z.array(uuid).max(64),
  })
  .strict();
const settings = z
  .object({
    power_label: z.string().max(80).nullable(),
    focal_length_mm: positive.nullable(),
    aperture_f: positive.nullable(),
    exposure_time_s: positive.nullable(),
    iso: positive.nullable(),
    modifier_description: z.string().max(240).nullable(),
    pose_image_id: uuid.nullable(),
  })
  .strict();
const calibration = z
  .object({
    id: uuid,
    schema_version: z.literal(1),
    calibrated_at: stamp,
    method: z.string().max(120),
    sensor_model: z.string().max(120),
    mounting_description: z.string().max(240).nullable(),
    reference_frame_id: uuid.nullable(),
    object_from_sensor: transform.nullable(),
    parameters: z
      .array(
        z
          .object({
            name: z.string().max(120),
            value: z.union([finite, z.array(finite).max(32)]),
            unit: z.string().max(80),
          })
          .strict(),
      )
      .max(32),
    spectral_acquisition: z
      .object({ gain: positive, integration_time_ms: positive })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
const measurement = z
  .object({
    id: uuid,
    kind: z.enum([
      "position",
      "orientation",
      "distance",
      "height",
      "brightness",
      "spectral",
    ]),
    value: z
      .union([
        finite,
        z.array(finite).max(4),
        z
          .array(
            z
              .object({
                channel: z.string().max(80),
                value: finite,
                wavelength_nm: positive.nullable(),
              })
              .strict(),
          )
          .max(32),
      ])
      .nullable(),
    unit: z.string().min(1).max(80),
    source: z.enum(["manual", "phone_ar", "sensor", "estimate"]),
    captured_at: stamp,
    quality: z.enum(["valid", "uncertain", "stale", "unavailable", "invalid"]),
    uncertainty: z
      .union([finite.nonnegative(), z.array(finite.nonnegative()).max(32)])
      .nullable(),
    device_id: short,
    device_uptime_ms: z.number().int().nonnegative().nullable(),
    firmware_version: short,
    target_object_id: uuid.nullable(),
    reference_frame_id: uuid.nullable(),
    calibration: calibration.nullable(),
    supersedes_measurement_id: uuid.nullable(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (m.quality === "unavailable" || m.quality === "invalid") {
      if (m.value !== null) fail("Unavailable values must be null");
      return;
    }
    if (m.value === null) {
      fail("An available measurement needs a value");
      return;
    }
    if (
      m.kind === "position" &&
      (!vec.safeParse(m.value).success || m.unit !== "m")
    )
      fail("Position requires three metres");
    if (
      m.kind === "orientation" &&
      (!quat.safeParse(m.value).success || m.unit !== "unit_quaternion")
    )
      fail("Orientation requires a unit quaternion");
    if (
      ["distance", "height", "brightness"].includes(m.kind) &&
      (typeof m.value !== "number" || m.value < 0)
    )
      fail("Measurement must be nonnegative");
    if (["distance", "height"].includes(m.kind) && m.unit !== "m")
      fail("Distance and height use metres");
    if (
      m.kind === "spectral" &&
      (!Array.isArray(m.value) || m.value.some((v) => typeof v !== "object"))
    )
      fail("Spectral measurement requires channels");
  });
export const sceneSchema = z
  .object({
    schema_version: z.literal(1),
    reference_frame: z
      .object({
        id: uuid,
        convention: z.literal("subject_floor_rh_v1"),
        reference_image_id: uuid.nullable(),
        marker_id: short,
        marker_width_m: positive.nullable(),
        established_at: stamp,
        source: z.enum(["manual", "phone_ar"]),
        status: z.enum(["valid", "uncertain", "lost"]),
        world_from_reference: transform.nullable(),
      })
      .strict()
      .nullable(),
    objects: z
      .array(
        z
          .object({
            id: uuid,
            kind: z.enum(["light", "camera", "subject", "background"]),
            role: z.string().max(80).nullable(),
            name: short,
            device_id: short,
            equipment: z
              .array(
                equipmentInput
                  .omit({ notes: true })
                  .extend({ equipment_id: uuid.nullable() }),
              )
              .max(32),
            measurements: z.array(measurement).max(128),
            settings,
            notes: text,
          })
          .strict(),
      )
      .max(64),
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
    notes: text,
  })
  .strict()
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = s.objects.map((o) => o.id);
    if (new Set(ids).size !== ids.length) fail("Duplicate object IDs");
    const ms = s.objects.flatMap((o) => o.measurements);
    if (new Set(ms.map((m) => m.id)).size !== ms.length)
      fail("Duplicate measurement IDs");
    const byId = new Map(ms.map((m) => [m.id, m]));
    for (const m of ms) {
      if (
        ["position", "orientation", "height"].includes(m.kind) &&
        m.value !== null &&
        (!s.reference_frame || m.reference_frame_id !== s.reference_frame.id)
      )
        fail("Spatial measurement has an unrelated reference");
      if (m.target_object_id && !ids.includes(m.target_object_id))
        fail("Unknown distance target");
      const seen = new Set([m.id]);
      let p = m.supersedes_measurement_id;
      while (p) {
        if (seen.has(p) || !byId.has(p)) {
          fail("Invalid correction chain");
          break;
        }
        seen.add(p);
        p = byId.get(p)!.supersedes_measurement_id;
      }
    }
    for (const im of s.images)
      if (im.object_id && !ids.includes(im.object_id))
        fail("Unknown image object");
  });
export type Scene = z.infer<typeof sceneSchema>;
export type EquipmentInput = z.infer<typeof equipmentInput>;
export type ShootInput = z.infer<typeof shootInput>;
export const tolerances = {
  schema_version: 1,
  distance_m: 0.03,
  height_m: 0.03,
  direction_deg: 3,
  tilt_deg: 3,
  brightness_relative: 0.1,
  spectral_mode: "experimental",
  enabled_metrics: ["distance", "height", "direction", "tilt"],
} as const;
export const outcomeSchema = z.enum([
  "matched",
  "close_enough",
  "adapted",
  "unsuccessful",
  "not_evaluated",
]);
export type Outcome = z.infer<typeof outcomeSchema>;
export const emptySettings: Scene["objects"][number]["settings"] = {
  power_label: null,
  focal_length_mm: null,
  aperture_f: null,
  exposure_time_s: null,
  iso: null,
  modifier_description: null,
  pose_image_id: null,
};
export function parseScene(value: unknown): Scene {
  const encoded = JSON.stringify(value);
  if (!encoded || new TextEncoder().encode(encoded).length > 512 * 1024)
    throw new Error("Setup snapshot exceeds 512 KiB");
  return sceneSchema.parse(value);
}
export function emptyScene(): Scene {
  return {
    schema_version: 1,
    reference_frame: null,
    objects: [],
    images: [],
    notes: null,
  };
}
export function humanError(error: unknown): string {
  return error instanceof z.ZodError
    ? (error.issues[0]?.message ?? "Invalid input")
    : error instanceof Error
      ? error.message
      : "The operation could not be completed.";
}
