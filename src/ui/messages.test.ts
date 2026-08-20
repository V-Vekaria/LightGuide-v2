import { describe, it, expect } from 'vitest';
import { newSetup, type Setup } from '../contract/types';
import { exportSetups, importSetups } from '../backup/transfer';
import {
  classifyDeviceError,
  connectionNotice,
  countOf,
  deleteConfirmMessage,
  deleteSuccessMessage,
  deviceActionReason,
  deviceErrorMessage,
  deviceErrorStatus,
  importAckLabel,
  importConfirmLabel,
  importPartialMessage,
  importPlanSummary,
  importPlanTitle,
  importSuccessMessage,
  liveReadingNotice,
  nameList,
  summariseImport,
  visibleChanges,
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

/**
 * The shape an export now carries a deletion in: the same id, `deleted: true`,
 * and an `updated_at` newer than the live copy so the merge takes it.
 */
function tombstoneOf(live: Setup, at = '2025-06-01T00:00:00.000Z'): Setup {
  return { ...live, deleted: true, updated_at: at };
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
    expect(done.detail).toMatch(/no setups were added, replaced or deleted/i);
    expect(done.title).not.toMatch(/saved|imported \d/i);
  });

  it('reports what actually landed on a successful import', () => {
    const newer = { ...mine, updated_at: '2025-06-01T00:00:00.000Z' };
    const fresh = setup({ name: 'Fill' });
    const done = importSuccessMessage(summariseImport([mine], [newer, fresh]));
    expect(done.title).toContain('1 added');
    expect(done.title).toContain('1 replaced');
    expect(done.detail).toContain('2 changes');
  });

  /** Five straight additions — no deletions in the mix. */
  const fivePlain = summariseImport(
    [],
    ['a', 'b', 'c', 'd', 'e'].map((name) => setup({ name }))
  );

  it('never claims success when the write stopped partway', () => {
    const message = importPartialMessage(2, fivePlain, httpError(500));
    expect(message.title).toContain('2 of 5 changes');
    expect(message.title).not.toMatch(/saved —|success|imported all/i);
    // The three that did not land, and what to do about them.
    expect(message.detail).toContain('3 changes');
    expect(message.detail).toMatch(/import the same file again/i);
  });

  it('carries the underlying reason into a partial failure', () => {
    expect(importPartialMessage(0, fivePlain, noDevice()).detail).toMatch(/power/i);
    expect(importPartialMessage(0, fivePlain, noDevice()).detail).not.toMatch(/internet/i);
    expect(importPartialMessage(1, fivePlain, httpError(500)).detail).toContain('500');
  });
});

