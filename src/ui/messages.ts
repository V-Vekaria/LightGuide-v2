import type { ConnectionStatus, SensorState, Setup } from '../contract/types';
import { PROTOCOL_MAX_SUPPORTED, PROTOCOL_MIN_SUPPORTED } from '../contract/types';
import type { ConnectionFault } from '../device/connection';
import type { AxisHealth } from '../device/diagnostics';

/**
 * Every failure this app shows a photographer, in one place.
 *
 * The rule for all copy in this file: **name the recovery, not the exception.**
 * The user is mid-shoot, in a dim room, with a client waiting. "no device
 * connected" tells them nothing they can act on; "check the device still has
 * power, then check your phone is still on its Wi-Fi" does.
 *
 * The phone is joined to the ESP32's own access point and therefore has no
 * internet at all while the app is in use — no message in here may ever
 * suggest checking an internet connection.
 */

/** One line the user reads, one line that tells them what to do about it. */
export interface UserMessage {
  title: string;
  detail: string;
}

/**
 * What actually went wrong, from the user's point of view — not the exception
 * class. `no-device` and `unreachable` differ in whether a request was even
 * attempted, which matters: after `unreachable` a write may or may not have
 * landed, after `no-device` nothing was sent at all.
 */
export type DeviceFailure = 'no-device' | 'unreachable' | 'rejected' | 'unknown';

/**
 * The two things that actually cause a dropout on a device-hosted access
 * point. There is no third option worth printing: the phone is on the
 * device's own Wi-Fi, so there is no router, no DNS and no internet in the
 * path to blame.
 */
const RECONNECT_STEPS =
  'Check the device still has power, then check your phone is still joined to the LightGuide Wi-Fi network — phones switch back to a familiar network on their own.';

const POWER_CYCLE = 'Try again — if it keeps happening, switch the device off and on.';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

/** The HTTP status in an HttpDeviceClient error ("PUT /api/setups/x failed: 503"), if there is one. */
export function deviceErrorStatus(error: unknown): number | null {
  const match = /failed:\s*(\d{3})\s*$/.exec(errorMessage(error));
  return match ? Number(match[1]) : null;
}

export function classifyDeviceError(error: unknown): DeviceFailure {
  const message = errorMessage(error).trim();
  // The store's own guard, thrown before anything is sent to the device.
  if (/^no device connected\.?$/i.test(message)) return 'no-device';
  // HttpDeviceClient's shape for "the device answered, with a refusal".
  if (deviceErrorStatus(error) !== null) return 'rejected';
  // fetch() rejects with a TypeError when the request never reached anyone.
  if (error instanceof TypeError) return 'unreachable';
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'unreachable';
  }
  return 'unknown';
}

/**
 * Turns whatever a device call threw into something a photographer can act on.
 *
 * `action` is a verb phrase completing "Couldn't …" — e.g. 'start guiding'.
 * The raw exception text is deliberately dropped: it is the developer string
 * this whole module exists to keep off the screen.
 */
export function deviceErrorMessage(error: unknown, action: string): UserMessage {
  switch (classifyDeviceError(error)) {
    case 'no-device':
      return { title: `Couldn't ${action} — the device isn't connected.`, detail: RECONNECT_STEPS };
    case 'unreachable':
      return { title: `Couldn't ${action} — the device didn't answer.`, detail: RECONNECT_STEPS };
    case 'rejected': {
      const status = deviceErrorStatus(error);
      return {
        title: `Couldn't ${action} — the device turned it down.`,
        detail: `It answered but refused the change${status === null ? '' : ` (error ${status})`}. ${POWER_CYCLE}`,
      };
    }
    default:
      return {
        title: `Couldn't ${action}.`,
        detail: `Something went wrong between the app and the device. ${POWER_CYCLE}`,
      };
  }
}

/**
 * The standing banner for a screen whose buttons are disabled because the
 * device is not there. Null while connected — nothing to say.
 */
