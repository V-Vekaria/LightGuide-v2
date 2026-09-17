import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoLight,
  demoConnected,
  demoCue,
  demoRestored,
  movedDemo,
  nextDemoField,
  savedLight,
  unknownLight,
  parseManualCm,
  manualCue,
} from "../src/domain/recreation-guide";
import { emptyScene, emptySettings, type Scene } from "../src/domain/schema";

test("six demo corrections restore position, orientation and power without mutating the saved target", () => {
  const saved = { ...demoLight };
  let current = movedDemo(saved);
  const cues: string[] = [];
  for (let i = 0; i < 6; i++) {
    cues.push(demoCue(saved, current, demoConnected, false));
    const key = nextDemoField(saved, current)!;
    current = { ...current, [key]: saved[key] };
  }
  assert.deepEqual(cues, [
    "Move left 55 cm",
    "Move towards subject 60 cm",
    "Lower light 30 cm",
    "Turn right 25°",
    "Tilt up 12°",
    "Set power to 55%",
  ]);
  assert(demoRestored(saved, current, demoConnected));
  assert.match(demoCue(saved, current, demoConnected, false), /simulated/);
  assert.match(demoCue(saved, current, demoConnected, true), /ambient changed/);
  assert.deepEqual(saved, demoLight);
});
test("node, Bluetooth and reference failures withdraw restored status even at the saved pose", () => {
  for (const key of ["node", "bluetooth", "reference"] as const) {
    const link = { ...demoConnected, [key]: false };
    assert.equal(demoRestored(demoLight, demoLight, link), false);
    assert(!demoCue(demoLight, demoLight, link, false).includes("restored"));
  }
  assert.equal(
    demoRestored(demoLight, { ...demoLight, x: null }, demoConnected),
    false,
  );
});
test("demo uses total position error and combined orientation, not permissive per-axis matching", () => {
  const current = {
    ...demoLight,
    x: demoLight.x! + 2,
    z: demoLight.z! + 2,
    height: demoLight.height! + 2,
  };
  assert.equal(demoRestored(demoLight, current, demoConnected), false);
  assert.equal(nextDemoField(demoLight, current), "x");
  assert.equal(
    demoRestored(
      demoLight,
      { ...demoLight, yaw: demoLight.yaw! + 2.9, tilt: demoLight.tilt! + 2.9 },
      demoConnected,
    ),
    false,
  );
});
test("empty, invalid and nonfinite manual values stay unknown while a genuine zero is retained", () => {
  for (const value of ["", " ", "abc", "-1", "Infinity", "NaN", "100001"])
    assert.equal(parseManualCm(value), null);
  assert.equal(parseManualCm("0"), 0);
  assert.equal(parseManualCm("175.5"), 175.5);
  assert.match(manualCue(unknownLight, unknownLight), /saved photo/);
  assert.match(
    manualCue({ ...unknownLight, height: 170 }, unknownLight),
    /Check the saved/,
  );
  assert.equal(
    manualCue(
      { ...unknownLight, height: 170 },
      { ...unknownLight, height: 200 },
    ),
    "Lower light 30 cm",
  );
  assert.equal(
    manualCue(
      { ...unknownLight, distance: 150 },
      { ...unknownLight, distance: 100 },
    ),
    "Increase distance to subject by 50 cm",
  );
  assert.equal(
    manualCue(
      { ...unknownLight, height: 170 },
      { ...unknownLight, height: 170 },
    ),
    "Entered values agree; check the photograph",
  );
});
test("saved targets preserve unknowns, corrections and per-light identity; distance never invents position", () => {
  const scene: Scene = {
    ...emptyScene(),
    objects: [
      {
        id: "subject",
        kind: "subject",
        role: null,
        name: "Subject",
        device_id: null,
        equipment: [],
        measurements: [],
        settings: { ...emptySettings },
        notes: null,
      },
      {
        id: "key",
        kind: "light",
        role: "Key",
        name: "Key",
        device_id: null,
        equipment: [],
        measurements: [],
        settings: { ...emptySettings, power_label: "1/16" },
        notes: null,
      },
      {
        id: "fill",
        kind: "light",
        role: "Fill",
        name: "Fill",
        device_id: null,
        equipment: [],
        measurements: [],
        settings: { ...emptySettings },
        notes: null,
      },
    ],
  };
  const m: Scene["objects"][number]["measurements"][number] = {
    id: "m1",
    kind: "distance",
    value: 1.5,
    unit: "m",
    source: "manual",
    quality: "uncertain",
    captured_at: "2026-09-17T00:00:00Z",
    uncertainty: null,
    device_id: null,
    device_uptime_ms: null,
    firmware_version: null,
    target_object_id: "subject",
    reference_frame_id: null,
    calibration: null,
    supersedes_measurement_id: null,
  };
  scene.objects[1]!.measurements.push(m);
  assert.deepEqual(savedLight(scene, "key"), {
    ...unknownLight,
    distance: 150,
    power: "1/16",
  });
  assert.deepEqual(savedLight(scene, "fill"), unknownLight);
  scene.objects[1]!.measurements.push({
    ...m,
    id: "m2",
    value: null,
    quality: "unavailable",
    supersedes_measurement_id: "m1",
  });
  assert.equal(savedLight(scene, "key").distance, null);
  scene.objects[1]!.measurements.push({
    ...m,
    id: "m3",
    target_object_id: "fill",
    supersedes_measurement_id: "m2",
  });
  assert.equal(savedLight(scene, "key").distance, null);
});
