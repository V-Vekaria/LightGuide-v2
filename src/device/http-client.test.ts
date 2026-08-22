import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpDeviceClient } from './http-client';
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
