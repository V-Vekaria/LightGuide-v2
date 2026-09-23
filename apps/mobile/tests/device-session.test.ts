import { test } from "node:test";
import assert from "node:assert/strict";
import { initialDeviceSession, isMeasurementFresh, reduceDeviceSession, shouldHandleSaveEvent } from "../src/device/session";
import type { DeviceEvent, DeviceInfo, DeviceStatus, Measurement } from "../src/device/protocol";

const info: DeviceInfo = { v:2, type:"device_info", device_id:"lg-node-001", fw:"0.1.0", hw:"esp32s3-n16r8-eval", cap:["tof","imu","spectral","save_button"] };
const status: DeviceStatus = { v:2, type:"status", seq:1, uptime_ms:10, state:"ready", tof:true, imu:true, spectral:true, error:null };
const measurement: Measurement = { v:2, type:"measurement", seq:2, uptime_ms:20, distance_mm:812, roll_deg:1, pitch_deg:2, yaw_deg:3, tof_valid:true, imu_valid:true, spectral_valid:true, spectral_gain:2048, spectral:Array(13).fill(1) };
const save: DeviceEvent = { v:2, type:"event", seq:3, uptime_ms:30, event:"save_pressed" };

test("connected is reached only after subscription phase supplies info and status", () => {
  let s=initialDeviceSession();
  s=reduceDeviceSession(s,{type:"scan_started"}); assert.equal(s.phase,"scanning");
  s=reduceDeviceSession(s,{type:"connecting",sessionId:"session-a"}); assert.equal(s.phase,"connecting");
  s=reduceDeviceSession(s,{type:"subscribing"}); assert.equal(s.phase,"subscribing");
  s=reduceDeviceSession(s,{type:"connected",info,status}); assert.equal(s.phase,"connected");
  assert.equal(s.deviceInfo?.device_id,"lg-node-001");
});

test("disconnect immediately invalidates live readings but leaves identity for diagnosis", () => {
  let s=reduceDeviceSession(initialDeviceSession(),{type:"connecting",sessionId:"session-a"});
  s=reduceDeviceSession(s,{type:"connected",info,status});
  s=reduceDeviceSession(s,{type:"measurement",value:measurement,receivedAt:1000});
  assert.equal(isMeasurementFresh(s,1500),true);
  s=reduceDeviceSession(s,{type:"disconnected"});
  assert.equal(s.phase,"disconnected"); assert.equal(s.measurement,null); assert.equal(s.status,null);
  assert.equal(s.deviceInfo?.device_id,"lg-node-001");
});

test("stale or duplicate save events cannot trigger app-side capture", () => {
  let s=reduceDeviceSession(initialDeviceSession(),{type:"connecting",sessionId:"session-a"});
  s=reduceDeviceSession(s,{type:"connected",info,status});
  s=reduceDeviceSession(s,{type:"measurement",value:measurement,receivedAt:1000});
  assert.equal(shouldHandleSaveEvent(s,save,1500),true);
  assert.equal(shouldHandleSaveEvent(s,save,2501),false);
  s=reduceDeviceSession(s,{type:"event",value:save});
  assert.equal(shouldHandleSaveEvent(s,save,1500),false);
});

test("a reconnect gets a new dedupe namespace", () => {
  let s=reduceDeviceSession(initialDeviceSession(),{type:"connecting",sessionId:"session-a"});
  s=reduceDeviceSession(s,{type:"connected",info,status});
  s=reduceDeviceSession(s,{type:"measurement",value:measurement,receivedAt:1000});
  s=reduceDeviceSession(s,{type:"event",value:save});
  s=reduceDeviceSession(s,{type:"disconnected"});
  s=reduceDeviceSession(s,{type:"connecting",sessionId:"session-b"});
  s=reduceDeviceSession(s,{type:"connected",info,status});
  s=reduceDeviceSession(s,{type:"measurement",value:measurement,receivedAt:2000});
  assert.equal(shouldHandleSaveEvent(s,save,2100),true);
});

test("unsupported and failed sessions clear live data", () => {
  let s=reduceDeviceSession(initialDeviceSession(),{type:"connecting",sessionId:"session-a"});
  s=reduceDeviceSession(s,{type:"connected",info,status});
  s=reduceDeviceSession(s,{type:"measurement",value:measurement,receivedAt:1000});
  s=reduceDeviceSession(s,{type:"unsupported",message:"Protocol v3 is not supported"});
  assert.equal(s.phase,"unsupported"); assert.equal(s.measurement,null);
  s=reduceDeviceSession(s,{type:"failed",message:"Subscription failed"});
  assert.equal(s.phase,"error"); assert.equal(s.measurement,null);
});
