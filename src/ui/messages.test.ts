import { describe, it, expect } from 'vitest';
import { newSetup, type Setup } from '../contract/types';
import {
  classifyDeviceError,
  connectionNotice,
  countOf,
  deviceActionReason,
  deviceErrorMessage,
  deviceErrorStatus,
  importPartialMessage,
  importPlanSummary,
  importSuccessMessage,
  liveReadingNotice,
  nameList,
  summariseImport,
} from './messages';

/** The failure the store throws before anything is sent to the device. */
const noDevice = () => new Error('no device connected');
/** The shape HttpDeviceClient throws when the device answers with an error. */
const httpError = (status: number) => new Error(`PUT /api/setups/abc failed: ${status}`);
/** The shape fetch() rejects with when the request never reached anyone. */
const unreachable = () => new TypeError('Failed to fetch');

function setup(fields: Partial<Setup> & { name: string }): Setup {
  return {
    ...newSetup({ name: fields.name, distance_cm: 50, distance_source: 'typed' }),
    ...fields,
  };
}

describe('classifying a device failure', () => {
  it('recognises the store guard thrown before any request goes out', () => {
    expect(classifyDeviceError(noDevice())).toBe('no-device');
    expect(classifyDeviceError(new Error('No device connected'))).toBe('no-device');
  });

  it('recognises a device that answered with a refusal', () => {
    expect(classifyDeviceError(httpError(500))).toBe('rejected');
    expect(classifyDeviceError(new Error('GET /api/setups failed: 404'))).toBe('rejected');
    expect(deviceErrorStatus(httpError(503))).toBe(503);
  });

  it('recognises a request that never reached the device', () => {
    expect(classifyDeviceError(unreachable())).toBe('unreachable');
    expect(classifyDeviceError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      'unreachable'
    );
    expect(classifyDeviceError(new TypeError('Load failed'))).toBe('unreachable');
  });

  it('falls back to unknown rather than guessing', () => {
    expect(classifyDeviceError(new Error('something else entirely'))).toBe('unknown');
    expect(classifyDeviceError('a bare string')).toBe('unknown');
    expect(classifyDeviceError(null)).toBe('unknown');
    expect(deviceErrorStatus(new Error('nope'))).toBe(null);
  });

  it('sees through a wrapper error that carries the underlying message', () => {
    class PartialPersistError extends Error {
      constructor(message: string, readonly written: number) {
        super(message);
      }
    }
    expect(classifyDeviceError(new PartialPersistError('no device connected', 2))).toBe('no-device');
    expect(classifyDeviceError(new PartialPersistError('PUT /api/setups/x failed: 500', 2))).toBe(
      'rejected'
    );
  });
});

describe('device failure copy', () => {
  const actions = ['start guiding', 'save this setup', 'delete “Portrait key”'];
  const errors = [noDevice(), unreachable(), httpError(500), new Error('weird')];

  it('names the action the user was trying to do', () => {
    for (const error of errors) {
      expect(deviceErrorMessage(error, 'start guiding').title).toContain('start guiding');
    }
    for (const action of actions) {
      expect(deviceErrorMessage(noDevice(), action).title).toContain(action);
    }
  });

  it('never mentions the internet — the phone is on the device access point', () => {
    for (const error of errors) {
      const message = deviceErrorMessage(error, 'start guiding');
      expect(`${message.title} ${message.detail}`).not.toMatch(/internet|online|offline|web/i);
    }
  });

  it('never leaks the raw exception text onto the screen', () => {
    const message = deviceErrorMessage(noDevice(), 'start guiding');
    expect(`${message.title} ${message.detail}`).not.toMatch(/no device connected/i);
    const http = deviceErrorMessage(httpError(500), 'save this setup');
    expect(`${http.title} ${http.detail}`).not.toMatch(/\/api\/|PUT|failed:/);
  });

  it('tells a lost device apart from a refused one, and names the recovery for each', () => {
    const lost = deviceErrorMessage(unreachable(), 'start guiding');
    expect(lost.detail).toMatch(/power/i);
    expect(lost.detail).toMatch(/wi-?fi/i);

    const refused = deviceErrorMessage(httpError(503), 'save this setup');
    expect(refused.detail).toContain('503');
    expect(refused.detail).toMatch(/try again/i);
    expect(refused.title).not.toBe(lost.title);
  });

  it('still gives an unknown failure something to do', () => {
    const message = deviceErrorMessage(new Error('¯\\_(ツ)_/¯'), 'save this setup');
    expect(message.detail).toMatch(/try again/i);
    expect(message.detail).not.toContain('ツ');
  });
});

describe('connection notices', () => {
  it('says nothing at all while connected', () => {
    expect(connectionNotice('connected')).toBe(null);
    expect(deviceActionReason('connected')).toBe(null);
    expect(liveReadingNotice('connected', true)).toBe(null);
  });

  it('distinguishes reconnecting from gone', () => {
    const connecting = connectionNotice('connecting')!;
    const gone = connectionNotice('disconnected')!;
    expect(connecting.title).not.toBe(gone.title);
    expect(gone.detail).toMatch(/power/i);
    expect(gone.detail).toMatch(/wi-?fi/i);
    expect(`${connecting.title} ${connecting.detail} ${gone.title} ${gone.detail}`).not.toMatch(
      /internet/i
    );
  });

  it('gives a disabled control a short reason', () => {
    expect(deviceActionReason('connecting')).toMatch(/device/i);
    expect(deviceActionReason('disconnected')).toMatch(/device/i);
    expect(deviceActionReason('disconnected')).not.toBe(deviceActionReason('connecting'));
  });

  it('separates a quiet sensor feed from a lost device', () => {
    const quiet = liveReadingNotice('connected', false)!;
    const gone = liveReadingNotice('disconnected', false)!;
    expect(quiet.title).not.toBe(gone.title);
    // A connected device with no reading is not a Wi-Fi problem, and must not
    // send the user off to check their phone's network for nothing.
    expect(quiet.detail).not.toMatch(/wi-?fi/i);
    expect(gone.detail).toMatch(/wi-?fi/i);
  });
});

