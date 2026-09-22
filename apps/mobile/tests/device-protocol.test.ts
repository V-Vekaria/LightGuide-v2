import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCommand, eventKey, LIGHTGUIDE_UUIDS, parseDeviceInfo, parseEvent, parseMeasurement, parseStatus } from "../src/device/protocol";

test("protocol v1 UUIDs stay locked to the shared contract", () => {
  assert.deepEqual(LIGHTGUIDE_UUIDS, {
    service:"7d6f0001-5a6b-4c47-9a41-4c6967687447", deviceInfo:"7d6f0002-5a6b-4c47-9a41-4c6967687447",
    measurement:"7d6f0003-5a6b-4c47-9a41-4c6967687447", event:"7d6f0004-5a6b-4c47-9a41-4c6967687447",
    command:"7d6f0005-5a6b-4c47-9a41-4c6967687447", status:"7d6f0006-5a6b-4c47-9a41-4c6967687447",
  });
});
test("parses valid device info, measurement, status and save event", () => {
  assert.equal(parseDeviceInfo('{"v":1,"type":"device_info","device_id":"lg-node-001","fw":"0.1.0","hw":"esp32s3-n16r8-eval","cap":["tof","imu","spectral","save_button"]}').device_id,"lg-node-001");
  const m=parseMeasurement('{"v":1,"type":"measurement","seq":42,"uptime_ms":12345,"distance_mm":812,"roll_deg":1.2,"pitch_deg":-3.4,"yaw_deg":87.6,"tof_valid":true,"imu_valid":true,"spectral_valid":true,"spectral":[12,18,25,31,40,52,61,70,65,58,49,37,28,21,16,11,8,5]}');
  assert.equal(m.spectral.length,18); assert.equal(m.distance_mm,812);
  assert.equal(parseStatus('{"v":1,"type":"status","seq":44,"uptime_ms":12600,"state":"degraded","tof":true,"imu":false,"spectral":true,"error":"imu unavailable"}').imu,false);
  assert.equal(eventKey("session-a",parseEvent('{"v":1,"type":"event","seq":43,"uptime_ms":12500,"event":"save_pressed"}')),"session-a:43");
});
test("rejects incompatible, incomplete and malformed protocol data", () => {
  assert.throws(()=>parseMeasurement('{"v":2,"type":"measurement"}'),/Unsupported/);
  assert.throws(()=>parseMeasurement('{"v":1,"type":"measurement","seq":1,"uptime_ms":1,"distance_mm":0,"roll_deg":0,"pitch_deg":0,"yaw_deg":0,"tof_valid":false,"imu_valid":false,"spectral_valid":false,"spectral":[1]}'),/18/);
  assert.throws(()=>parseEvent('{"v":1,"type":"event","seq":1,"uptime_ms":1,"event":"other"}'),/Unsupported device event/);
  assert.throws(()=>parseStatus('{"v":1,"type":"status","seq":1,"uptime_ms":1,"state":"ok","tof":true,"imu":true,"spectral":true,"error":null}'),/Invalid device state/);
});
test("encodes only protocol v1 commands", () => {
  assert.equal(encodeCommand("request_status"),'{"v":1,"type":"command","command":"request_status"}');
});