export function connectionNotice(status: ConnectionStatus): UserMessage | null {
  if (status === 'connected') return null;
  if (status === 'connecting') {
    return {
      title: 'Reconnecting to the device…',
      detail: 'Guiding and saving are paused until it answers.',
    };
  }
  return { title: "The device isn't connected.", detail: RECONNECT_STEPS };
}

/**
 * Why a control that needs the device is greyed out, short enough to sit on
 * the control itself.
 */
export function deviceActionReason(status: ConnectionStatus): string | null {
  if (status === 'connected') return null;
  return status === 'connecting' ? 'Waiting for the device to answer' : 'Needs the device — not connected';
}

/**
 * Why there is a dash where a live number should be. A stale feed and a lost
 * device look identical in the readout and need completely different
 * responses, so they never share copy.
 */
export function liveReadingNotice(
  status: ConnectionStatus,
  hasReading: boolean,
): UserMessage | null {
  if (hasReading) return null;
  if (status !== 'connected') return connectionNotice(status);
  return {
    title: 'No live reading right now.',
    detail:
      "The device is connected but its readings have gone quiet. Give it a moment — if the numbers don't come back, check nothing is covering the sensor.",
  };
}

/* ---------- finding and identifying a device ---------- */

/**
 * The copy for the device screen and the connect-by-address form.
 *
 * Same rule as everything above it: name the recovery, never the exception,
 * and never suggest the internet. What is new here is that some of these
 * failures are not the customer's to fix at all — a protocol mismatch is a
 * software version problem — and the copy has to say *which* of the two things
 * in front of them needs attention rather than leaving them to guess.
 */

/** What to call the device when it has not told us its name yet. */
const UNNAMED_DEVICE = 'The device';

/**
 * A device's name in a sentence, quoted, or a neutral stand-in. Quoting
 * matters once a studio has two: "LightGuide 9D40 isn't answering" reads as a
 * fault with a specific box, which is exactly what it is.
 */
export function deviceLabel(name: string | null | undefined): string {
  return name && name.trim() !== '' ? `“${name.trim()}”` : UNNAMED_DEVICE;
}

/** Where the app is pointed, for a sentence. Null host means same-origin. */
function atAddress(host: string | null): string {
  return host === null ? '' : ` at ${host}`;
}

/**
 * The one thing a customer needs to know about a version mismatch: guiding is
 * off, and it is off on purpose. An app that half-understands a device does
 * not fail visibly — it shows numbers that are quietly wrong, which is worse
 * than showing none.
 */
const MISMATCH_CONSEQUENCE =
  'Guiding is switched off until they match: an app that only half-understands a device would show measurements that look right and are not.';

/**
 * Why the app is not talking to a device, written for whoever is holding it.
 *
 * `host` is the address being tried, or null when the app is talking to
 * whoever served it — the shipped case, where there is no address to quote and
 * the recovery is about power and Wi-Fi instead.
 */
