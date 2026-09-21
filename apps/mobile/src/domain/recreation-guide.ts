import type { Scene } from "./schema";
import { evaluatePose, type Pose } from "./spatial";

// Display values are centimetres/degrees; persistence remains in metres.
export type LightState = {
  x: number | null;
  z: number | null;
  height: number | null;
  yaw: number | null;
  tilt: number | null;
  distance: number | null;
  power: string | null;
};
export const unknownLight: LightState = {
  x: null,
  z: null,
  height: null,
  yaw: null,
  tilt: null,
  distance: null,
  power: null,
};
export const demoLight: LightState = {
  x: -90,
  z: 170,
  height: 170,
  yaw: 28,
  tilt: 18,
  distance: null,
  power: "55%",
};
export const lightFields = [
  ["x", "Left / right", "cm"],
  ["z", "Front distance", "cm"],
  ["height", "Height", "cm"],
  ["yaw", "Direction", "°"],
  ["tilt", "Tilt down", "°"],
  ["distance", "Distance to subject", "cm"],
  ["power", "Power", ""],
] as const;
export function formatLight(value: number | string | null, unit: string) {
  return value == null
    ? "Not recorded"
    : typeof value === "number"
      ? `${Number(value.toFixed(1))}${unit === "°" ? "" : " "}${unit}`.trim()
      : value;
}

export function savedLight(scene: Scene, lightId?: string): LightState {
  const light = scene.objects.find(
    (o) => o.kind === "light" && (!lightId || o.id === lightId),
  );
  if (!light) return { ...unknownLight };
  const latest = (kind: string) =>
    light.measurements
      .filter(
        (m) =>
          m.kind === kind &&
          !light.measurements.some((n) => n.supersedes_measurement_id === m.id),
      )
      .at(-1);
  const scalar = (kind: string) => {
    const m = latest(kind);
    if (
      !m ||
      !["valid", "uncertain"].includes(m.quality) ||
      m.unit !== "m" ||
      typeof m.value !== "number"
    )
      return null;
    // A distance to another object is not a distance to the subject.
    if (
      kind === "distance" &&
      !scene.objects.some(
        (o) => o.kind === "subject" && o.id === m.target_object_id,
      )
    )
      return null;
    return m.value * 100;
  };
  // Scalar range is not a 3D position. Never invent lateral/front coordinates.
  return {
    ...unknownLight,
    height: scalar("height"),
    distance: scalar("distance"),
    power: light.settings.power_label,
  };
}
export function parseManualCm(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null;
}
export function manualCue(saved: LightState, current: LightState) {
  for (const key of ["distance", "height"] as const) {
    const goal = saved[key],
      now = current[key];
    if (goal === null || now === null) continue;
    const d = now - goal;
    if (Math.abs(d) > 3)
      return key === "height"
        ? `${d > 0 ? "Lower" : "Raise"} light ${Number(Math.abs(d).toFixed(1))} cm`
        : `${d > 0 ? "Reduce" : "Increase"} distance to subject by ${Number(Math.abs(d).toFixed(1))} cm`;
  }
  const keys = (["distance", "height"] as const).filter(
    (k) => saved[k] !== null,
  );
  if (!keys.length) return "Position your light using the saved photo";
  if (keys.some((k) => current[k] === null))
    return "Check the saved measurements";
  return "Entered values agree; check the photograph";
}

export type DemoConnection = {
  node: boolean;
  bluetooth: boolean;
  reference: boolean;
};
export const demoConnected: DemoConnection = {
  node: true,
  bluetooth: true,
  reference: true,
};
export function demoPause(link: DemoConnection): string | null {
  return !link.node
    ? "Power on the stand module"
    : !link.bluetooth
      ? "Reconnect Bluetooth"
      : !link.reference
        ? "Find the saved reference"
        : null;
}
function demoPose(v: LightState): Pose {
  const yaw = ((v.yaw ?? NaN) * Math.PI) / 360,
    pitch = ((v.tilt ?? NaN) * Math.PI) / 360;
  return {
    referenceId: "demo-reference",
    objectId: "demo-light",
    position: [(v.x ?? NaN) / 100, (v.height ?? NaN) / 100, (v.z ?? NaN) / 100],
    quaternion: [
      Math.cos(yaw) * Math.sin(pitch),
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(yaw) * Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ],
    observedAtMs: 0,
    quality: "valid",
    source: "simulation",
  };
}
export function nextDemoField(
  saved: LightState,
  current: LightState,
): keyof LightState | null {
  const result = evaluatePose(demoPose(saved), demoPose(current), 0);
  if (!result.delta) return null;
  if (Math.hypot(...result.delta) > 0.03) {
    return (
      (["x", "z", "height"] as const).find(
        (k) => Math.abs(current[k]! - saved[k]!) > 0.00001,
      ) ?? null
    );
  }
  if ((result.angle ?? Infinity) > 3) {
    return (
      (["yaw", "tilt"] as const).find(
        (k) => Math.abs(current[k]! - saved[k]!) > 0.00001,
      ) ?? null
    );
  }
  return current.power !== saved.power ? "power" : null;
}
export function demoRestored(
  saved: LightState,
  current: LightState,
  link: DemoConnection,
) {
  const pose = evaluatePose(demoPose(saved), demoPose(current), 0);
  return (
    !demoPause(link) &&
    !!pose.delta &&
    Math.hypot(...pose.delta) <= 0.03 &&
    (pose.angle ?? Infinity) <= 3 &&
    current.power === saved.power
  );
}
export function demoCue(
  saved: LightState,
  current: LightState,
  link: DemoConnection,
  ambientChanged: boolean,
) {
  const pause = demoPause(link);
  if (pause) return pause;
  const field = nextDemoField(saved, current);
  if (!field)
    return demoRestored(saved, current, link)
      ? ambientChanged
        ? "Position restored; ambient changed"
        : "Saved settings restored — simulated"
      : "Position unavailable";
  if (field === "power") return `Set power to ${saved.power}`;
  const d = (current[field] as number) - (saved[field] as number),
    n = Number(Math.abs(d).toFixed(1));
  if (field === "x") return `Move ${d > 0 ? "left" : "right"} ${n} cm`;
  if (field === "z")
    return `Move ${d > 0 ? "towards" : "away from"} subject ${n} cm`;
  if (field === "height") return `${d > 0 ? "Lower" : "Raise"} light ${n} cm`;
  if (field === "yaw") return `Turn ${d > 0 ? "left" : "right"} ${n}°`;
  return `Tilt ${d > 0 ? "up" : "down"} ${n}°`;
}
export function movedDemo(v: LightState): LightState {
  return {
    ...v,
    x: v.x! + 55,
    z: v.z! + 60,
    height: v.height! + 30,
    yaw: v.yaw! - 25,
    tilt: v.tilt! + 12,
    power: v.power === "70%" ? "55%" : "70%",
  };
}
