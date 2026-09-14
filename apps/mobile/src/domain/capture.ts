import { emptyScene, emptySettings, parseScene, type Scene } from "./schema";
import type { CaptureDraft, Repository } from "../data/repository";
export const blankDraft: CaptureDraft = {
  title: "",
  category: "portrait",
  notes: "",
  role: "Key",
  power: "",
  modifier: "",
  distance: "",
  height: "",
  equipmentIds: [],
  images: [],
};
export function draftFromScene(
  title: string,
  category: "portrait" | "product",
  scene: Scene,
  lightId?: string,
): CaptureDraft {
  const light = scene.objects.find(
    (o) => o.kind === "light" && (!lightId || o.id === lightId),
  );
  const value = (kind: string) => {
    const m = light?.measurements.filter((m) => m.kind === kind).at(-1);
    return m && typeof m.value === "number"
      ? String(Math.round((m.value as number) * 10000) / 100)
      : "";
  };
  return {
    ...blankDraft,
    title,
    category,
    notes: scene.notes ?? "",
    role: light?.role ?? "Key",
    power: light?.settings.power_label ?? "",
    modifier: light?.settings.modifier_description ?? "",
    distance: value("distance"),
    height: value("height"),
    equipmentIds:
      light?.equipment.flatMap((e) =>
        e.equipment_id ? [e.equipment_id] : [],
      ) ?? [],
    images: scene.images,
  };
}
export function sceneFromDraft(
  d: CaptureDraft,
  repo: Repository,
  base: Scene = emptyScene(),
  lightId?: string,
): Scene {
  const s = structuredClone(base);
  s.notes = d.notes.trim() || null;
  s.images = d.images;
  let light = s.objects.find(
    (o) => o.kind === "light" && (!lightId || o.id === lightId),
  );
  if (!light) {
    light = {
      id: lightId ?? repo.id(),
      kind: "light",
      role: d.role,
      name: "Main light",
      device_id: null,
      equipment: [],
      measurements: [],
      settings: { ...emptySettings },
      notes: null,
    };
    s.objects.push(light);
  }
  light.role = d.role.trim() || null;
  light.settings = {
    ...light.settings,
    power_label: d.power.trim() || null,
    modifier_description: d.modifier.trim() || null,
  };
  light.equipment = d.equipmentIds.map((id) => {
    const e = repo.equipment().find((e) => e.id === id);
    if (!e) {
      const saved = light!.equipment.find((e) => e.equipment_id === id);
      if (saved) return saved;
      throw new Error("Selected equipment is no longer available.");
    }
    return {
      equipment_id: e.id,
      kind: e.kind as "light",
      name: e.name,
      manufacturer: e.manufacturer,
      model: e.model,
      details: JSON.parse(e.details),
    };
  });
  for (const [kind, raw] of [
    ["distance", d.distance],
    ["height", d.height],
  ] as const) {
    const old = light.measurements.filter((m) => m.kind === kind).at(-1);
    if (!raw.trim()) {
      if (old && old.value !== null)
        light.measurements.push({
          ...old,
          id: repo.id(),
          value: null,
          quality: "unavailable",
          source: "manual",
          captured_at: repo.now().toISOString(),
          supersedes_measurement_id: old.id,
          calibration: null,
          device_id: null,
          device_uptime_ms: null,
          firmware_version: null,
        });
      continue;
    }
    const cm = Number(raw);
    if (!Number.isFinite(cm) || cm < 0 || cm > 100000)
      throw new Error("Enter a measurement between 0 and 100,000 cm.");
    if (!s.reference_frame)
      s.reference_frame = {
        id: repo.id(),
        convention: "subject_floor_rh_v1",
        reference_image_id: null,
        marker_id: null,
        marker_width_m: null,
        established_at: repo.now().toISOString(),
        source: "manual",
        status: "uncertain",
        world_from_reference: null,
      };
    let subject = s.objects.find((o) => o.kind === "subject");
    if (!subject) {
      subject = {
        id: repo.id(),
        kind: "subject",
        name: "Subject",
        role: null,
        device_id: null,
        equipment: [],
        measurements: [],
        settings: { ...emptySettings },
        notes: null,
      };
      s.objects.push(subject);
    }
    if (old?.value === cm / 100 && old.source === "manual") continue;
    light.measurements.push({
      id: repo.id(),
      kind,
      value: cm / 100,
      unit: "m",
      source: "manual",
      captured_at: repo.now().toISOString(),
      quality: "uncertain",
      uncertainty: null,
      device_id: null,
      device_uptime_ms: null,
      firmware_version: null,
      target_object_id: kind === "distance" ? subject.id : null,
      reference_frame_id: s.reference_frame.id,
      calibration: null,
      supersedes_measurement_id: old?.id ?? null,
    });
  }
  return parseScene(s);
}