export function connectionFaultMessage(fault: ConnectionFault, host: string | null): UserMessage {
  switch (fault.kind) {
    case 'unreachable':
      if (host === null) {
        return { title: "The device isn't answering.", detail: RECONNECT_STEPS };
      }
      return {
        title: `Nothing answered at ${host}.`,
        detail:
          'Check the device is switched on, that the address matches the one it shows, and that this phone or laptop is on the same network as the device.',
      };
    case 'refused':
      // 404 is the one worth separating: something is serving at that address,
      // it just does not have this route. Either it is not a LightGuide, or it
      // is one running software from before devices could identify themselves.
      if (fault.status === 404) {
        return {
          title: `${host === null ? 'The device' : `Something at ${host}`} answered, but not as a LightGuide.`,
          detail:
            'Either that address belongs to something else on the network, or the device is running software too old to identify itself and needs updating.',
        };
      }
      return {
        title: `${UNNAMED_DEVICE}${atAddress(host)} turned the request down.`,
        detail: `It answered but refused to say who it is (error ${fault.status}). ${POWER_CYCLE}`,
      };
    case 'not-a-device':
      return {
        title: `Something answered${atAddress(host)}, but it isn't a LightGuide.`,
        detail:
          'Check the address against the one shown on the device. Another piece of equipment on the network can answer on the same address if the device is switched off.',
      };
    case 'protocol': {
      const name = deviceLabel(fault.info.name);
      if (fault.fit === 'device-too-new') {
        return {
          title: `${name} is newer than this copy of the app.`,
          detail: `The device speaks version ${fault.info.protocol} of the LightGuide format and this app understands up to ${PROTOCOL_MAX_SUPPORTED}. Reload this page to pick up the app the device is serving. ${MISMATCH_CONSEQUENCE}`,
        };
      }
      return {
        title: `${name} is older than this copy of the app.`,
        detail: `The device speaks version ${fault.info.protocol} of the LightGuide format and this app needs at least ${PROTOCOL_MIN_SUPPORTED}. The device needs its software updated — its firmware version is ${fault.info.firmware}. ${MISMATCH_CONSEQUENCE}`,
      };
    }
  }
}

/** What went wrong with an address the customer typed, before anything was sent. */
export function addressFormatMessage(): UserMessage {
  return {
    title: "That isn't an address this app can use.",
    detail:
      'Enter the address the device shows — four numbers separated by dots, like 192.168.4.1, with a colon and a port after it only if the device shows one.',
  };
}

/** After an address has been reached and remembered. */
export function connectedMessage(name: string, host: string | null): UserMessage {
  return {
    title: `Connected to ${deviceLabel(name)}.`,
    detail:
      host === null
        ? 'This page is served by the device itself, so it will connect on its own next time.'
        : `This app will look for the device at ${host} from now on, until you point it somewhere else.`,
  };
}

/* ---------- what the device says about itself ---------- */

/** The two axes, named as a customer would name them rather than as channels. */
export const SENSOR_NAMES = {
  distance: 'Distance sensor',
  light: 'Light sensor',
} as const;

/**
 * One sensor's state, in a word and a sentence.
 *
 * The `ok` detail carries the distinction this whole field exists for: a
 * working sensor with nothing in front of it still reads as a dash on the
 * guide screen, and a photographer who does not know that will go looking for
 * a fault that isn't there.
 */
export function sensorStateMessage(
  axis: 'distance' | 'light',
  state: SensorState,
): { label: string; detail: string } {
  switch (state) {
    case 'ok':
      return {
        label: 'Working',
        detail:
          axis === 'distance'
            ? 'Answering normally. A dash on the guide screen means nothing is in range — not a fault.'
            : 'Answering normally. A dash on the guide screen means it has nothing to measure — not a fault.',
      };
    case 'fault':
      return {
        label: 'Not responding',
        detail:
          axis === 'distance'
            ? 'The device cannot read distance at all. Switch it off and on; if it stays like this, it needs looking at — distance guidance will not work until it does.'
            : 'The device cannot read brightness at all. Switch it off and on; if it stays like this, it needs looking at — setups that hold a light reference will not guide on light until it does.',
      };
    default:
      return {
        label: 'Not checked yet',
        detail: 'The device has not reported on this sensor yet. Give it a moment after switching on.',
      };
  }
}

/**
 * What one axis of the live feed is doing. Distinct from the sensor's own
 * health on purpose: a sensor the device calls `ok` can still have gone quiet
 * on the wire, and the two together are what say whether the problem is the
 * sensor, the link, or neither.
 */
export function axisHealthLabel(health: AxisHealth): string {
  switch (health) {
    case 'live':
      return 'Live';
    case 'stale':
      return 'No recent reading';
    case 'never':
      return 'Nothing yet';
    default:
      return 'Link down';
  }
}

