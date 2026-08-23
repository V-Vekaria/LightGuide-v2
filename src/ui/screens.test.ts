import { describe, it, expect } from 'vitest';
import {
  SCREEN_NAMES,
  resolveHomeState,
  screenTitle,
  showsConnectionBanner,
  showsLiveStrip,
  type HomeInputs,
} from './screens';

/**
 * The home screen decides what a visitor sees, and it decides it from state
 * rather than from a "you have seen this already" flag. These tests pin the
 * two consequences that matter and that a component test would not catch:
 *
 *  - an established user must never be shown the first-run introduction, not
 *    even for the moment before the device answers;
 *  - a newcomer must be shown it, and a disconnected device must not be
 *    reported to them as a fault.
 */

function inputs(overrides: Partial<HomeInputs> = {}): HomeInputs {
  return { status: 'disconnected', setupCount: 0, setupsChecked: true, ...overrides };
}

describe('resolveHomeState', () => {
  it('introduces the product when there is nothing saved and no device', () => {
    expect(resolveHomeState(inputs())).toBe('welcome');
  });

  it('treats connecting as still no device — the introduction is what helps', () => {
    expect(resolveHomeState(inputs({ status: 'connecting' }))).toBe('welcome');
  });

  it('drops the Wi-Fi instructions once the device is actually connected', () => {
    // The connection is proof the network step has already been done. Telling
    // someone how to join a network they are demonstrably on is noise.
    expect(resolveHomeState(inputs({ status: 'connected' }))).toBe('ready');
  });

  it('shows the working home as soon as there is a single saved setup', () => {
    expect(resolveHomeState(inputs({ status: 'connected', setupCount: 1 }))).toBe('working');
  });

  it('keeps the working home when the device is gone but setups are not', () => {
    // Someone with saved setups owns the device and knows what this is. An
    // introduction here would be replacing their list with a sales pitch.
    expect(resolveHomeState(inputs({ status: 'disconnected', setupCount: 4 }))).toBe('working');
  });

  it('claims nothing before the device has answered', () => {
    // The flash this prevents: app opens, setups have not arrived, and an
    // established user is told for 200ms that they are new here.
    expect(resolveHomeState(inputs({ setupsChecked: false }))).toBe('looking');
    expect(resolveHomeState(inputs({ setupsChecked: false, status: 'connected' }))).toBe('looking');
  });

  it('does not wait for the device when setups are already known', () => {
    // Cached setups land before the device answers. They are enough: a list to
    // show is a list to show.
    expect(resolveHomeState(inputs({ setupsChecked: false, setupCount: 2 }))).toBe('working');
  });
});

describe('showsLiveStrip', () => {
  it('withholds the readout strip only while there is nothing at all to read', () => {
    expect(showsLiveStrip('welcome')).toBe(false);
    expect(showsLiveStrip('looking')).toBe(false);
  });

  it('shows it the moment a device or a setup exists', () => {
    expect(showsLiveStrip('ready')).toBe(true);
    expect(showsLiveStrip('working')).toBe(true);
  });
});

describe('showsConnectionBanner', () => {
  it('does not warn a newcomer about the state they are supposed to be in', () => {
    expect(showsConnectionBanner('welcome')).toBe(false);
  });

  it('leaves the warning exactly where it was everywhere else', () => {
    expect(showsConnectionBanner('looking')).toBe(true);
    expect(showsConnectionBanner('ready')).toBe(true);
    expect(showsConnectionBanner('working')).toBe(true);
  });
});

describe('screenTitle', () => {
  it('names the app alone on the home screen', () => {
    // "Home · LightGuide" adds a word and no information.
    expect(screenTitle('home')).toBe('LightGuide');
  });

  it('names the other screens ahead of the app', () => {
    expect(screenTitle('quick')).toBe('Quick guide · LightGuide');
    expect(screenTitle('live')).toBe('Guiding · LightGuide');
  });

  it('tells the two halves of the setup form apart', () => {
    // One screen id, two screens: only the store knows which.
    expect(screenTitle('new', false)).toBe('New setup · LightGuide');
    expect(screenTitle('new', true)).toBe('Edit setup · LightGuide');
  });

  it('names every screen the store can navigate to', () => {
    for (const screen of ['home', 'quick', 'live', 'new'] as const) {
      expect(screenTitle(screen)).toMatch(/LightGuide$/);
    }
    expect(Object.keys(SCREEN_NAMES).sort()).toEqual(['home', 'live', 'quick']);
  });
});
