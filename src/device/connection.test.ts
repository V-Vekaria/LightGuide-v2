import { describe, it, expect } from 'vitest';
import type { DeviceClient, DeviceInfo } from '../contract/types';
import { PROTOCOL_MAX_SUPPORTED, PROTOCOL_MIN_SUPPORTED } from '../contract/types';
import { classifyProbeFailure, probeDevice, protocolFit } from './connection';
import { InMemoryDeviceClient } from './in-memory-client';

describe('protocolFit', () => {
  it('accepts every version in the supported range', () => {
    for (let v = PROTOCOL_MIN_SUPPORTED; v <= PROTOCOL_MAX_SUPPORTED; v += 1) {
      expect(protocolFit(v)).toBe('ok');
    }
  });

  it('names which side of the mismatch the problem is on', () => {
    // The direction is the whole point: one is fixed by updating the board,
    // the other by reloading the app. A customer told the wrong one spends the
    // afternoon updating the thing that was already right.
    expect(protocolFit(PROTOCOL_MIN_SUPPORTED - 1)).toBe('device-too-old');
    expect(protocolFit(PROTOCOL_MAX_SUPPORTED + 1)).toBe('device-too-new');
  });
});

describe('classifyProbeFailure', () => {
  it('reads the status out of a refusal', () => {
    const fault = classifyProbeFailure(new Error('GET /api/info failed: 404'));
    expect(fault).toEqual({ kind: 'refused', status: 404 });
  });

  it('treats a 500 as a refusal too — it answered, just not usefully', () => {
    expect(classifyProbeFailure(new Error('GET /api/info failed: 503'))).toEqual({
      kind: 'refused',
      status: 503,
    });
  });

  it('separates "answered with nonsense" from "did not answer"', () => {
    // Something on the network answering with a body that is not a device is
    // a different fix from nothing answering at all, and the copy differs.
    expect(
      classifyProbeFailure(new Error('GET /api/info returned a malformed device description')),
    ).toEqual({ kind: 'not-a-device' });
  });

  it('treats an unparseable body as "not a device"', () => {
    // An HTML error page from some other box on the network is the realistic
    // case, and res.json() rejecting is how it arrives.
    expect(classifyProbeFailure(new SyntaxError('Unexpected token < in JSON at position 0'))).toEqual(
      { kind: 'not-a-device' },
    );
  });

  it('treats a fetch failure as unreachable', () => {
    expect(classifyProbeFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'unreachable' });
  });

  it('treats the request timeout as unreachable, not as an unknown error', () => {
    // An aborted fetch rejects with an AbortError, which is neither a
    // TypeError nor an HTTP status. Left unclassified it would surface as
    // "something went wrong", when what happened is the plainest failure
    // there is: nothing was there.
    expect(classifyProbeFailure(new Error('GET /api/info timed out after 4000ms'))).toEqual({
      kind: 'unreachable',
    });
  });
});

describe('probeDevice', () => {
  function client(info: Partial<DeviceInfo>): DeviceClient {
    return new InMemoryDeviceClient([], info);
  }

  it('accepts a device inside the supported range and hands back its info', async () => {
    const outcome = await probeDevice(client({ name: 'LightGuide 9D40' }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.info.name).toBe('LightGuide 9D40');
  });

  it('refuses a device the app cannot understand, but still names it', async () => {
    // Carrying the info through the failure is what makes the message
    // actionable: "LightGuide 9D40 is newer than this app" is a sentence
    // somebody can act on, "a device is incompatible" is not.
    const outcome = await probeDevice(
      client({ protocol: PROTOCOL_MAX_SUPPORTED + 1, name: 'LightGuide 9D40', firmware: '9.9.9' }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.fault.kind === 'protocol') {
      expect(outcome.fault.fit).toBe('device-too-new');
      expect(outcome.fault.info.name).toBe('LightGuide 9D40');
      expect(outcome.fault.info.firmware).toBe('9.9.9');
    } else {
      expect.unreachable('expected a protocol fault');
    }
  });

  it('refuses a device older than the app understands', async () => {
    const outcome = await probeDevice(client({ protocol: PROTOCOL_MIN_SUPPORTED - 1 }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.fault.kind === 'protocol') {
      expect(outcome.fault.fit).toBe('device-too-old');
    } else {
      expect.unreachable('expected a protocol fault');
    }
  });

  it('never throws — a failed probe is an answer, not an exception', async () => {
    // Only getInfo is reachable from probeDevice; the rest of the surface is
    // there to satisfy the type, and would be a bug if it were called.
    const unreachableDevice: DeviceClient = {
      getInfo: () => Promise.reject(new TypeError('Failed to fetch')),
      listSetups: () => Promise.reject(new Error('not called')),
      listSetupsIncludingDeleted: () => Promise.reject(new Error('not called')),
      saveSetup: () => Promise.reject(new Error('not called')),
      deleteSetup: () => Promise.reject(new Error('not called')),
      setActiveTarget: () => Promise.reject(new Error('not called')),
      getActiveTarget: () => Promise.reject(new Error('not called')),
      subscribeLive: () => () => {},
      status: () => 'disconnected',
      close: () => {},
    };
    await expect(probeDevice(unreachableDevice)).resolves.toEqual({
      ok: false,
      fault: { kind: 'unreachable' },
    });
  });
});