/* ---------- deleting ---------- */

/**
 * The one belief about a deletion that is easy to hold and expensive to hold
 * wrongly: **import is a merge, not a snapshot restore.** A deletion is the
 * newest recorded change to that setup, so it beats the older live copy in any
 * file exported before it — re-importing Monday’s backup does not undo
 * Tuesday’s delete.
 *
 * Since `feat(device): export tombstones`, having a copy in an export stopped
 * being the same thing as being able to restore it. This copy used to promise
 * the opposite (“Only an export you already made has a copy”,
 * “Anything you exported earlier still has a copy”), which sent the user
 * looking for a file that cannot help them. It is stated once here so both
 * halves of the delete flow say the same true thing.
 */
const NO_UNDELETE = 'Importing an earlier export will not bring it back';

/**
 * The confirmation before a delete. Names what goes and what getting it back
 * would actually cost — which, for a setup with a light reference, is a dark
 * room and a second capture, not a file.
 */
export function deleteConfirmMessage(setup: Setup): UserMessage {
  const detail =
    setup.brightness_above_ambient === null
      ? `It goes from the device straight away. ${NO_UNDELETE} — setting it up again is the only way.`
      : `It goes from the device straight away, and its light reference with it. ${NO_UNDELETE} — capturing another reference means switching the light off, waiting for ambient to settle, and setting it again.`;
  return { title: `Delete “${setup.name}”?`, detail };
}

/**
 * After the device confirms a delete. Says why the export the user is about to
 * reach for will not help, while there is still a reason to care.
 */
export function deleteSuccessMessage(setup: Setup): UserMessage {
  return {
    title: `Deleted “${setup.name}”.`,
    detail: `The device confirmed it. ${NO_UNDELETE}: an import merges the file into what the device holds now, and the deletion is the newer change.`,
  };
}

/* ---------- import ---------- */

/**
 * Since `feat(device): export tombstones`, an export carries deletions: a
 * `deleted: true` record with an `updated_at` newer than the live copy it
 * replaces. Both sides of the merge are now the full record, tombstones
 * included (`allSetups`, not `setups`).
 *
 * That makes `deleted` load-bearing here. Classifying purely on id presence
 * and `updated_at` — as this did before — reports an incoming tombstone as
 * "1 new setup will be added" or "1 saved setup will be replaced" while the
 * actual effect is a deletion. A confirmation that misdescribes a destructive
 * act is worse than no confirmation at all, so every branch below asks what
 * the user would *see* happen, not which fields differ.
 */

/** A saved setup the imported file will overwrite. `name` is the one at risk. */
export interface ReplacedSetup {
  id: string;
  /** The name currently on the device — what the user will lose. */
  name: string;
  /** The name the file will give it, when the file renames it. */
  incomingName: string;
}

/** A saved setup the file will remove. Named from the device's copy — the file's side is a tombstone. */
export interface DeletedSetup {
  id: string;
  name: string;
}

export interface ImportSummary {
  /**
   * Setups that will appear in the library: in the file, absent or tombstoned
   * on the device. A live copy landing over a local tombstone counts here —
   * "replaced" would be a lie, since there is no visible copy to replace, and
   * what the user actually sees is a row appearing.
   */
  added: number;
  addedNames: string[];
  /** Live setups the file's newer live copies will overwrite. */
  replaced: ReplacedSetup[];
  /** Live setups the file's newer tombstones will remove. The destructive one. */
  deleted: DeletedSetup[];
  /** Live setups the import leaves exactly as they are. */
  unchanged: number;
  /**
   * Writes with no visible effect: a tombstone the file merely re-dates. Kept
   * in `changed` rather than dropped — the newest tombstone is what decides a
   * later three-way merge against a live copy dated in between — but never
   * reported as something the user will see, because they will not.
   */
  bookkeeping: number;
  /**
   * Exactly the setups that must be written — nothing else. Re-importing your
   * own export must not rewrite every unchanged entry to device flash.
   * Ordered as `persistSetups` writes them, which is what lets a partial
   * failure say which changes actually landed.
   */
  changed: Setup[];
}

