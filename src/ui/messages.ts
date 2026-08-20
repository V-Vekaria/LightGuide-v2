import type { ConnectionStatus, Setup } from '../contract/types';

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

/* ---------- import ---------- */

/** A saved setup the imported file will overwrite. `name` is the one at risk. */
export interface ReplacedSetup {
  id: string;
  /** The name currently on the device — what the user will lose. */
  name: string;
  /** The name the file will give it, when the file renames it. */
  incomingName: string;
}

export interface ImportSummary {
  /** Setups in the file that do not exist on the device yet. */
  added: number;
  addedNames: string[];
  /** Setups on the device that the file's newer copies will overwrite. */
  replaced: ReplacedSetup[];
  /** Setups the import leaves exactly as they are. */
  unchanged: number;
  /**
   * Exactly the setups that must be written — nothing else. Re-importing your
   * own export must not rewrite every unchanged entry to device flash.
   */
  changed: Setup[];
}

/**
 * What an import would actually do, computed before a single byte is written.
 *
 * Export/import is the only backup this app has, so a merge that silently
 * overwrites a tuned setup is unrecoverable. This is the preview that makes
 * it not silent.
 */
export function summariseImport(current: Setup[], merged: Setup[]): ImportSummary {
  const currentById = new Map(current.map((setup) => [setup.id, setup]));
  const addedNames: string[] = [];
  const replaced: ReplacedSetup[] = [];
  const changed: Setup[] = [];
  let unchanged = 0;

  for (const incoming of merged) {
    const existing = currentById.get(incoming.id);
    if (!existing) {
      addedNames.push(incoming.name);
      changed.push(incoming);
    } else if (existing.updated_at !== incoming.updated_at) {
      replaced.push({ id: incoming.id, name: existing.name, incomingName: incoming.name });
      changed.push(incoming);
    } else {
      unchanged += 1;
    }
  }

  return { added: addedNames.length, addedNames, replaced, unchanged, changed };
}

export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Names, readable in a sentence, without letting a 40-setup file fill the screen. */
export function nameList(names: string[], max = 4): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** One sentence describing what confirming the import will do. */
export function importPlanSummary(summary: ImportSummary): string {
  if (summary.changed.length === 0) {
    return 'Nothing would change — every setup in this file is already on the device.';
  }
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${countOf(summary.added, 'new setup')} will be added`);
  if (summary.replaced.length > 0) {
    parts.push(`${countOf(summary.replaced.length, 'saved setup')} will be replaced`);
  } else {
    parts.push('nothing already saved will be replaced');
  }
  return `${parts.join(', and ')}.`;
}

/**
 * What happened after a successful import. Says plainly when the answer is
 * "nothing", because a silent no-op is indistinguishable from a failure.
 */
export function importSuccessMessage(summary: ImportSummary): UserMessage {
  if (summary.changed.length === 0) {
    return {
      title: 'Nothing to import.',
      detail:
        'Every setup in that file is already on the device, unchanged. No setups were added or replaced.',
    };
  }
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.replaced.length > 0) parts.push(`${summary.replaced.length} replaced`);
  return {
    title: `Import saved — ${parts.join(', ')}.`,
    detail: `The device confirmed ${countOf(summary.changed.length, 'setup')}, and ${countOf(
      summary.unchanged,
      'setup',
    )} already matched the file.`,
  };
}

/**
 * A write that stopped partway. Never phrased as a success: it leads with the
 * count that actually landed, because the user has to decide what to do next
 * from that number alone.
 */
export function importPartialMessage(saved: number, total: number, error: unknown): UserMessage {
  const cause = deviceErrorMessage(error, 'finish the import');
  const remaining = Math.max(total - saved, 0);
  return {
    title: `Import stopped after saving ${saved} of ${countOf(total, 'setup')}.`,
    detail: `${cause.detail} The ${countOf(
      remaining,
      'setup',
    )} that did not save are unchanged on the device — import the same file again to finish.`,
  };
}
