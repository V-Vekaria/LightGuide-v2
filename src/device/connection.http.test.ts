// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockDevice, type MockDevice } from '../../mock-device/server.mjs';
import { PROTOCOL_MAX_SUPPORTED } from '../contract/types';
import {
  checkingDevice,
  closeConnection,
  connectionFault,
  deviceAddress,
  deviceInfo,
  openDevice,
  refreshDeviceInfo,
} from './connection';
import { SAME_ORIGIN, readStoredAddress } from './endpoint';
import {
  lastFrameAt,
  lastGoodAt,
  lastGoodLightAt,
  liveFrameRate,
  setups,
  status,
} from '../store/store';

/**
 * The connection flow over real HTTP, against a real device.
 *
 * The pure classification is covered in `connection.test.ts`; what this file
 * asserts is the *consequence* — which of these outcomes leaves the app
 * connected to a device and which deliberately does not. That distinction is
 * the entire protection a protocol version buys, and it cannot be tested
 * anywhere the transport is faked, because the thing being checked is whether
 * a live socket and a live setup list exist afterwards.
 *
 * Node environment for the runtime's real fetch and WebSocket, and a fresh
 * mock per test on an ephemeral port — never the instance on :8080 that
 * somebody may be using by hand.
 */

const started: MockDevice[] = [];

async function startDevice(options: Parameters<typeof createMockDevice>[0] = {}): Promise<MockDevice> {
  const device = await createMockDevice({ port: 0, storePath: null, ...options });
  started.push(device);
  return device;
}

afterEach(async () => {
  closeConnection();
  await Promise.all(started.splice(0).map((device) => device.close()));
});

/** Polls until `done()`, then resolves — or rejects naming what never happened. */
async function waitFor(done: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('opening a device by address', () => {
  it('identifies the device and connects to it', async () => {
    const device = await startDevice();
    const outcome = await openDevice(device.url);

    expect(outcome.ok).toBe(true);
    expect(deviceInfo.value?.device_id).toBe(device.deviceId);
    expect(deviceInfo.value?.name).toBe(device.name);
    expect(connectionFault.value).toBeNull();
    expect(deviceAddress.value).toBe(device.url);
    expect(checkingDevice.value).toBe(false);

    // Connected means connected: the live socket opens and the setups arrive.
    await waitFor(() => status.value === 'connected', 5000, 'a connected device');
    expect(setups.value).toEqual([]);
  });

  it('reports uptime and free storage from the device itself', async () => {
    // The point of the demo: these are numbers only something running can
    // produce, and they move.
    const device = await startDevice();
    await openDevice(device.url);
    expect(deviceInfo.value?.uptime_s).toBeGreaterThanOrEqual(0);
    expect(deviceInfo.value?.free_storage_bytes).toBeGreaterThan(0);
  });

  it('refuses to connect to a device whose protocol it cannot handle', async () => {
    // The whole reason the protocol field exists. The app must not stream
    // readings from a device it does not understand — a half-understood
    // contract produces confidently wrong numbers, not a visible failure.
    const device = await startDevice({ protocol: PROTOCOL_MAX_SUPPORTED + 1 });
    const outcome = await openDevice(device.url);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.fault.kind).toBe('protocol');
    expect(connectionFault.value).toEqual({
      kind: 'protocol',
      info: expect.objectContaining({ protocol: PROTOCOL_MAX_SUPPORTED + 1 }),
      fit: 'device-too-new',
    });

    // It still knows who refused — that is what makes the message actionable.
    expect(deviceInfo.value?.device_id).toBe(device.deviceId);

    // And it stayed away: no socket, no setups, no guiding.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(status.value).toBe('disconnected');
  });

  it('connects anyway to firmware too old to identify itself, and says so', async () => {
    // A board from before /api/info existed still speaks the rest of the
    // contract. Refusing it outright would brick the app during bring-up, so
    // the fault is reported and the connection is made.
    const device = await startDevice({ serveInfo: false });
    const outcome = await openDevice(device.url);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.fault).toEqual({ kind: 'refused', status: 404 });
    expect(deviceInfo.value).toBeNull();

    await waitFor(() => status.value === 'connected', 5000, 'a connected device');
  });

  it('reports an address with nothing behind it as unreachable', async () => {
    // Start a device, learn its port, then close it: a port nothing is
    // listening on, without guessing at one that might be in use.
    const device = await startDevice();
    const url = device.url;
    await device.close();
    started.splice(started.indexOf(device), 1);

    const outcome = await openDevice(url);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.fault).toEqual({ kind: 'unreachable' });
    expect(deviceInfo.value).toBeNull();
  });

  it('picks up a sensor fault the device reports', async () => {
    const device = await startDevice({ sensors: { distance: 'fault' } });
    await openDevice(device.url);
    expect(deviceInfo.value?.sensors.distance.state).toBe('fault');
    expect(deviceInfo.value?.sensors.light.state).toBe('ok');
  });

  it('re-reads the device on request, and clears a fault that has gone', async () => {
    const device = await startDevice();
    await openDevice(device.url);
    const first = deviceInfo.value;
    expect(first).not.toBeNull();

    const outcome = await refreshDeviceInfo();
    expect(outcome?.ok).toBe(true);
    expect(deviceInfo.value?.device_id).toBe(first?.device_id);
    expect(connectionFault.value).toBeNull();
  });

  it('drops the previous device when pointed at another one', async () => {
    const first = await startDevice({ deviceId: 'lg-000000000001', name: 'LightGuide 0001' });
    const second = await startDevice({ deviceId: 'lg-000000000002', name: 'LightGuide 0002' });

    await openDevice(first.url);
    expect(deviceInfo.value?.device_id).toBe('lg-000000000001');

    await openDevice(second.url);
    expect(deviceInfo.value?.device_id).toBe('lg-000000000002');
    expect(deviceAddress.value).toBe(second.url);
    await waitFor(() => status.value === 'connected', 5000, 'the second device');
  });
});