/**
 * What an import would actually do, computed before a single byte is written.
 *
 * Export/import is the only backup this app has, so a merge that silently
 * overwrites or removes a tuned setup is unrecoverable. This is the preview
 * that makes it not silent.
 */
export function summariseImport(current: Setup[], merged: Setup[]): ImportSummary {
  const currentById = new Map(current.map((setup) => [setup.id, setup]));
  const addedNames: string[] = [];
  const replaced: ReplacedSetup[] = [];
  const deleted: DeletedSetup[] = [];
  const changed: Setup[] = [];
  let unchanged = 0;
  let bookkeeping = 0;

  for (const incoming of merged) {
    const existing = currentById.get(incoming.id);

    if (!existing) {
      // A tombstone for a setup this device has never held deletes nothing and
      // is worth no flash write. It is not a change, so it is not reported as
      // one — not even as "unchanged", which means a setup the user can see.
      if (incoming.deleted) continue;
      addedNames.push(incoming.name);
      changed.push(incoming);
      continue;
    }

    if (existing.updated_at === incoming.updated_at) {
      // Two matching tombstones are invisible on both sides; only a live copy
      // is a setup the user can see the file leaving alone.
      if (!existing.deleted) unchanged += 1;
      continue;
    }

    // `importSetups` only takes the incoming copy when it is strictly newer,
    // so reaching here means the file wins. What that means to the user
    // depends entirely on which side is a tombstone.
    changed.push(incoming);
    if (incoming.deleted && !existing.deleted) {
      deleted.push({ id: incoming.id, name: existing.name });
    } else if (!incoming.deleted && existing.deleted) {
      addedNames.push(incoming.name);
    } else if (incoming.deleted && existing.deleted) {
      bookkeeping += 1;
    } else {
      replaced.push({ id: incoming.id, name: existing.name, incomingName: incoming.name });
    }
  }

  return {
    added: addedNames.length,
    addedNames,
    replaced,
    deleted,
    unchanged,
    bookkeeping,
    changed,
  };
}

/** Changes the user would actually see happen to their library. */
export function visibleChanges(summary: ImportSummary): number {
  return summary.added + summary.replaced.length + summary.deleted.length;
}

export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Names, readable in a sentence, without letting a 40-setup file fill the screen. */
export function nameList(names: string[], max = 4): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * The heading over the confirmation. A deletion does not get to be a clause
 * inside a sentence about importing — when the file removes something, that
 * is what the heading says, ahead of the file name.
 */
export function importPlanTitle(fileName: string, summary: ImportSummary): string {
  if (summary.deleted.length > 0) {
    return `This deletes ${countOf(summary.deleted.length, 'saved setup')} — import “${fileName}”?`;
  }
  return `Import “${fileName}”?`;
}

/** One sentence describing what confirming the import will do. Deletions lead. */
export function importPlanSummary(summary: ImportSummary): string {
  if (summary.changed.length === 0) {
    return 'Nothing would change — every setup in this file is already on the device.';
  }
  if (visibleChanges(summary) === 0) {
    return 'Nothing in your library would change — the file only re-dates setups you have already deleted.';
  }
  const parts: string[] = [];
  if (summary.deleted.length > 0) {
    parts.push(`${countOf(summary.deleted.length, 'saved setup')} will be deleted`);
  }
  if (summary.added > 0) parts.push(`${countOf(summary.added, 'new setup')} will be added`);
  if (summary.replaced.length > 0) {
    parts.push(`${countOf(summary.replaced.length, 'saved setup')} will be replaced`);
  } else if (summary.deleted.length === 0) {
    parts.push('nothing already saved will be replaced or deleted');
  }
  return `${joinClauses(parts)}.`;
}