describe('import summary: tombstones', () => {
  // Exports carry deletions since feat(device): export tombstones. Before this,
  // summariseImport classified on id presence and updated_at alone, so an
  // incoming tombstone was announced as "1 new setup will be added" or "1 saved
  // setup will be replaced" while the actual effect was a deletion.
  const mine = setup({ name: 'Portrait key', updated_at: '2024-01-01T00:00:00.000Z' });
  const other = setup({ name: 'Rim', updated_at: '2024-01-01T00:00:00.000Z' });

  it('counts a tombstone over a live setup as a deletion, not an add or a replace', () => {
    const summary = summariseImport([mine, other], [tombstoneOf(mine), other]);
    expect(summary.deleted).toHaveLength(1);
    expect(summary.deleted[0]!.id).toBe(mine.id);
    // Named from the device's copy: the file's side is a tombstone, and a
    // tombstone's name is whatever it happened to carry when it was written.
    expect(summary.deleted[0]!.name).toBe('Portrait key');
    expect(summary.added).toBe(0);
    expect(summary.replaced).toEqual([]);
    expect(summary.unchanged).toBe(1);
    // It still has to be written — that write is the deletion.
    expect(summary.changed).toHaveLength(1);
    expect(summary.changed[0]!.deleted).toBe(true);
  });

  it('treats a tombstone for a setup the device never held as no change at all', () => {
    const stranger = tombstoneOf(setup({ name: 'Never seen here' }));
    const summary = summariseImport([mine], [mine, stranger]);
    expect(summary.added).toBe(0);
    expect(summary.addedNames).toEqual([]);
    expect(summary.deleted).toEqual([]);
    expect(summary.replaced).toEqual([]);
    expect(summary.changed).toEqual([]);
    // Not "unchanged" either: that count means setups the user can see.
    expect(summary.unchanged).toBe(1);
    expect(visibleChanges(summary)).toBe(0);
  });

  it('counts a newer live copy over a local tombstone as an add, since a row appears', () => {
    const deletedHere = tombstoneOf(mine, '2024-06-01T00:00:00.000Z');
    const revived = { ...mine, name: 'Portrait key', updated_at: '2025-06-01T00:00:00.000Z' };
    const summary = summariseImport([deletedHere], [revived]);
    // "Replaced" would be a lie — there is no visible copy to replace.
    expect(summary.replaced).toEqual([]);
    expect(summary.added).toBe(1);
    expect(summary.addedNames).toEqual(['Portrait key']);
    expect(summary.deleted).toEqual([]);
    expect(summary.changed).toEqual([revived]);
  });

  it('does not count matching tombstones as setups the file left alone', () => {
    const gone = tombstoneOf(mine, '2024-06-01T00:00:00.000Z');
    const summary = summariseImport([gone, other], [gone, other]);
    expect(summary.unchanged).toBe(1); // `other` only — `gone` is invisible
    expect(summary.changed).toEqual([]);
    expect(visibleChanges(summary)).toBe(0);
  });

  it('still writes a re-dated tombstone, but never reports it as a visible change', () => {
    const gone = tombstoneOf(mine, '2024-06-01T00:00:00.000Z');
    const reDated = tombstoneOf(mine, '2025-06-01T00:00:00.000Z');
    const summary = summariseImport([gone], [reDated]);
    expect(summary.bookkeeping).toBe(1);
    // Written, because the newest tombstone is what decides a later merge
    // against a live copy dated in between.
    expect(summary.changed).toEqual([reDated]);
    expect(visibleChanges(summary)).toBe(0);
    expect(summary.added).toBe(0);
    expect(summary.deleted).toEqual([]);
    expect(summary.replaced).toEqual([]);
  });

  it('counts a mixed file correctly in one pass', () => {
    const doomed = setup({ name: 'Doomed', updated_at: '2024-01-01T00:00:00.000Z' });
    const tweaked = { ...other, name: 'Rim v2', updated_at: '2025-06-01T00:00:00.000Z' };
    const fresh = setup({ name: 'Fill' });
    const summary = summariseImport(
      [mine, other, doomed],
      [mine, tweaked, tombstoneOf(doomed), fresh]
    );
    expect(summary.deleted.map((d) => d.name)).toEqual(['Doomed']);
    expect(summary.replaced.map((r) => r.name)).toEqual(['Rim']);
    expect(summary.addedNames).toEqual(['Fill']);
    expect(summary.unchanged).toBe(1);
    expect(summary.changed).toHaveLength(3);
    expect(visibleChanges(summary)).toBe(3);
  });

  it('reports a real exported tombstone as a deletion end to end', () => {
    // The whole path: device record -> export file -> merge -> summary.
    const record = [mine, other];
    const afterDeleting = [tombstoneOf(mine), other];
    const merged = importSetups(exportSetups(afterDeleting), record);
    const summary = summariseImport(record, merged);
    expect(summary.deleted.map((d) => d.name)).toEqual(['Portrait key']);
    expect(summary.added).toBe(0);
    expect(summary.replaced).toEqual([]);
  });
});

