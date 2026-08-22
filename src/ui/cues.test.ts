import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  ARRIVAL_VIBRATION,
  cuesEnabled,
  noteUserGesture,
  playArrivalTone,
  setCuesEnabled,
  signalArrival,
  vibrateArrival,
} from './cues';

/**
 * Guard-and-fallback coverage only. What matters is that a browser missing
 * Vibration or Web Audio still gets a working guidance screen: every one of
 * these paths has to return quietly rather than throw.
 */

interface FakeAudio {
  constructed: number;
  started: number;
  resumed: number;
  state: 'running' | 'suspended';
}

/** Minimal stand-in for Web Audio — just enough surface for the arrival chime. */
function stubFakeAudio(): { fake: FakeAudio } {
  const fake: FakeAudio = { constructed: 0, started: 0, resumed: 0, state: 'running' };
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    constructor() {
      fake.constructed += 1;
    }
    get state() {
      return fake.state;
    }
    resume() {
      fake.resumed += 1;
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {} },
        connect() {},
        disconnect() {},
        start() {
          fake.started += 1;
        },
        stop() {},
        onended: null,
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { fake };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCuesEnabled(true);
});

describe('vibrateArrival', () => {
  it('returns false and does not throw when the Vibration API is absent', () => {
    vi.stubGlobal('navigator', {});
    expect(() => vibrateArrival()).not.toThrow();
    expect(vibrateArrival()).toBe(false);
  });

  it('sends the arrival pattern when the API is present', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    expect(vibrateArrival()).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(ARRIVAL_VIBRATION);
  });

  it('reports failure without throwing when the browser refuses', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('vibration blocked without user engagement');
      },
    });
    expect(vibrateArrival()).toBe(false);
  });

  it('reports failure when the browser returns false', () => {
    vi.stubGlobal('navigator', { vibrate: () => false });
    expect(vibrateArrival()).toBe(false);
  });
});

describe('playArrivalTone', () => {
  it('does not attempt playback before a user gesture has happened', () => {
    // Web Audio is available here, and still nothing may be started: browsers
    // block playback until the page has been interacted with, and no gesture
    // has been dispatched in this module instance.
    const { fake } = stubFakeAudio();
    expect(playArrivalTone()).toBe(false);
    expect(fake.constructed).toBe(0);
  });

  it('does not throw when Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playArrivalTone()).not.toThrow();
    expect(playArrivalTone()).toBe(false);
  });
});

describe('signalArrival', () => {
  it('fires the haptic channel when cues are enabled', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    setCuesEnabled(true);
    signalArrival();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('fires nothing at all when the user has muted cues', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    setCuesEnabled(false);
    signalArrival();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('survives a browser with neither vibration nor audio', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('AudioContext', undefined);
    expect(() => signalArrival()).not.toThrow();
  });
});

describe('setCuesEnabled', () => {
  it('defaults to on so haptics work without being switched on first', () => {
    expect(cuesEnabled.value).toBe(true);
  });

  it('drives the signal both ways', () => {
    setCuesEnabled(false);
    expect(cuesEnabled.value).toBe(false);
    setCuesEnabled(true);
    expect(cuesEnabled.value).toBe(true);
  });

  it('still toggles when persistence is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    });
    expect(() => setCuesEnabled(false)).not.toThrow();
    expect(cuesEnabled.value).toBe(false);
  });
});

// Declared last on purpose. noteUserGesture() is a one-way latch for the life
// of the module, so every assertion about the pre-gesture behaviour above has
// to have run before this point.
describe('playArrivalTone after a user gesture', () => {
  it('opens the context in the gesture, plays, then leaves a suspended one alone', () => {
    const { fake } = stubFakeAudio();

    noteUserGesture();
    expect(fake.constructed).toBe(1);

    expect(playArrivalTone()).toBe(true);
    expect(fake.started).toBe(1);

    // The browser suspended us (page hidden, OS policy). resume() outside a
    // gesture handler is refused anyway, so the tone is skipped, not forced.
    fake.state = 'suspended';
    expect(playArrivalTone()).toBe(false);
    expect(fake.started).toBe(1);
    expect(fake.resumed).toBe(0);
  });
});
