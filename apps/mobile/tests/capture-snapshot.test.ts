import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyScene } from "../src/domain/schema";
import type { Repository } from "../src/data/repository";
import { setPendingDeviceSnapshot } from "../src/device/pending-snapshot";
import { applyPendingDeviceSnapshot } from "../src/device/capture-snapshot";
import type { DeviceInfo, Measurement } from "../src/device/protocol";

const info: DeviceInfo = { v:2, type:"device_info", device_id:"lg-node-001", fw:"0.1.0", hw:"esp32s3-n16r8-eval", cap:["tof","imu","spectral","save_button"] };
const measurement: Measurement = { v:2, type:"measurement", seq:2, uptime_ms:20, distance_mm:812, roll_deg:1, pitch_deg:2, yaw_deg:3, tof_valid:true, imu_valid:true, spectral_valid:true, spectral_gain:2048, spectral:Array(13).fill(1) };
let nextId=0;
const repo = { id:()=>`00000000-0000-4000-8000-${String(++nextId).padStart(12,"0")}`, now:()=>new Date("2026-09-23T00:00:00.000Z") } as unknown as Repository;

test("sensor capture consumes one fresh pending snapshot and preserves protocol provenance",()=>{
  setPendingDeviceSnapshot({measurement,info,receivedAt:Date.now()});
  const scene=applyPendingDeviceSnapshot(emptyScene(),repo);
  const light=scene.objects.find(o=>o.kind==="light");
  assert.ok(light);
  const distance=light.measurements.find(m=>m.kind==="distance");
  assert.equal(distance?.value,0.812);
  assert.equal(distance?.device_id,"lg-node-001");
  assert.equal(distance?.firmware_version,"0.1.0");
  const spectral=light.measurements.find(m=>m.kind==="spectral");
  assert.equal(spectral?.unit,"counts_per_gain");
  assert.equal(Array.isArray(spectral?.value)?spectral.value.length:0,13);
  assert.throws(()=>applyPendingDeviceSnapshot(emptyScene(),repo),/expired/);
});

test("expired sensor capture fails instead of silently publishing manual-only data",()=>{
  setPendingDeviceSnapshot({measurement,info,receivedAt:Date.now()-6000});
  assert.throws(()=>applyPendingDeviceSnapshot(emptyScene(),repo),/expired/);
});
