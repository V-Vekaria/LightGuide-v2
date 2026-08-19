import { describe, it, expect, vi } from 'vitest';
import { describeDeviceClient } from './conformance';
import { InMemoryDeviceClient } from './in-memory-client';
import type { Reading } from '../contract/types';

describeDeviceClient('InMemoryDeviceClient', () => new InMemoryDeviceClient());

// The shared conformance suite can't verify delivery (see the comment atop
// describeDeviceClient), but InMemoryDeviceClient.emit() lets us verify it
// here: this is the "stops delivery" coverage the old conformance test title
// used to claim without actually checking.
describe('InMemoryDeviceClient live delivery', () => {
  it('delivers emitted readings until unsubscribed, then delivers no more', () => {
    const client = new InMemoryDeviceClient();
    const cb = vi.fn();
    const off = client.subscribeLive(cb);

    const reading: Reading = { distance_cm: 50, brightness: 0.5, ambient: 0.1, seq: 1, ts: 0 };
    client.emit(reading);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(reading);

    off();
    client.emit({ ...reading, seq: 2 });
    expect(cb).toHaveBeenCalledTimes(1);

    client.close();
  });
});
