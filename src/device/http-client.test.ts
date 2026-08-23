import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpDeviceClient, parseDeviceInfo } from './http-client';
import type { Reading } from '../contract/types';

/**
 * Minimal controllable stand-in for the browser WebSocket, just enough of
 * the surface HttpDeviceClient touches (onopen/onmessage/onclose/onerror,
 * close()). Tests drive onopen/onmessage directly instead of going over a
 * real socket, so there's no timers and no real network involved.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) throw new Error('expected a fake WebSocket to have been constructed');
  return socket;
}

describe('HttpDeviceClient frame handling', () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
  });

  it('delivers a valid frame intact, including a null distance_cm', () => {
    const client = new HttpDeviceClient('http://device.local');
    const cb = vi.fn();
    client.subscribeLive(cb);
    latestSocket().onopen?.();

    // A null distance_cm is a genuine sensor dropout and must pass through
    // as null, not get coerced to 0.
    const reading: Reading = { distance_cm: null, brightness: 0.4, ambient: 0.1, seq: 1, ts: 111 };
    latestSocket().onmessage?.({ data: JSON.stringify(reading) });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(reading);
    expect(cb.mock.calls[0]?.[0].distance_cm).toBeNull();

    client.close();
  });

  it('drops a malformed frame without notifying subscribers', () => {
    const client = new HttpDeviceClient('http://device.local');
    const cb = vi.fn();
    client.subscribeLive(cb);
    latestSocket().onopen?.();

    latestSocket().onmessage?.({ data: '{not valid json' });

    expect(cb).not.toHaveBeenCalled();

    client.close();
  });

  it('keeps delivering after a malformed frame — a bad frame must not kill the stream', () => {
    const client = new HttpDeviceClient('http://device.local');
    const cb = vi.fn();
    client.subscribeLive(cb);
    latestSocket().onopen?.();

    latestSocket().onmessage?.({ data: 'not json at all' });
    expect(cb).not.toHaveBeenCalled();

    const reading: Reading = { distance_cm: 30, brightness: 0.6, ambient: 0.2, seq: 2, ts: 222 };
    latestSocket().onmessage?.({ data: JSON.stringify(reading) });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(reading);

    client.close();
  });

  it('drops a wrong-shaped frame (valid JSON, not a Reading) without notifying subscribers', () => {
    const client = new HttpDeviceClient('http://device.local');
    const cb = vi.fn();
    client.subscribeLive(cb);
    latestSocket().onopen?.();

    latestSocket().onmessage?.({ data: JSON.stringify({ foo: 1 }) });

    expect(cb).not.toHaveBeenCalled();

    client.close();
  });

  it('drops a frame whose distance_cm is a string, not a number', () => {
    const client = new HttpDeviceClient('http://device.local');
    const cb = vi.fn();
    client.subscribeLive(cb);
    latestSocket().onopen?.();

    latestSocket().onmessage?.({
      data: JSON.stringify({ distance_cm: 'far', brightness: 0.4, ambient: 0.1, seq: 1, ts: 111 }),
    });

    expect(cb).not.toHaveBeenCalled();

    client.close();
  });

  it('keeps delivering after a wrong-shaped frame — a bad frame must not kill the stream', () => {
    const client = new HttpDeviceClient('http://device.local');
    const cb = vi.fn();
    client.subscribeLive(cb);
    latestSocket().onopen?.();

    latestSocket().onmessage?.({ data: JSON.stringify({ foo: 1 }) });
    expect(cb).not.toHaveBeenCalled();

    const reading: Reading = { distance_cm: 30, brightness: 0.6, ambient: 0.2, seq: 2, ts: 222 };
    latestSocket().onmessage?.({ data: JSON.stringify(reading) });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(reading);

    client.close();
  });

  it('reports connected status after onopen fires', () => {
    const client = new HttpDeviceClient('http://device.local');
    client.subscribeLive(() => {});

    expect(client.status()).toBe('connecting');

    latestSocket().onopen?.();

    expect(client.status()).toBe('connected');

    client.close();
  });
});

describe('parseDeviceInfo', () => {
  /** A complete, valid payload — every test below is a mutation of this. */
  function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      protocol: 1,
      device_id: 'lg-a1b2c3d4e5f6',
      name: 'LightGuide E5F6',
      model: 'LightGuide ESP32-S3',
      firmware: '0.4.2',
      uptime_s: 5310,
      free_storage_bytes: 9012345,
      sensors: { distance: { state: 'ok' }, light: { state: 'ok' } },
      ...overrides,
    };
  }

  it('accepts a complete payload unchanged', () => {
    const info = parseDeviceInfo(payload());
    expect(info).toEqual({
      protocol: 1,
      device_id: 'lg-a1b2c3d4e5f6',
      name: 'LightGuide E5F6',
      model: 'LightGuide ESP32-S3',
      firmware: '0.4.2',
      uptime_s: 5310,
      free_storage_bytes: 9012345,
      sensors: { distance: { state: 'ok' }, light: { state: 'ok' } },
    });
  });

  it('rejects anything that is not an object', () => {
    for (const value of [null, undefined, 'device', 42, []]) {
      expect(parseDeviceInfo(value)).toBeNull();
    }
  });

  it('rejects a payload with no protocol version to compare', () => {
    // Without it the app cannot decide whether it can drive this device, and
    // guessing is the exact failure the field exists to prevent.
    expect(parseDeviceInfo(payload({ protocol: undefined }))).toBeNull();
    expect(parseDeviceInfo(payload({ protocol: '1' }))).toBeNull();
    expect(parseDeviceInfo(payload({ protocol: 1.5 }))).toBeNull();
    expect(parseDeviceInfo(payload({ protocol: 0 }))).toBeNull();
  });

  it('rejects a blank identity rather than showing a device with no name', () => {
    // A device screen whose one job is saying which device this is must never
    // render an empty one. Any JSON-serving box on the network would otherwise
    // present itself as a nameless LightGuide.
    expect(parseDeviceInfo(payload({ device_id: '' }))).toBeNull();
    expect(parseDeviceInfo(payload({ device_id: '   ' }))).toBeNull();
    expect(parseDeviceInfo(payload({ name: '' }))).toBeNull();
    expect(parseDeviceInfo(payload({ firmware: '' }))).toBeNull();
    expect(parseDeviceInfo(payload({ name: 42 }))).toBeNull();
  });

  it('rejects a payload missing either sensor', () => {
    expect(parseDeviceInfo(payload({ sensors: {} }))).toBeNull();
    expect(parseDeviceInfo(payload({ sensors: { distance: { state: 'ok' } } }))).toBeNull();
    expect(parseDeviceInfo(payload({ sensors: 'ok' }))).toBeNull();
  });

  it('rejects a sensor with no state — that is a device with no health reporting', () => {
    // Coercing it to "unknown" would report a board that never implemented
    // this part of the contract as a board that is merely still deciding.
    expect(parseDeviceInfo(payload({ sensors: { distance: {}, light: { state: 'ok' } } }))).toBeNull();
  });

  it('degrades an unrecognised sensor state to unknown instead of failing', () => {
    // Vocabulary is forward-tolerant where shape is strict: a later firmware
    // adding a state within the same protocol version should read as "cannot
    // tell" on an older app, not take the device screen down with it.
    const info = parseDeviceInfo(
      payload({ sensors: { distance: { state: 'degraded' }, light: { state: 'fault' } } }),
    );
    expect(info?.sensors.distance.state).toBe('unknown');
    expect(info?.sensors.light.state).toBe('fault');
  });

  it('treats the display-only extras as optional', () => {
    // model, uptime and free storage are absent on some firmwares by design.
    // Refusing the whole device over a cosmetic field would be the wrong
    // trade — the screen simply does not show what it was not told.
    const info = parseDeviceInfo(
      payload({ model: undefined, uptime_s: undefined, free_storage_bytes: undefined }),
    );
    expect(info).not.toBeNull();
    expect(info?.model).toBeNull();
    expect(info?.uptime_s).toBeNull();
    expect(info?.free_storage_bytes).toBeNull();
  });

  it('nulls a wrong-typed extra rather than believing it', () => {
    const info = parseDeviceInfo(payload({ uptime_s: 'ages', free_storage_bytes: null }));
    expect(info?.uptime_s).toBeNull();
    expect(info?.free_storage_bytes).toBeNull();
  });

  it('ignores fields it has never heard of', () => {
    // Adding a field is additive and must not need a protocol bump — a client
    // that has never heard of one has to be able to ignore it.
    const info = parseDeviceInfo(payload({ battery_pct: 91, sensors: {
      distance: { state: 'ok', last_echo_us: 4200 },
      light: { state: 'ok' },
    } }));
    expect(info?.sensors.distance).toEqual({ state: 'ok' });
    expect(info).not.toBeNull();
  });
});
