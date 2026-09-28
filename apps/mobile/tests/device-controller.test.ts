import { test } from "node:test";
import assert from "node:assert/strict";
import { DeviceController } from "../src/device/controller";
import { devicePresentation } from "../src/device/session";
import { takePendingDeviceSnapshot } from "../src/device/pending-snapshot";
import type { BleCallbacks } from "../src/device/ble";
import type {
  DeviceInfo,
  DeviceStatus,
  Measurement,
} from "../src/device/protocol";
const info: DeviceInfo = {
  v: 2,
  type: "device_info",
  device_id: "node",
  fw: "test",
  hw: "test",
  cap: ["tof"],
};
const status: DeviceStatus = {
  v: 2,
  type: "status",
  seq: 1,
  uptime_ms: 1,
  state: "ready",
  tof: true,
  imu: true,
  spectral: true,
  error: null,
};
const reading: Measurement = {
  v: 2,
  type: "measurement",
  seq: 2,
  uptime_ms: 2,
  distance_mm: 900,
  roll_deg: 0,
  pitch_deg: 0,
  yaw_deg: 0,
  tof_valid: true,
  imu_valid: true,
  spectral_valid: true,
  spectral_gain: 1,
  spectral: Array(13).fill(1),
};
class FakeTransport {
  callbacks!: BleCallbacks;
  disconnected = 0;
  destroyed = 0;
  async requestPermissions() {
    return true;
  }
  scan() {}
  stopScan() {}
  async connect(_id: string, callbacks: BleCallbacks) {
    this.callbacks = callbacks;
    return { info, status };
  }
  async requestStatus() {}
  async disconnect() {
    this.disconnected++;
  }
  destroy() {
    this.destroyed++;
  }
}
const node = { id: "node", name: "LightGuide", rssi: -50 };

test("screen subscriptions may leave and return without closing the shared connection; drops invalidate all readers", async () => {
  const transport = new FakeTransport();
  let now = Date.now();
  const controller = new DeviceController(
    () => transport,
    () => now,
  );
  const leaveDeviceScreen = controller.subscribe(() => {});
  await controller.connect(node);
  assert.match(
    devicePresentation(controller.snapshot.session, now).label,
    /waiting/,
  );
  transport.callbacks.onMeasurement(reading);
  leaveDeviceScreen();
  const leaveHome = controller.subscribe(() => {});
  assert.equal(transport.disconnected, 0);
  assert.equal(
    devicePresentation(controller.snapshot.session, now).fresh,
    true,
  );
  now += 1500;
  assert.match(
    devicePresentation(controller.snapshot.session, now).label,
    /readings stopped/,
  );
  assert.equal(
    devicePresentation(controller.snapshot.session, now).fresh,
    false,
  );
  transport.callbacks.onMeasurement(reading);
  assert.equal(
    devicePresentation(controller.snapshot.session, now).fresh,
    true,
  );
  assert.equal(
    devicePresentation(controller.snapshot.session, now, false).fresh,
    false,
  );
  transport.callbacks.onDisconnected("Power lost");
  assert.equal(controller.snapshot.session.measurement, null);
  assert.equal(controller.snapshot.session.phase, "disconnected");
  transport.callbacks.onMeasurement(reading); // queued notification from dead session
  assert.equal(controller.snapshot.session.measurement, null);
  leaveHome();
  controller.destroy();
  assert.equal(transport.destroyed, 1);
});

test("save events work while another screen subscribes; stale and duplicate presses are rejected", async () => {
  takePendingDeviceSnapshot();
  const transport = new FakeTransport();
  let now = Date.now();
  const controller = new DeviceController(
    () => transport,
    () => now,
  );
  await controller.connect(node);
  transport.callbacks.onMeasurement(reading);
  const save = {
    v: 2 as const,
    type: "event" as const,
    seq: 3,
    uptime_ms: 3,
    event: "save_pressed" as const,
  };
  transport.callbacks.onEvent(save);
  assert.equal(takePendingDeviceSnapshot()?.measurement.distance_mm, 900);
  transport.callbacks.onEvent(save);
  assert.equal(takePendingDeviceSnapshot(), null);
  now += 1500;
  transport.callbacks.onEvent({ ...save, seq: 4 });
  assert.equal(takePendingDeviceSnapshot(), null);
  controller.destroy();
});

test("late handshake completion cannot resurrect a disconnected session", async () => {
  const transport = new FakeTransport();
  let finish!: (value: { info: DeviceInfo; status: DeviceStatus }) => void;
  transport.connect = async (_id, callbacks) => {
    transport.callbacks = callbacks;
    return await new Promise((resolve) => {
      finish = resolve;
    });
  };
  const controller = new DeviceController(() => transport);
  const connection = controller.connect(node);
  await controller.disconnect();
  finish({ info, status });
  await connection;
  assert.equal(controller.snapshot.session.phase, "disconnected");
  assert.equal(controller.snapshot.session.measurement, null);
  controller.destroy();
});

test("scan stops after ten seconds and offers a useful empty result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new DeviceController(() => new FakeTransport());
  await controller.scan();
  assert.equal(controller.snapshot.session.phase, "scanning");
  t.mock.timers.tick(10000);
  assert.equal(controller.snapshot.session.phase, "idle");
  assert.match(controller.snapshot.notice!, /No LightGuide found/);
  controller.destroy();
});

test("on-screen capture accepts a fresh reading and rejects stale data", async () => {
  takePendingDeviceSnapshot();
  const transport = new FakeTransport();
  let now = Date.now();
  const controller = new DeviceController(
    () => transport,
    () => now,
  );
  await controller.connect(node);
  assert.equal(controller.captureSnapshot(), false);
  transport.callbacks.onMeasurement(reading);
  assert.equal(controller.captureSnapshot(), true);
  assert.equal(takePendingDeviceSnapshot()?.info.device_id, "node");
  now += 1500;
  assert.equal(controller.captureSnapshot(), false);
  controller.destroy();
});