/**
 * The confirm button. It says what the tap does, not what screen you are on:
 * "Import 3 setups" over a plan that removes two of them is the same lie the
 * summary above it exists to stop telling.
 */
export function importConfirmLabel(summary: ImportSummary): string {
  if (visibleChanges(summary) === 0) {
    return `Apply ${countOf(summary.changed.length, 'change')}`;
  }
  const deletions = summary.deleted.length;
  const rest = summary.added + summary.replaced.length;
  if (deletions === 0) return `Import ${countOf(rest, 'setup')}`;
  if (rest === 0) return `Delete ${countOf(deletions, 'setup')}`;
  return `Delete ${deletions} and import ${rest}`;
}

/**
 * The extra, deliberate acknowledgement a deletion has to pass through. Null
 * when the import deletes nothing — friction earns its place only where the
 * damage is permanent.
 */
export function importAckLabel(summary: ImportSummary): string | null {
  if (summary.deleted.length === 0) return null;
  return `I understand ${countOf(
    summary.deleted.length,
    'saved setup'
  )} will be deleted, and that nothing in the app can bring them back`;
}

/**
 * What happened after a successful import. Says plainly when the answer is
 * "nothing", because a silent no-op is indistinguishable from a failure — and
 * names what it removed, because that is the part with no way back.
 */
export function importSuccessMessage(summary: ImportSummary): UserMessage {
  if (summary.changed.length === 0) {
    return {
      title: 'Nothing to import.',
      detail:
        'Every setup in that file is already on the device, unchanged. No setups were added, replaced or deleted.',
    };
  }
  if (visibleChanges(summary) === 0) {
    return {
      title: 'Import saved — nothing in your library changed.',
      detail:
        'The file only re-dated setups you had already deleted. Nothing was added, replaced or deleted.',
    };
  }
  const parts: string[] = [];
  if (summary.deleted.length > 0) parts.push(`${summary.deleted.length} deleted`);
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.replaced.length > 0) parts.push(`${summary.replaced.length} replaced`);
  const removed =
    summary.deleted.length > 0
      ? `Deleted: ${nameList(summary.deleted.map((entry) => entry.name))}. `
      : '';
  return {
    title: `Import saved — ${parts.join(', ')}.`,
    detail: `${removed}The device confirmed ${countOf(
      summary.changed.length,
      'change'
    )}, and ${countOf(summary.unchanged, 'setup')} already matched the file.`,
  };
}

/**
 * A write that stopped partway. Never phrased as a success: it leads with the
 * count that actually landed, because the user has to decide what to do next
 * from that number alone.
 *
 * `persistSetups` writes `summary.changed` in order and reports how many it
 * confirmed, so the first `saved` entries really are on the device. That is
 * what makes it possible — and necessary — to say how many of the deletions
 * went through: "some of what you confirmed is already gone" and "none of it
 * is" call for completely different next moves.
 */
export function importPartialMessage(
  saved: number,
  summary: ImportSummary,
  error: unknown
): UserMessage {
  const cause = deviceErrorMessage(error, 'finish the import');
  const total = summary.changed.length;
  const landed = Math.min(Math.max(saved, 0), total);
  const remaining = total - landed;
  const deletions = summary.deleted.length;
  const deletionsLanded = summary.changed.slice(0, landed).filter((setup) => setup.deleted).length;

  let removed = '';
  if (deletions > 0) {
    removed =
      deletionsLanded === 0
        ? `None of the ${countOf(deletions, 'deletion')} went through. `
        : `${deletionsLanded} of the ${countOf(
            deletions,
            'deletion'
          )} went through and cannot be undone. `;
  }

  return {
    title: `Import stopped after ${landed} of ${countOf(total, 'change')}.`,
    detail: `${removed}${cause.detail} The ${countOf(
      remaining,
      'change'
    )} that did not land left the device as it was — import the same file again to finish.`,
  };
}
