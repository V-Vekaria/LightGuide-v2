import type { Repository } from "../data/repository";
import { emptySettings, parseScene, type Scene } from "../domain/schema";
import type { DeviceInfo, Measurement } from "./protocol";

export function applyDeviceSnapshot(scene: Scene, measurement: Measurement, info: DeviceInfo, repo: Repository): Scene {
  const next = structuredClone(scene);
  let light = next.objects.find((o) => o.kind === "light");
  if (!light) {
    light = { id: repo.id(), kind: "light", role: "Key", name: "Main light", device_id: info.device_id, equipment: [], measurements: [], settings: { ...emptySettings }, notes: null };
    next.objects.push(light);
  }
  light.device_id = info.device_id;
  const capturedAt = repo.now().toISOString();
  const base = { source: "sensor" as const, captured_at: capturedAt, uncertainty: null, device_id: info.device_id, device_uptime_ms: measurement.uptime_ms, firmware_version: info.fw, target_object_id: null, reference_frame_id: null, calibration: null, supersedes_measurement_id: null };
  light.measurements.push({ ...base, id: repo.id(), kind: "distance", value: measurement.tof_valid ? measurement.distance_mm / 1000 : null, unit: "m", quality: measurement.tof_valid ? "valid" : "unavailable" });
  light.measurements.push({ ...base, id: repo.id(), kind: "orientation", value: null, unit: "unit_quaternion", quality: "unavailable" });
  light.measurements.push({ ...base, id: repo.id(), kind: "spectral", value: measurement.spectral_valid ? measurement.spectral.map((value, i) => ({ channel: `raw_${i + 1}`, value, wavelength_nm: null })) : null, unit: "raw_counts", quality: measurement.spectral_valid ? "valid" : "unavailable" });
  return parseScene(next);
}
