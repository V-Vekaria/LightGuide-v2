import type { DeviceInfo, Measurement } from "./protocol";

export type PendingDeviceSnapshot = {
  measurement: Measurement;
  info: DeviceInfo;
  receivedAt: number;
};

let pending: PendingDeviceSnapshot | null = null;

export function setPendingDeviceSnapshot(snapshot: PendingDeviceSnapshot) {
  pending = snapshot;
}

export function takePendingDeviceSnapshot(maxAgeMs = 5000): PendingDeviceSnapshot | null {
  const value = pending;
  pending = null;
  if (!value || Date.now() - value.receivedAt > maxAgeMs) return null;
  return value;
}
