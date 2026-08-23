import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import type { DeviceInfo, Reading } from '../contract/types';
import { PROTOCOL_MAX_SUPPORTED } from '../contract/types';

/**
 * The device screen, rendered.
 *
 * Two things are being protected here, and they pull in opposite directions.
 *
 * The screen has to *say more* than any other — it is the one place a customer
 * finds out which board is answering and whether it is well, and the one place
 * a demo audience can tell hardware from a simulation. And it must not become
 * the place a withheld reading leaks out: the rest of the app suppresses a
 * stale axis entirely, and a diagnostics page that showed the number anyway
 * would quietly undo that everywhere it matters.
 *
 * `openDevice` and `refreshDeviceInfo` are replaced with spies; every signal
 * the module exports is the real one, so what the screen reads is exactly what
 * the connection module writes.
 */
vi.mock('../device/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../device/connection')>();
  return {
    ...actual,
    openDevice: vi.fn(async () => ({ ok: false, fault: { kind: 'unreachable' as const } })),
    refreshDeviceInfo: vi.fn(async () => null),
  };
});

import {
  checkingDevice,
  connectionFault,
  deviceAddress,
  deviceInfo,
  deviceInfoAt,
  openDevice,
  refreshDeviceInfo,
} from '../device/connection';
import { SAME_ORIGIN } from '../device/endpoint';
import { STALE_AFTER_MS } from '../guidance/liveness';
import {
  lastFrameAt,
  lastGoodAt,
  lastGoodLightAt,
  reading,
  screen,
  status,
  tick,
} from '../store/store';
import { AppBar } from './Chrome';
import { DeviceScreen } from './Device';

const STALE_MS = STALE_AFTER_MS + 3000;

