import type { Repository } from "../data/repository";
import type { Scene } from "../domain/schema";
import { takePendingDeviceSnapshot } from "./pending-snapshot";
import { applyDeviceSnapshot } from "./snapshot";

export function applyPendingDeviceSnapshot(
  scene: Scene,
  repo: Repository,
  maxAgeMs = 5000,
): Scene {
  const snapshot = takePendingDeviceSnapshot(maxAgeMs);
  if (!snapshot) {
    throw new Error(
      "The LightGuide sensor snapshot expired. Press the device save button again before saving this setup.",
    );
  }
  return applyDeviceSnapshot(scene, snapshot.measurement, snapshot.info, repo);
}