describe('one device at a time', () => {
  it('carries no trace of the previous device into the next one', async () => {
    // Found on the bench, not in a test: after switching devices the device
    // screen reported an axis as "53 ms ago" for a board that had never sent
    // a frame. The age was real — it belonged to the device before it. A true
    // fact about the wrong device is the kind of wrong that gets believed.
    const first = await startDevice();
    await openDevice(first.url);
    await waitFor(() => lastGoodAt.value !== null, 5000, 'a reading from the first device');

    // A device the app will refuse, so nothing can arrive to refresh the
    // stamps and hide the carry-over.
    const second = await startDevice({ protocol: PROTOCOL_MAX_SUPPORTED + 1 });
    await openDevice(second.url);

    expect(lastGoodAt.value).toBeNull();
    expect(lastGoodLightAt.value).toBeNull();
    expect(lastFrameAt.value).toBeNull();
    expect(liveFrameRate()).toBeNull();
  });
});

/**
 * What survives to the next launch.
 *
 * Node has no `localStorage`, and `endpoint.ts` swallows that (falling back to
 * same-origin is the correct failure there). A Map-backed stand-in turns these
 * assertions into real ones rather than assertions about a no-op.
 */
describe('what the app remembers for next launch', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('remembers an address only once it has actually reached a device', async () => {
    const dead = await startDevice();
    const deadUrl = dead.url;
    await dead.close();
    started.splice(started.indexOf(dead), 1);

    await openDevice(deadUrl, { remember: true });
    expect(readStoredAddress()).toBeNull();

    const working = await startDevice();
    await openDevice(working.url, { remember: true });
    expect(readStoredAddress()).toBe(working.url);
  });

  it('does not remember a device it has refused on version grounds', async () => {
    // Storing it would make the app open on a device it cannot drive, every
    // launch, until somebody worked out where the address was kept.
    const working = await startDevice();
    await openDevice(working.url, { remember: true });
    expect(readStoredAddress()).toBe(working.url);

    const future = await startDevice({ protocol: PROTOCOL_MAX_SUPPORTED + 1 });
    await openDevice(future.url, { remember: true });
    expect(readStoredAddress()).toBe(working.url);
  });

  it('clears the address on a reset even when the serving device does not answer', async () => {
    // Found on the bench: "go back to the device that served this page" is
    // what somebody reaches for *because* the typed address stopped working,
    // and the serving device may well be a board too old to answer /api/info.
    // Gating the reset on a clean answer stranded them on the broken address.
    //
    // Here the same-origin probe cannot succeed at all — there is no page
    // origin in Node, so the relative request fails — which is exactly the
    // condition being asserted: the reset happens regardless of the outcome.
    const working = await startDevice();
    await openDevice(working.url, { remember: true });
    expect(readStoredAddress()).toBe(working.url);

    // The live socket reads window.location.origin when the base URL is empty.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: working.url } },
    });

    const outcome = await openDevice(SAME_ORIGIN, { remember: true });
    expect(outcome.ok).toBe(false);
    expect(readStoredAddress()).toBeNull();
    expect(deviceAddress.value).toBe(SAME_ORIGIN);
  });
});