describe('import copy: deletions', () => {
  const mine = setup({ name: 'Portrait key', updated_at: '2024-01-01T00:00:00.000Z' });
  const other = setup({ name: 'Rim', updated_at: '2024-01-01T00:00:00.000Z' });
  const deleteBoth = summariseImport([mine, other], [tombstoneOf(mine), tombstoneOf(other)]);
  const deleteOneAddOne = summariseImport(
    [mine, other],
    [tombstoneOf(mine), other, setup({ name: 'Fill' })]
  );

  it('puts the deletion in the heading, ahead of the file name', () => {
    const title = importPlanTitle('studio-backup.json', deleteBoth);
    expect(title).toMatch(/^This deletes 2 saved setups/);
    expect(title).toContain('studio-backup.json');
    // No deletions: the heading is the ordinary question again.
    const plain = summariseImport([], [setup({ name: 'Fill' })]);
    expect(importPlanTitle('studio-backup.json', plain)).toBe('Import \u201Cstudio-backup.json\u201D?');
  });

  it('leads the plan with the deletion, never trails it', () => {
    const plan = importPlanSummary(deleteOneAddOne);
    expect(plan).toMatch(/^1 saved setup will be deleted/);
    expect(plan).toContain('1 new setup will be added');
    // The reassurance only belongs on an import that takes nothing away.
    expect(plan).not.toMatch(/nothing already saved/i);
  });

  it('describes a deletion as a deletion, never as an add or a replace', () => {
    const plan = importPlanSummary(deleteBoth);
    expect(plan).toContain('2 saved setups will be deleted');
    expect(plan).not.toMatch(/will be added|will be replaced/);
  });

  it('names what was removed after the fact, deletions first', () => {
    const done = importSuccessMessage(deleteOneAddOne);
    expect(done.title).toMatch(/Import saved \u2014 1 deleted/);
    expect(done.title.indexOf('deleted')).toBeLessThan(done.title.indexOf('added'));
    expect(done.detail).toContain('Deleted: Portrait key.');
  });

  it('says nothing visible changed when only a tombstone was re-dated', () => {
    const gone = tombstoneOf(mine, '2024-06-01T00:00:00.000Z');
    const summary = summariseImport([gone], [tombstoneOf(mine, '2025-06-01T00:00:00.000Z')]);
    expect(importPlanSummary(summary)).toMatch(/nothing in your library would change/i);
    const done = importSuccessMessage(summary);
    expect(done.title).toMatch(/nothing in your library changed/i);
    expect(done.detail).toMatch(/nothing was added, replaced or deleted/i);
  });

  it('labels the confirm button with what the tap actually does', () => {
    expect(importConfirmLabel(deleteBoth)).toBe('Delete 2 setups');
    expect(importConfirmLabel(deleteOneAddOne)).toBe('Delete 1 and import 1');
    const plain = summariseImport([], [setup({ name: 'Fill' }), setup({ name: 'Key' })]);
    expect(importConfirmLabel(plain)).toBe('Import 2 setups');
    // Never "Import N setups" over a plan that removes them.
    expect(importConfirmLabel(deleteBoth)).not.toMatch(/^Import/);
  });

  it('asks for an extra acknowledgement only when something is deleted', () => {
    expect(importAckLabel(deleteBoth)).toContain('2 saved setups will be deleted');
    expect(importAckLabel(deleteBoth)).toMatch(/bring them back/i);
    const plain = summariseImport([], [setup({ name: 'Fill' })]);
    expect(importAckLabel(plain)).toBe(null);
    const replaceOnly = summariseImport([mine], [{ ...mine, updated_at: '2025-06-01T00:00:00.000Z' }]);
    expect(importAckLabel(replaceOnly)).toBe(null);
  });

  it('says how many deletions landed when a write stops partway', () => {
    // changed is written in order: [tombstone(mine), tombstone(other)].
    const none = importPartialMessage(0, deleteBoth, httpError(500));
    expect(none.detail).toMatch(/none of the 2 deletions went through/i);
    expect(none.title).toContain('0 of 2 changes');

    const one = importPartialMessage(1, deleteBoth, httpError(500));
    expect(one.detail).toContain('1 of the 2 deletions went through');
    expect(one.detail).toMatch(/cannot be undone/i);
    expect(one.detail).toMatch(/import the same file again/i);
    // Still never phrased as a success.
    expect(one.title).toMatch(/^Import stopped/);
  });

  it('does not talk about deletions when the import had none', () => {
    const plain = summariseImport([], [setup({ name: 'Fill' }), setup({ name: 'Key' })]);
    expect(importPartialMessage(1, plain, httpError(500)).detail).not.toMatch(/deletion/i);
  });
});

describe('deleting a setup: what an export can and cannot do', () => {
  const typed = setup({ name: 'Portrait key' });
  const withLight = setup({ name: 'Rim', brightness_above_ambient: 180 });

  it('never tells the user an earlier export has a copy they can restore', () => {
    for (const message of [
      deleteConfirmMessage(typed),
      deleteConfirmMessage(withLight),
      deleteSuccessMessage(typed),
    ]) {
      expect(message.detail).not.toMatch(/has a copy/i);
      expect(message.detail).not.toMatch(/still has a copy/i);
    }
  });

  it('says plainly that importing an earlier export will not undo the deletion', () => {
    expect(deleteConfirmMessage(typed).detail).toMatch(/will not bring it back/i);
    expect(deleteConfirmMessage(withLight).detail).toMatch(/will not bring it back/i);
    expect(deleteSuccessMessage(typed).detail).toMatch(/will not bring it back/i);
  });

  it('asks by name, and offers setting it up again as the only way back', () => {
    const ask = deleteConfirmMessage(typed);
    expect(ask.title).toBe('Delete “Portrait key”?');
    expect(ask.detail).toMatch(/setting it up again/i);
  });

  it('still spells out what recapturing a light reference costs', () => {
    const ask = deleteConfirmMessage(withLight);
    expect(ask.detail).toMatch(/light reference/i);
    expect(ask.detail).toMatch(/switching the light off/i);
    expect(ask.detail).toMatch(/ambient to settle/i);
    // The typed-only setup has no reference to lose, so it is not warned about one.
    expect(deleteConfirmMessage(typed).detail).not.toMatch(/light reference/i);
  });

  it('confirms the delete landed, and says why the merge cannot undo it', () => {
    const done = deleteSuccessMessage(typed);
    expect(done.title).toBe('Deleted “Portrait key”.');
    expect(done.detail).toMatch(/the device confirmed it/i);
    expect(done.detail).toMatch(/merge/i);
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
