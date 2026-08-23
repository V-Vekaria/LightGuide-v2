// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createMockDevice, type MockDevice } from '../../mock-device/server.mjs';
import { describeDeviceClient } from './conformance';
import { HttpDeviceClient } from './http-client';
import type { Reading } from '../contract/types';

/**
 * The conformance suite over the transport it will actually use: real HTTP,
 * a real WebSocket, and the mock server in-process. Everything the suite
 * asserted against InMemoryDeviceClient it now also asserts against the wire
 * format — the drift this suite exists to catch is exactly the drift that
 * only shows up once JSON, query strings and status codes are involved.
 *
 * Clean state comes from isolation, not from a reset endpoint: each `make()`
 * starts its own mock device on an ephemeral port (`port: 0`) with no store
 * file (`storePath: null`), so tests cannot collide with each other or with
 * the instance a developer is running by hand on :8080.
 *
 * Runs in the node environment rather than happy-dom: this test needs the
 * runtime's real fetch and WebSocket, not a DOM implementation's.
 */

const started: MockDevice[] = [];

async function startDevice(): Promise<MockDevice> {
  const device = await createMockDevice({ port: 0, storePath: null });
  started.push(device);
  return device;
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((device) => device.close()));
});

describeDeviceClient('HttpDeviceClient + mock device', async () => {
  const device = await startDevice();
  return new HttpDeviceClient(device.url);
});

describe('HttpDeviceClient live delivery over a real WebSocket', () => {
  it('delivers well-formed readings from the mock, and stops when unsubscribed', async () => {
    const device = await startDevice();
    const client = new HttpDeviceClient(device.url);

    const received: Reading[] = [];
    // A second subscriber that never leaves, so "the feed is still running"
    // becomes something this test can *observe* rather than assume. Without
    // it the only way to check that unsubscribing stopped delivery is to
    // sleep a few frames and see if anything arrived — which asserts nothing
    // at all on a loaded machine where those 300 ms happen to buy zero
    // frames, and would pass just as happily against a mock that had stopped
    // sending to everyone.
    const control: Reading[] = [];
    const off = client.subscribeLive((r) => received.push(r));
    client.subscribeLive((r) => control.push(r));

    await waitFor(() => received.length >= 2, 5000, 'two live readings');

    for (const reading of received) {
      // Units, over the wire: a 12-bit ADC count arrives as a 0..1 fraction,
      // millimetres arrive as centimetres, and a dropout is null, never 0.
      expect(reading.brightness === null || (reading.brightness >= 0 && reading.brightness <= 1))
        .toBe(true);
      expect(reading.distance_cm === null || reading.distance_cm > 0).toBe(true);
      expect(Number.isFinite(reading.seq)).toBe(true);
      expect(Number.isFinite(reading.ts)).toBe(true);
    }
    expect(received[1]!.seq).toBeGreaterThan(received[0]!.seq);

    off();
    const countAtUnsubscribe = received.length;
    const controlAtUnsubscribe = control.length;

    // Wait for the feed to demonstrably deliver three more frames to the
    // listener that is still subscribed...
    await waitFor(
      () => control.length >= controlAtUnsubscribe + 3,
      5000,
      'three more frames on the still-subscribed listener',
    );
    // ...and only then assert that not one of them reached the listener that
    // unsubscribed. Now the assertion has a known number of real delivery
    // opportunities behind it instead of an elapsed-time guess.
    expect(received.length).toBe(countAtUnsubscribe);

    client.close();
  });

  it('reports connected once the socket is open', async () => {
    const device = await startDevice();
    const client = new HttpDeviceClient(device.url);
    client.subscribeLive(() => {});
    expect(client.status()).toBe('connecting');

    await waitFor(() => client.status() === 'connected', 5000, 'a connected socket');

    client.close();
    expect(client.status()).toBe('disconnected');
  });
});

describe('device HTTP surface', () => {
  it('answers /api/info with the live feed switched off and nothing saved', async () => {
    // It is the app's fallback for "the device is there, and here is what is
    // wrong with it". A route that needed the sensors or the store to be
    // working could not do that job.
    const device = await createMockDevice({ port: 0, storePath: null, live: false });
    started.push(device);
    const res = await fetch(`${device.url}/api/info`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.protocol).toBe(1);
    expect(body.device_id).toBe(device.deviceId);
    expect(body.sensors).toEqual({ distance: { state: 'ok' }, light: { state: 'ok' } });
  });

  it('sends no wording on /api/info — the app writes every sentence', async () => {
    // The division of responsibility this whole contract rests on: the device
    // measures and reports state, the app writes the copy. A string from the
    // board reaches a customer's screen in a developer's voice and cannot be
    // changed without reflashing.
    const device = await startDevice();
    const body = await (await fetch(`${device.url}/api/info`)).json();
    for (const forbidden of ['message', 'error', 'detail', 'hint', 'status_text']) {
      expect(body[forbidden]).toBeUndefined();
    }
    expect(body.sensors.distance.message).toBeUndefined();
  });

  it('refuses an unrecognised include_deleted value instead of silently hiding tombstones', async () => {
    const device = await startDevice();
    const res = await fetch(`${device.url}/api/setups?include_deleted=true`);
    expect(res.status).toBe(400);
  });

  it('refuses a POST /api/active that is not a complete target', async () => {
    const device = await startDevice();
    for (const body of ['{}', '', '{"distance_cm":50}']) {
      const res = await fetch(`${device.url}/api/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(res.status).toBe(400);
    }
    // And nothing was set as a side effect of being refused.
    const active = await (await fetch(`${device.url}/api/active`)).json();
    expect(active).toEqual({ target: null });
  });

  it('refuses a setup write that carries no updated_at to order it by', async () => {
    const device = await startDevice();
    const res = await fetch(`${device.url}/api/setups/abc`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'abc', name: 'No timestamp', deleted: false }),
    });
    expect(res.status).toBe(400);
    expect(await (await fetch(`${device.url}/api/setups?include_deleted=1`)).json()).toEqual([]);
  });

});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until `done()`, then resolves — or rejects naming what never happened. */
async function waitFor(done: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(20);
  }
}
