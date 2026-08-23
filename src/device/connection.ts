import { effect, signal } from '@preact/signals';
import type { DeviceClient, DeviceInfo } from '../contract/types';
import { PROTOCOL_MAX_SUPPORTED, PROTOCOL_MIN_SUPPORTED } from '../contract/types';
import { connect, disconnect, forgetFeedHistory, status } from '../store/store';
import { SAME_ORIGIN, readStoredAddress, writeStoredAddress } from './endpoint';
import { HttpDeviceClient } from './http-client';

/**
 * Whether the app and the board can talk to each other at all, and — when they
 * cannot — which of the two needs attention.
 *
 * This module owns the one transport-specific decision the store deliberately
 * does not make: *which* device to open. The store takes a `DeviceClient` and
 * knows nothing about addresses, which is what lets it be driven by an
 * in-memory client in tests. Address resolution, probing and endpoint swapping
 * live here instead.
 */

/* ---------- protocol compatibility ---------- */

/**
 * Which side of a protocol mismatch we are on.
 *
 * The direction is the whole point. Both mismatches produce the same symptom —
 * an app that cannot rely on what the board says — but they have opposite
 * fixes, and a customer told the wrong one will spend the afternoon updating
 * the thing that was already right.
 */
export type ProtocolFit = 'ok' | 'device-too-old' | 'device-too-new';

export function protocolFit(protocol: number): ProtocolFit {
  if (protocol < PROTOCOL_MIN_SUPPORTED) return 'device-too-old';
  if (protocol > PROTOCOL_MAX_SUPPORTED) return 'device-too-new';
  return 'ok';
}

/* ---------- probing an address ---------- */

/**
 * Why the app is not talking to a device, in the four shapes that call for
 * four different things from the person reading it.
 *
 *  - `unreachable` — nothing answered. Wrong address, device off, phone on the
 *    wrong network.
 *  - `refused` — something answered with an error. `404` in particular means
 *    "a web server, but not this route": either not a LightGuide, or firmware
 *    older than `/api/info` itself.
 *  - `not-a-device` — something answered with a body that is not a LightGuide
 *    description. Never coerced into a device with blank fields.
 *  - `protocol` — a LightGuide, positively identified, that this app cannot
 *    safely drive. It carries the `info` because we *do* know who it is, and
 *    naming the device is most of what makes this message actionable.
 */
export type ConnectionFault =
  | { kind: 'unreachable' }
  | { kind: 'refused'; status: number }
  | { kind: 'not-a-device' }
  | { kind: 'protocol'; info: DeviceInfo; fit: 'device-too-old' | 'device-too-new' };

export type ProbeOutcome = { ok: true; info: DeviceInfo } | { ok: false; fault: ConnectionFault };

/** The status in `HttpDeviceClient`'s "GET /api/info failed: 404", if there is one. */
function statusOf(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = /failed:\s*(\d{3})\s*$/.exec(message);
  return match ? Number(match[1]) : null;
}

/**
 * Turns whatever `getInfo()` threw into one of the four faults.
 *
 * Pure, and separate from `probeDevice` so the mapping can be tested without a
 * network: every branch here decides which sentence a customer reads.
 */
export function classifyProbeFailure(error: unknown): ConnectionFault {
  const status = statusOf(error);
  if (status !== null) return { kind: 'refused', status };

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/malformed device description/i.test(message)) return { kind: 'not-a-device' };
  // The body parsed as JSON but was not a device — same conclusion as above,
  // reached from `res.json()` rejecting on a non-JSON body (an HTML error page
  // from some other server on the network is the realistic case).
  if (/unexpected token|not valid json|json/i.test(message)) return { kind: 'not-a-device' };

  // Everything left is "the request never got an answer": fetch's TypeError,
  // the timeout, and any transport error we have no better name for. This is
  // the honest default — the alternative, a generic "something went wrong",
  // names no recovery at all, and this call does exactly one thing.
  return { kind: 'unreachable' };
}

/** Asks a device who it is, and whether this app can drive it. Never throws. */
export async function probeDevice(client: DeviceClient): Promise<ProbeOutcome> {
  let info: DeviceInfo;
  try {
    info = await client.getInfo();
  } catch (error) {
    return { ok: false, fault: classifyProbeFailure(error) };
  }
  const fit = protocolFit(info.protocol);
  if (fit !== 'ok') return { ok: false, fault: { kind: 'protocol', info, fit } };
  return { ok: true, info };
}

/* ---------- the live connection ---------- */

/**
 * What the device last told us about itself. Survives the link dropping — the
 * board's name and firmware do not stop being true because the Wi-Fi did — but
 * see `deviceInfoAt`: anything that can go out of date is shown with the time
 * it was learned, never as a current fact.
 */
export const deviceInfo = signal<DeviceInfo | null>(null);
/** Wall-clock ms when `deviceInfo` was read from the device. */
export const deviceInfoAt = signal<number | null>(null);
/** The address in use: `SAME_ORIGIN` for the shipped, zero-setup path. */
export const deviceAddress = signal<string>(SAME_ORIGIN);
/** Why we are not talking to a device, or null when we are. */
export const connectionFault = signal<ConnectionFault | null>(null);
/** True while a probe is in flight — the device screen's controls read it. */
export const checkingDevice = signal(false);

let client: HttpDeviceClient | null = null;
/**
 * Bumped on every `openDevice`, so a slow probe against an address the user
 * has already moved on from cannot land and repaint the screen with the wrong
 * device's name.
 */
let attempt = 0;
/**
 * Guards the reconnect effect below. A plain boolean, not a signal, and that
 * is deliberate: an effect that both reads and writes the same signal
 * re-triggers itself forever.
 */