function info(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
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

function frame(overrides: Partial<Reading> = {}): Reading {
  return { distance_cm: 52.4, brightness: 0.5, ambient: 0.1, seq: 7, ts: 0, ...overrides };
}

/** Puts the store in a connected state with a feed of the given freshness. */
function setFeed(opts: { distanceLive?: boolean; lightLive?: boolean } = {}): void {
  const now = Date.now();
  status.value = 'connected';
  reading.value = frame();
  lastFrameAt.value = now;
  lastGoodAt.value = (opts.distanceLive ?? true) ? now : now - STALE_MS;
  lastGoodLightAt.value = (opts.lightLive ?? true) ? now : now - STALE_MS;
  tick.value += 1;
}

function text(container: Element): string {
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

/** The value cell of the named live-link row. */
function linkValue(container: Element, name: string): string {
  const row = [...container.querySelectorAll('.link-row')].find((el) =>
    el.querySelector('.link-name')?.textContent?.includes(name),
  );
  return (row?.querySelector('.link-value')?.textContent ?? '').trim();
}

function linkState(container: Element, name: string): string {
  const row = [...container.querySelectorAll('.link-row')].find((el) =>
    el.querySelector('.link-name')?.textContent?.includes(name),
  );
  return (row?.querySelector('.link-state')?.textContent ?? '').trim();
}

beforeEach(() => {
  deviceInfo.value = null;
  deviceInfoAt.value = null;
  connectionFault.value = null;
  deviceAddress.value = SAME_ORIGIN;
  checkingDevice.value = false;
  status.value = 'disconnected';
  reading.value = null;
  lastFrameAt.value = null;
  lastGoodAt.value = null;
  lastGoodLightAt.value = null;
  screen.value = 'device';
  vi.mocked(openDevice).mockClear();
  vi.mocked(refreshDeviceInfo).mockClear();
});

afterEach(() => {
  cleanup();
});

describe('the device screen identifies what is connected', () => {
  it('shows the device name, serial, firmware and contract version', () => {
    // This is the whole demonstration: numbers only something running can
    // produce, attributed to a named board.
    deviceInfo.value = info();
    deviceInfoAt.value = Date.now();
    setFeed();
    const { container } = render(<DeviceScreen />);

    expect(container.querySelector('.device-name')?.textContent).toBe('LightGuide E5F6');
    const body = text(container);
    expect(body).toContain('lg-a1b2c3d4e5f6');
    expect(body).toContain('0.4.2');
    expect(body).toContain('LightGuide ESP32-S3');
  });

  it('names the firmware version and the contract version as different things', () => {
    // Conflating them is what makes a version mismatch impossible to diagnose
    // down a phone line, so the screen must not print one number under a
    // label that could mean either.
    deviceInfo.value = info();
    const { container } = render(<DeviceScreen />);
    const labels = [...container.querySelectorAll('.spec-label')].map((el) => el.textContent);
    expect(labels).toContain('Firmware');
    expect(labels).toContain('Talks version');
  });

  it('leaves out what the device did not report rather than inventing it', () => {
    deviceInfo.value = info({ model: null, uptime_s: null, free_storage_bytes: null });
    const { container } = render(<DeviceScreen />);
    const labels = [...container.querySelectorAll('.spec-label')].map((el) => el.textContent);
    expect(labels).not.toContain('Model');
    expect(labels).not.toContain('Switched on for');
    expect(labels).not.toContain('Storage free');
  });

  it('says the identity is the last thing heard when the device is gone', () => {
    // The board's name does not stop being true because the Wi-Fi dropped,
    // but its sensor health might have. Anything that can go out of date is
    // shown with when it was learned, never as a current fact.
    deviceInfo.value = info();
    deviceInfoAt.value = Date.now() - 60_000;
    status.value = 'disconnected';
    const { container } = render(<DeviceScreen />);
    expect(text(container)).toContain('Last answered');
  });

  it('asks the device again on request', () => {
    deviceInfo.value = info();
    const { getByText } = render(<DeviceScreen />);
    fireEvent.click(getByText('Check again'));
    expect(refreshDeviceInfo).toHaveBeenCalled();
  });
});

describe('sensor health', () => {
  it('tells a broken sensor apart from a stand that is simply out of range', () => {
    // The distinction the whole health field exists for. Both are a dash on
    // the guide screen; they need opposite things from the person holding the
    // stand, and only the device can say which it is.
    deviceInfo.value = info({
      sensors: { distance: { state: 'fault' }, light: { state: 'ok' } },
    });
    const { container } = render(<DeviceScreen />);
    const rows = [...container.querySelectorAll('.health-row')].map((el) => text(el));

    expect(rows[0]).toContain('Distance sensor');
    expect(rows[0]).toContain('Not responding');
    expect(rows[0]).toContain('needs looking at');

    expect(rows[1]).toContain('Light sensor');
    expect(rows[1]).toContain('Working');
    expect(rows[1]).toContain('not a fault');
  });

  it('states each sensor in words, not only in a colour', () => {
    // Green/amber/red is a distinction a deuteranope does not get, and this
    // is the screen someone reads when they already suspect something.
    deviceInfo.value = info({
      sensors: { distance: { state: 'unknown' }, light: { state: 'fault' } },
    });
    const { container } = render(<DeviceScreen />);
    const states = [...container.querySelectorAll('.health-state')].map((el) => el.textContent);
    expect(states).toEqual(['Not checked yet', 'Not responding']);
  });
});

describe('live link diagnostics never leak a withheld reading', () => {
  it('shows a live axis value', () => {
    deviceInfo.value = info();
    setFeed();
    const { container } = render(<DeviceScreen />);
    expect(linkValue(container, 'Distance')).toBe('52.4 cm');
    expect(linkState(container, 'Distance')).toBe('Live');
  });

  it('withholds the number on a stale axis and shows its age instead', () => {
    // The rest of the app refuses to draw this reading. A diagnostics page
    // that showed it anyway would be a back door onto exactly the stale value
    // every other screen is careful to suppress.
    deviceInfo.value = info();
    setFeed({ distanceLive: false });
    const { container } = render(<DeviceScreen />);

    expect(linkState(container, 'Distance')).toBe('No recent reading');
    expect(linkValue(container, 'Distance')).not.toContain('52.4');
    expect(linkValue(container, 'Distance')).toContain('ago');
  });

  it('withholds every axis when the link is down, however fresh the stamps', () => {
    deviceInfo.value = info();
    setFeed();
    status.value = 'disconnected';
    tick.value += 1;
    const { container } = render(<DeviceScreen />);

    expect(linkState(container, 'Distance')).toBe('Link down');
    expect(linkValue(container, 'Distance')).not.toContain('52.4');
    expect(linkState(container, 'Light above ambient')).toBe('Link down');
  });

  it('separates "no frames" from "frames with nothing in them"', () => {
    // The most useful diagnostic in the app: frames still arriving with every
    // channel null is a working link and a broken sensor, and no frames at all
    // is a broken link. Both are dashes everywhere else.
    deviceInfo.value = info();
    const now = Date.now();
    status.value = 'connected';
    reading.value = frame({ distance_cm: null, brightness: null, ambient: null });
    lastFrameAt.value = now;
    lastGoodAt.value = null;
    lastGoodLightAt.value = null;
    tick.value += 1;

    const { container } = render(<DeviceScreen />);
    expect(linkState(container, 'Distance')).toBe('Nothing yet');
    // The link itself is demonstrably alive: a frame arrived just now.
    expect(text(container)).toContain('Last reading received');
    expect(text(container)).toMatch(/Last reading received\s*\d+ ms ago/);
  });
});

describe('pointing the app at an address', () => {
  it('refuses a malformed address without sending anything to a device', () => {
    const { container, getByText } = render(<DeviceScreen />);
    const input = container.querySelector('#device-address-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'not an address' } });
    fireEvent.click(getByText('Connect'));

    expect(openDevice).not.toHaveBeenCalled();
    expect(text(container)).toContain("That isn't an address this app can use");
  });

  it('normalises what was typed and asks the app to remember it', () => {
    const { container, getByText } = render(<DeviceScreen />);
    const input = container.querySelector('#device-address-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '192.168.4.1:8080' } });
    fireEvent.click(getByText('Connect'));

    expect(openDevice).toHaveBeenCalledWith('http://192.168.4.1:8080', { remember: true });
  });

  it('reports a failed connection once, not twice in the same words', async () => {
    // The standing banner at the top of the screen is already showing the
    // fault openDevice just set. Repeating it under the form — same sentence,
    // 300px lower — teaches the reader to skip both.
    connectionFault.value = { kind: 'unreachable' };
    deviceAddress.value = 'http://192.168.4.9';
    const { container, getByText } = render(<DeviceScreen />);
    const input = container.querySelector('#device-address-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '192.168.4.9' } });
    fireEvent.click(getByText('Connect'));
    await Promise.resolve();

    const banners = [...container.querySelectorAll('.banner')];
    expect(banners).toHaveLength(1);
  });

  it('offers nothing to go back to when the page came from the device', () => {
    // On the shipped configuration that button would undo nothing.
    const { queryByText } = render(<DeviceScreen />);
    expect(queryByText('Go back to the device that served this page')).toBeNull();
  });

  it('offers the way back once an address has been chosen', () => {
    deviceAddress.value = 'http://192.168.4.1';
    const { getByText, container } = render(<DeviceScreen />);
    expect(text(container)).toContain('pointed at 192.168.4.1');
    fireEvent.click(getByText('Go back to the device that served this page'));
    expect(openDevice).toHaveBeenCalledWith(SAME_ORIGIN, { remember: true });
  });
});

describe('the fault banner', () => {
  it('names the device and the direction of a version mismatch', () => {
    // Both mismatches have the same symptom and opposite fixes. Telling a
    // customer to update the wrong half costs them an afternoon.
    connectionFault.value = {
      kind: 'protocol',
      info: info({ protocol: PROTOCOL_MAX_SUPPORTED + 1 }),
      fit: 'device-too-new',
    };
    deviceInfo.value = info({ protocol: PROTOCOL_MAX_SUPPORTED + 1 });
    const { container } = render(<DeviceScreen />);
    const body = text(container);

    expect(body).toContain('“LightGuide E5F6” is newer than this copy of the app');
    expect(body).toContain('Reload this page');
    expect(body).toContain('Guiding is switched off');
  });

  it('tells the customer to update the device when the device is the old half', () => {
    connectionFault.value = {
      kind: 'protocol',
      info: info({ protocol: 0, firmware: '0.1.0' }),
      fit: 'device-too-old',
    };
    const { container } = render(<DeviceScreen />);
    const body = text(container);
    expect(body).toContain('older than this copy of the app');
    expect(body).toContain('needs its software updated');
    expect(body).toContain('0.1.0');
  });

  it('quotes the address when there is one, and does not invent one when there is not', () => {
    connectionFault.value = { kind: 'unreachable' };
    deviceAddress.value = 'http://192.168.4.9';
    const { container, rerender } = render(<DeviceScreen />);
    expect(text(container)).toContain('Nothing answered at 192.168.4.9');

    deviceAddress.value = SAME_ORIGIN;
    rerender(<DeviceScreen />);
    expect(text(container)).toContain("The device isn't answering");
  });

  it('does not suggest checking the internet — there is none on the device network', () => {
    connectionFault.value = { kind: 'refused', status: 404 };
    deviceAddress.value = 'http://192.168.4.9';
    const { container } = render(<DeviceScreen />);
    expect(text(container).toLowerCase()).not.toContain('internet');
  });
});

describe('the app bar connection indicator', () => {
  it('names the device once it has said who it is', () => {
    // Three words in the app bar that a simulation cannot produce: the
    // board's own name, beside a dot that is green because it answered.
    deviceInfo.value = info();
    status.value = 'connected';
    const { container } = render(<AppBar />);
    expect(container.querySelector('.conn-label')?.textContent).toBe('LightGuide E5F6');
  });

  it('falls back to the connection state before the device has answered', () => {
    status.value = 'connected';
    const { container } = render(<AppBar />);
    expect(container.querySelector('.conn-label')?.textContent).toBe('Device connected');
  });

  it('is a real control that goes to the device screen', () => {
    // It used to be inert text: the one place the app reported the connection
    // and the one place nothing could be done about it.
    screen.value = 'home';
    const { container } = render(<AppBar />);
    const button = container.querySelector('.conn-btn') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(screen.value).toBe('device');
  });

  it('marks itself as the current page while you are on the device screen', () => {
    screen.value = 'device';
    const { container } = render(<AppBar />);
    expect(container.querySelector('.conn-btn')?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps everything meaningful in its accessible name', () => {
    // The chevron is decorative; the label is not. "Tap the LightGuide E5F6
    // button" has to be a workable instruction.
    deviceInfo.value = info();
    status.value = 'connected';
    const { container } = render(<AppBar />);
    expect(container.querySelector('.conn-go')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.conn-label')?.getAttribute('aria-hidden')).toBeNull();
  });
});
