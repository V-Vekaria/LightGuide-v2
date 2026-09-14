export type Pose = {
  referenceId: string;
  objectId: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  observedAtMs: number;
  quality: "valid" | "lost" | "stale" | "uncertain";
  source: "phone_ar" | "simulation";
};
export interface SpatialProvider {
  mode: "native" | "simulated" | "unavailable";
  subscribe(listener: (pose: Pose | null) => void): () => void;
  start(): Promise<void>;
  stop(): void;
}
export interface SensorTransport {
  mode: "native" | "simulated" | "unavailable";
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
}
export const unavailableSpatial: SpatialProvider = {
  mode: "unavailable",
  subscribe: () => () => {},
  start: async () => {
    throw new Error(
      "Live positioning is not connected in this build. Use manual recreation or the separate Android measurement app.",
    );
  },
  stop: () => {},
};
export const unavailableSensor: SensorTransport = {
  mode: "unavailable",
  connected: false,
  connect: async () => {
    throw new Error(
      "Live sensor transport awaits the verified node and BLE contract.",
    );
  },
  disconnect: () => {},
};
export function evaluatePose(
  target: Pose,
  current: Pose | null,
  nowMs: number,
) {
  const valid = (p: Pose) =>
    p.position.every(Number.isFinite) &&
    p.quaternion.every(Number.isFinite) &&
    Math.abs(Math.hypot(...p.quaternion) - 1) <= 0.001 &&
    p.quality === "valid";
  if (
    !Number.isFinite(nowMs) ||
    !current ||
    !Number.isFinite(current.observedAtMs) ||
    !valid(target) ||
    !valid(current) ||
    target.referenceId !== current.referenceId ||
    target.objectId !== current.objectId ||
    nowMs < current.observedAtMs ||
    nowMs - current.observedAtMs > 750
  )
    return {
      result: "unverifiable" as const,
      label: "Reacquire the reference",
      delta: null,
    };
  const delta = current.position.map((v, i) => v - target.position[i]!) as [
    number,
    number,
    number,
  ];
  const angle =
    (2 *
      Math.acos(
        Math.min(
          1,
          Math.abs(
            current.quaternion.reduce(
              (s, v, i) => s + v * target.quaternion[i]!,
              0,
            ),
          ),
        ),
      ) *
      180) /
    Math.PI;
  const inside = Math.hypot(...delta) <= 0.03 && angle <= 3;
  const simulated =
    target.source === "simulation" || current.source === "simulation";
  return {
    result: simulated
      ? ("unverifiable" as const)
      : inside
        ? ("matched" as const)
        : ("not_matched" as const),
    label: simulated
      ? inside
        ? "Simulated: within tolerance"
        : "Simulated: adjust position"
      : inside
        ? "Within tolerance"
        : "Adjust position",
    delta,
    angle,
  };
}