let probeInFlight = false;

/**
 * Points the app at a device and, if it answers acceptably, connects to it.
 *
 * The order matters. The probe happens *before* the store is connected, so an
 * app that cannot understand the board never gets as far as rendering its
 * numbers. That costs one HTTP round trip on startup, which on the device's
 * own access point is a few milliseconds, and buys the guarantee the whole
 * protocol field exists for.
 *
 * With one exception, which is the difference between "cannot" and "did not":
 * a device that fails to answer at all is still connected to, because the
 * socket's own backoff is what recovers a board that is merely switched off,
 * or a phone that has not finished joining the network. Refusing to connect
 * there would turn a five-second wait into a permanent dead app.
 *
 * `remember` writes the address to storage — only ever on success, so an
 * address that has never reached a device cannot become the one the app tries
 * first tomorrow.
 */
export async function openDevice(
  origin: string,
  options: { remember?: boolean } = {},
): Promise<ProbeOutcome> {
  attempt += 1;
  const mine = attempt;

  // disconnect() before close(), same order as the app's own teardown: it
  // clears the store's heartbeat and live subscription, which close() alone
  // would leave running.
  disconnect();
  client?.close();
  client = null;
  // A different device is a different feed. Whatever the last one told us
  // about its axes stops being true about this one the moment we point
  // somewhere else — and on the paths that never connect at all (a protocol
  // mismatch, an address with nothing behind it) nothing would ever arrive to
  // overwrite it.
  forgetFeedHistory();

  deviceInfo.value = null;
  deviceInfoAt.value = null;
  connectionFault.value = null;
  deviceAddress.value = origin;
  checkingDevice.value = true;

  const next = new HttpDeviceClient(origin);
  const outcome = await probeDevice(next);

  if (mine !== attempt) {
    // Superseded while we waited. Close the client we opened — nothing else
    // will — and report the outcome to our own caller without touching any
    // signal the newer attempt has since written.
    next.close();
    return outcome;
  }

  checkingDevice.value = false;

  // Going back to same-origin is a *reset*, and it takes effect whatever the
  // answer. There is always a serving origin, so there is nothing to validate;
  // and the device that served the page is exactly the one someone reaches for
  // when the address they typed has stopped working. Gating the reset on that
  // device answering acceptably would strand them on the broken address —
  // found on the bench against a board too old to identify itself, which
  // "failed" the probe and so never cleared the stored address.
  if (options.remember && origin === SAME_ORIGIN) writeStoredAddress(null);

  if (outcome.ok) {
    deviceInfo.value = outcome.info;
    deviceInfoAt.value = Date.now();
    client = next;
    connect(next);
    if (options.remember) writeStoredAddress(origin);
    return outcome;
  }

  connectionFault.value = outcome.fault;

  if (outcome.fault.kind === 'protocol') {
    // We know exactly who this is and that we must not drive it. Keep the
    // identity so the screen can name the device and the firmware — that is
    // what makes the message actionable — but leave the client closed.
    deviceInfo.value = outcome.fault.info;
    deviceInfoAt.value = Date.now();
    next.close();
    return outcome;
  }

  // Unreachable, refused or unrecognised: connect anyway so the socket's
  // backoff can pick the device up when it appears.
  client = next;
  connect(next);
  return outcome;
}

/**
 * Re-asks the current device who it is. Used by the device screen's "Check
 * again" and by the reconnect effect below.
 *
 * Returns null when there is no client at all, which is a different answer
 * from a failed probe and must not be shown as one.
 */
export async function refreshDeviceInfo(): Promise<ProbeOutcome | null> {
  const current = client;
  if (current === null) return null;
  const mine = attempt;
  probeInFlight = true;
  checkingDevice.value = true;
  try {
    const outcome = await probeDevice(current);
    if (mine !== attempt) return outcome; // a different device is being opened
    if (outcome.ok) {
      deviceInfo.value = outcome.info;
      deviceInfoAt.value = Date.now();
      connectionFault.value = null;
    } else {
      connectionFault.value = outcome.fault;
      if (outcome.fault.kind === 'protocol') {
        deviceInfo.value = outcome.fault.info;
        deviceInfoAt.value = Date.now();
      }
    }
    return outcome;
  } finally {
    probeInFlight = false;
    if (mine === attempt) checkingDevice.value = false;
  }
}

/**
 * Opens the device the app should start on, and keeps its identity current.
 *
 * The stored address wins if there is one, and same-origin is the fallback —
 * never the other way round, because same-origin is the shipped configuration
 * and must work with nothing stored at all.
 *
 * The effect re-identifies the device whenever the link comes up without us
 * knowing who is on the other end. That covers the ordinary case of opening
 * the app before switching the device on: the first probe fails, the socket
 * keeps retrying, and the moment it succeeds the device screen fills in by
 * itself rather than waiting for someone to press a button.
 */
export function startConnection(): () => void {
  void openDevice(readStoredAddress() ?? SAME_ORIGIN);

  const stopEffect = effect(() => {
    const connected = status.value === 'connected';
    const identified = deviceInfo.value !== null;
    if (connected && !identified && !probeInFlight) void refreshDeviceInfo();
  });

  return () => {
    stopEffect();
    closeConnection();
  };
}

/** Tears the connection down. Leaves the stored address alone. */
export function closeConnection(): void {
  attempt += 1;
  disconnect();
  client?.close();
  client = null;
  forgetFeedHistory();
  deviceInfo.value = null;
  deviceInfoAt.value = null;
  connectionFault.value = null;
  checkingDevice.value = false;
}