describe('import summary', () => {
  const mine = setup({ name: 'Portrait key', updated_at: '2024-01-01T00:00:00.000Z' });
  const other = setup({ name: 'Rim', updated_at: '2024-01-01T00:00:00.000Z' });

  it('counts a setup that only exists in the file as new', () => {
    const incoming = setup({ name: 'Hair light' });
    const summary = summariseImport([mine], [mine, incoming]);
    expect(summary.added).toBe(1);
    expect(summary.addedNames).toEqual(['Hair light']);
    expect(summary.replaced).toEqual([]);
    expect(summary.unchanged).toBe(1);
  });

  it('names the saved setup a newer copy would overwrite', () => {
    const newer = { ...mine, name: 'Portrait key v2', updated_at: '2025-06-01T00:00:00.000Z' };
    const summary = summariseImport([mine, other], [newer, other]);
    expect(summary.added).toBe(0);
    expect(summary.replaced).toHaveLength(1);
    expect(summary.replaced[0]!.id).toBe(mine.id);
    // The name at risk is the one currently on the device, not the file's.
    expect(summary.replaced[0]!.name).toBe('Portrait key');
    expect(summary.replaced[0]!.incomingName).toBe('Portrait key v2');
    expect(summary.unchanged).toBe(1);
  });

  it('writes only what actually changes, never the untouched setups', () => {
    const newer = { ...mine, updated_at: '2025-06-01T00:00:00.000Z' };
    const fresh = setup({ name: 'Fill' });
    const summary = summariseImport([mine, other], [newer, other, fresh]);
    expect(summary.changed).toHaveLength(2);
    expect(summary.changed.map((s) => s.id).sort()).toEqual([newer.id, fresh.id].sort());
    expect(summary.changed).not.toContain(other);
  });

  it('reports a re-import of your own export as no change at all', () => {
    const summary = summariseImport([mine, other], [mine, other]);
    expect(summary.added).toBe(0);
    expect(summary.replaced).toEqual([]);
    expect(summary.changed).toEqual([]);
    expect(summary.unchanged).toBe(2);
  });

  it('handles an import into an empty device', () => {
    const summary = summariseImport([], [mine, other]);
    expect(summary.added).toBe(2);
    expect(summary.unchanged).toBe(0);
    expect(summary.changed).toHaveLength(2);
  });
});

describe('import copy', () => {
  const mine = setup({ name: 'Portrait key', updated_at: '2024-01-01T00:00:00.000Z' });

  it('says plainly, before writing, what will be added and what will be lost', () => {
    const newer = { ...mine, updated_at: '2025-06-01T00:00:00.000Z' };
    const fresh = setup({ name: 'Fill' });
    const plan = importPlanSummary(summariseImport([mine], [newer, fresh]));
    expect(plan).toContain('1 new setup will be added');
    expect(plan).toContain('1 saved setup will be replaced');
  });

  it('says nothing will be replaced when nothing will be', () => {
    const fresh = setup({ name: 'Fill' });
    const plan = importPlanSummary(summariseImport([mine], [mine, fresh]));
    expect(plan).toMatch(/nothing already saved will be replaced/i);
  });

  it('says plainly when an import changed nothing', () => {
    const summary = summariseImport([mine], [mine]);
    expect(importPlanSummary(summary)).toMatch(/nothing would change/i);
    const done = importSuccessMessage(summary);
    expect(done.title).toMatch(/nothing to import/i);
    expect(done.detail).toMatch(/no setups were added or replaced/i);
    expect(done.title).not.toMatch(/saved|imported \d/i);
  });

  it('reports what actually landed on a successful import', () => {
    const newer = { ...mine, updated_at: '2025-06-01T00:00:00.000Z' };
    const fresh = setup({ name: 'Fill' });
    const done = importSuccessMessage(summariseImport([mine], [newer, fresh]));
    expect(done.title).toContain('1 added');
    expect(done.title).toContain('1 replaced');
    expect(done.detail).toContain('2 setups');
  });

  it('never claims success when the write stopped partway', () => {
    const message = importPartialMessage(2, 5, httpError(500));
    expect(message.title).toContain('2 of 5 setups');
    expect(message.title).not.toMatch(/saved —|success|imported all/i);
    // The three that did not land, and what to do about them.
    expect(message.detail).toContain('3 setups');
    expect(message.detail).toMatch(/import the same file again/i);
  });

  it('carries the underlying reason into a partial failure', () => {
    expect(importPartialMessage(0, 4, noDevice()).detail).toMatch(/power/i);
    expect(importPartialMessage(0, 4, noDevice()).detail).not.toMatch(/internet/i);
    expect(importPartialMessage(1, 4, httpError(500)).detail).toContain('500');
  });
});

describe('counting words', () => {
  it('singularises one', () => {
    expect(countOf(1, 'setup')).toBe('1 setup');
    expect(countOf(0, 'setup')).toBe('0 setups');
    expect(countOf(2, 'new setup')).toBe('2 new setups');
  });

  it('keeps a long list of names from filling the screen', () => {
    expect(nameList(['A', 'B'])).toBe('A, B');
    expect(nameList(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D and 2 more');
    expect(nameList([])).toBe('');
  });
});
