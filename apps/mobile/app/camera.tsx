import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/ui/Store";
import {
  Body,
  Button,
  Card,
  ErrorMessage,
  Field,
  Screen,
} from "../src/ui/components";
import { emptySettings, humanError, type Scene } from "../src/domain/schema";

export default function Camera() {
  const { repo, refresh } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [initial] = useState(() => {
    try {
      const setup = repo.setup(id);
      return {
        setup,
        scene: repo.scene(setup.current_version_id),
        error: null,
      };
    } catch (e) {
      return { setup: null, scene: null, error: humanError(e) };
    }
  });
  const camera = initial.scene?.objects.find((o) => o.kind === "camera");
  const [values, setValues] = useState({
    focal: String(camera?.settings.focal_length_mm ?? ""),
    aperture: String(camera?.settings.aperture_f ?? ""),
    shutter: String(camera?.settings.exposure_time_s ?? ""),
    iso: String(camera?.settings.iso ?? ""),
    notes: camera?.notes ?? "",
  });
  const [gear, setGear] = useState(
    camera?.equipment.flatMap((e) =>
      e.equipment_id ? [e.equipment_id] : [],
    ) ?? [],
  );
  const [error, setError] = useState<string | null>(initial.error);
  const number = (raw: string, max: number) => {
    if (!raw.trim()) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > max)
      throw new Error(
        "Use positive numeric camera settings within the supported range.",
      );
    return n;
  };
  const save = () => {
    try {
      if (!initial.scene || !initial.setup)
        throw new Error("Setup unavailable");
      const scene = structuredClone(initial.scene);
      let object = scene.objects.find((o) => o.kind === "camera");
      if (!object) {
        object = {
          id: repo.id(),
          kind: "camera",
          name: "Camera",
          role: null,
          device_id: null,
          measurements: [],
          equipment: [],
          settings: { ...emptySettings },
          notes: null,
        };
        scene.objects.push(object);
      }
      object.settings = {
        ...object.settings,
        focal_length_mm: number(values.focal, 10000),
        aperture_f: number(values.aperture, 256),
        exposure_time_s: number(values.shutter, 86400),
        iso: number(values.iso, 10000000),
      };
      object.notes = values.notes.trim() || null;
      object.equipment = gear.map((id) => {
        const e = repo.equipment().find((e) => e.id === id);
        const old = camera?.equipment.find((e) => e.equipment_id === id);
        if (!e && old) return old;
        if (!e) throw new Error("Equipment unavailable");
        return {
          equipment_id: e.id,
          kind: e.kind as "camera" | "lens",
          name: e.name,
          manufacturer: e.manufacturer,
          model: e.model,
          details: JSON.parse(e.details),
        };
      });
      const result = repo.publish({
        id,
        baseVersion: initial.setup.current_version_id,
        title: initial.setup.title,
        category: initial.setup.category,
        scene,
      });
      refresh();
      router.replace({
        pathname: "/setup/[id]",
        params: { id, conflict: result.conflict ? "1" : undefined },
      });
    } catch (e) {
      setError(humanError(e));
    }
  };
  return (
    <Screen
      back
      title="Remember your camera."
      subtitle="Optional settings for the next time you recreate this setup."
    >
      <ErrorMessage message={error} />
      <Card>
        <Field
          label="Focal length (mm)"
          numeric
          value={values.focal}
          onChange={(focal) => setValues({ ...values, focal })}
        />
        <Field
          label="Aperture (f-number)"
          numeric
          value={values.aperture}
          onChange={(aperture) => setValues({ ...values, aperture })}
        />
        <Field
          label="Exposure time (seconds)"
          numeric
          value={values.shutter}
          onChange={(shutter) => setValues({ ...values, shutter })}
          placeholder="0.005 for 1/200 second"
        />
        <Field
          label="ISO"
          numeric
          value={values.iso}
          onChange={(iso) => setValues({ ...values, iso })}
        />
        <Field
          label="Camera position and framing notes"
          multiline
          value={values.notes}
          onChange={(notes) => setValues({ ...values, notes })}
        />
        <Body muted>
          Select the camera and lens used. These details remain attached to this
          version.
        </Body>
        {repo
          .equipment()
          .filter((e) => ["camera", "lens"].includes(e.kind))
          .map((e) => (
            <Button
              key={e.id}
              kind="secondary"
              title={(gear.includes(e.id) ? "✓ " : "＋ ") + e.name}
              onPress={() =>
                setGear(
                  gear.includes(e.id)
                    ? gear.filter((i) => i !== e.id)
                    : [...gear, e.id],
                )
              }
            />
          ))}
      </Card>
      <Button
        title="Save camera settings"
        disabled={!initial.setup}
        onPress={save}
      />
    </Screen>
  );
}
