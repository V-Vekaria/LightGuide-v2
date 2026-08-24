// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';
import { describeDeviceClient } from './conformance';
import { HttpDeviceClient } from './http-client';

/**
 * The conformance suite against REAL FIRMWARE.
 *
 * Opt-in, and skipped by default:
 *
 *     LG_DEVICE_URL=http://192.168.4.1 npx vitest run src/device/conformance.hardware.test.ts
 *
 * It cannot run in the ordinary suite because it needs a board on the other end
 * of a network this machine has joined — the device is a SoftAP, so the test
 * runner has to be associated with it, not with the internet.
 *
 * ## Clean state
 *
 * Several tests assert on an empty device, and `make()` must hand back a client
 * to one. The mock does that by starting a fresh instance per test; a board
 * cannot — there is one of it, and it remembers.
 *
 * The first run of this suite proved the point: setups accumulated across
 * tests, so assertions expecting `[]` saw four setups and assertions expecting
 * one saw six. Six of the eight failures were that, not firmware.
 *
 * So `make()` wipes the board before every test. The wipe goes over the USB
 * cable, not over HTTP: the contract deliberately has no remote wipe, because
 * that would let anything on the access point erase a customer's setups. USB
 * is a fair proof of physical access, and it works regardless of which network
 * the runner has joined.
 *
 * ## What a failure here means
 *
 * These are the same assertions the app relies on, so a failure is a genuine
 * contract violation in firmware — not a test problem. The interesting ones are
 * the details that behave fine in casual use and only surface during
 * backup/restore: `updated_at` stored verbatim, a tombstone that must be
 * strictly newer, and `?include_deleted` rejecting anything but `1`.
 */
const url = process.env.LG_DEVICE_URL;

if (!url) {
  describe.skip('DeviceClient conformance: real firmware (set LG_DEVICE_URL)', () => {
    it('skipped', () => {});
  });
} else {
  describeDeviceClient(`real firmware at ${url}`, () => {
    // Synchronous on purpose: the client must not be handed out until the
    // board is genuinely empty, or the test races its own precondition.
    const out = execFileSync('python', ['device/tools/device_console.py', 'wipe'], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    if (!out.includes('wiped')) {
      throw new Error(`could not wipe the board before the test: ${out.trim()}`);
    }
    return new HttpDeviceClient(url);
  });
}
