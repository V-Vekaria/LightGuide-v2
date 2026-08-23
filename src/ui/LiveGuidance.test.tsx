import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/preact';
import type { Reading, Target } from '../contract/types';
import { GuidanceSession, LiveGuidance } from './LiveGuidance';
import { cuesEnabled } from './cues';
import {
  activeSetupId,
  activeTarget,
  lastGoodAt,
  lastGoodLightAt,
  screen,
  setups,
  stableFiltered,
  stableReading,
  stableTarget,
  status,
  tick,
} from '../store/store';

/**
 * The guidance screen, rendered.
 *
 * Everything here is about the seam the unit tests cannot reach: `settled` is
 * assembled from three separate signals and then drives a physical buzz that a
 * photographer, two metres away with both hands on a light stand, will act on
 * without looking at the phone. A wrong buzz sends them to a stand that is in
 * the wrong place, and nothing on screen ever tells them so.
 *
 * The store pipeline (frames in, stabilised readings out) is covered in
 * store.test.ts. These tests drive the store's signals directly and assert on
 * what actually reaches the DOM, which is the part nothing else exercises.
 */

const STALE_MS = 5000; // comfortably past STALE_AFTER_MS

function target(overrides: Partial<Target> = {}): Target {
  return {
    distance_cm: 50,
    distance_tol_cm: 5,
    brightness_above_ambient: null,
    brightness_tol: 0.08,
    ...overrides,
  };
}

function frame(overrides: Partial<Reading> = {}): Reading {
  return { distance_cm: 52, brightness: 0.5, ambient: 0.1, seq: 1, ts: 0, ...overrides };
}

/**
 * Puts the store in a given live state. Axis freshness is expressed as "is
 * this axis live right now", which is the thing under test, rather than as a
 * timestamp the reader would have to do arithmetic on.
 */
function setFeed(opts: {
  reading?: Reading | null;
  distanceLive?: boolean;
  lightLive?: boolean;
  filtered?: boolean;
}): void {
  const now = Date.now();
  status.value = 'connected';
  stableReading.value = opts.reading === undefined ? frame() : opts.reading;
  lastGoodAt.value = (opts.distanceLive ?? true) ? now : now - STALE_MS;
  lastGoodLightAt.value = (opts.lightLive ?? true) ? now : now - STALE_MS;
  stableFiltered.value = opts.filtered ?? true;
  // Nothing latched in-band, so the widened target is the plain one.
  stableTarget.value = activeTarget.value;
  // The heartbeat every staleness-dependent view subscribes to.
  tick.value += 1;
}

/** The two big readouts in the guide header, in order: distance, then light. */
function readouts(container: Element): string[] {
  return [...container.querySelectorAll('.readout-value')].map((el) =>
    (el.textContent ?? '').trim(),
  );
}

function banner(container: Element): string {
  return (container.querySelector('.stale-banner')?.textContent ?? '').trim();
}

describe('LiveGuidance', () => {
  beforeEach(() => {
    activeTarget.value = target();
    activeSetupId.value = null;
    setups.value = [];
    screen.value = 'live';
    setFeed({});
  });

  afterEach(() => {
    cleanup();
    activeTarget.value = null;
    stableReading.value = null;
    stableTarget.value = null;
    stableFiltered.value = false;
    status.value = 'disconnected';
    vi.unstubAllGlobals();
  });

  it('renders nothing at all when there is no active target', () => {
    activeTarget.value = null;
    const { container } = render(<LiveGuidance />);
    expect(container.textContent).toBe('');
  });

  describe('a suppressed feed shows no guidance rather than a stale one', () => {
    it('withholds both readouts and says so when every axis is stale', () => {
      setFeed({ distanceLive: false, lightLive: false });
      const { container } = render(<LiveGuidance />);

      expect(readouts(container)).toEqual(['—', '—']);
      expect(banner(container)).toContain(
        'No usable reading — showing no guidance rather than a stale one.',
      );
      // Not "Move 2 cm closer" against a two-second-old frame: the instruction
      // has to admit it has nothing.
      expect(container.querySelector('.instruction')?.textContent).toBe(
        'Waiting for a clear reading',
      );
      expect(container.querySelector('.target-empty')?.textContent).toBe('no reading');
    });

    it('withholds both readouts when the device is gone, however fresh the stamps', () => {
      setFeed({});
      status.value = 'disconnected';
      const { container } = render(<LiveGuidance />);

      expect(readouts(container)).toEqual(['—', '—']);
      expect(banner(container)).toContain('Device disconnected');
    });

    it('never shows an in-band tick while suppressed', () => {
      // The stand may well be exactly on target. We do not know that, and
      // saying so is the single worst thing this screen can do.
      setFeed({ reading: frame({ distance_cm: 50 }), distanceLive: false, lightLive: false });
      const { container } = render(<LiveGuidance />);

      expect(container.querySelector('.readout-value.is-in-band')).toBeNull();
    });
  });

  describe('a dropout on one axis leaves the other working', () => {
    it('greys distance and keeps the light readout live', () => {
      setFeed({ distanceLive: false, lightLive: true });
      const { container } = render(<LiveGuidance />);

      const [distance, light] = readouts(container);
      expect(distance).toBe('—');
      // brightness - ambient, still being reported by a photodiode that is
      // working perfectly while the ultrasonic misses a soft backdrop.
      expect(light).toBe('0.400');
      expect(banner(container)).toContain('No distance reading — the light readout is still live.');
    });

    it('greys light and keeps the distance readout live', () => {
      activeTarget.value = target({ brightness_above_ambient: 0.4 });
      setFeed({ distanceLive: true, lightLive: false });
      const { container } = render(<LiveGuidance />);

      const [distance, light] = readouts(container);
      expect(distance).toContain('52.0');
      expect(light).toBe('—');
      expect(banner(container)).toContain('No light reading — distance guidance is still live.');
    });

    it('shows no banner at all when both axes are live', () => {
      setFeed({ distanceLive: true, lightLive: true });
      const { container } = render(<LiveGuidance />);

      expect(container.querySelector('.stale-banner')).toBeNull();
      expect(readouts(container)[0]).toContain('52.0');
    });
  });
});

/**
 * The arrival cue and the wake lock, which live in `GuidanceSession` — mounted
 * by App for the whole life of the app and scoped to `activeTarget`, not to
 * the live screen being on display.
 */
describe('GuidanceSession', () => {
  let vibrate: ReturnType<typeof vi.fn>;
  let requestWakeLock: ReturnType<typeof vi.fn>;
  let releaseWakeLock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrate = vi.fn(() => true);
    releaseWakeLock = vi.fn(async () => {});
    requestWakeLock = vi.fn(async () => ({
      release: releaseWakeLock,
      addEventListener: () => {},
    }));
    vi.stubGlobal('navigator', { vibrate, wakeLock: { request: requestWakeLock } });

    cuesEnabled.value = true;
    activeTarget.value = target();
    activeSetupId.value = null;
    setups.value = [];
    screen.value = 'live';
  });

  afterEach(() => {
    cleanup();
    activeTarget.value = null;
    stableReading.value = null;
    stableTarget.value = null;
    stableFiltered.value = false;
    status.value = 'disconnected';
    vi.unstubAllGlobals();
  });

  /** Applies a feed state and lets the signal-driven re-render and its effects run. */
  async function step(opts: Parameters<typeof setFeed>[0]): Promise<void> {
    await act(async () => {
      setFeed(opts);
    });
  }

  it('fires exactly once on the not-settled -> settled edge', async () => {
    // Out of band first, so there is a real crossing to detect.
    await step({ reading: frame({ distance_cm: 80 }) });
    render(<GuidanceSession />);
    await step({ reading: frame({ distance_cm: 80 }) });
    expect(vibrate).not.toHaveBeenCalled();

    // Walked into tolerance.
    await step({ reading: frame({ distance_cm: 50 }) });
    expect(vibrate).toHaveBeenCalledTimes(1);

    // Standing there. The screen re-renders about twice a second on the
    // heartbeat; none of those is a second arrival.
    await step({ reading: frame({ distance_cm: 50, seq: 2 }) });
    await step({ reading: frame({ distance_cm: 51, seq: 3 }) });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('re-arms after drifting back out of tolerance', async () => {
    await step({ reading: frame({ distance_cm: 80 }) });
    render(<GuidanceSession />);
    await step({ reading: frame({ distance_cm: 50 }) });
    expect(vibrate).toHaveBeenCalledTimes(1);

    await step({ reading: frame({ distance_cm: 80 }) });
    await step({ reading: frame({ distance_cm: 50 }) });
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('stays silent when the session opens onto an already-settled stand', async () => {
    // Nobody walked anywhere — the first observation is never an arrival.
    await step({ reading: frame({ distance_cm: 50 }) });
    render(<GuidanceSession />);
    await step({ reading: frame({ distance_cm: 50, seq: 2 }) });

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does not fire on a reading the smoothing window has not yet filtered', async () => {
    // Dead on target, but one frame after a reset: the window holds a single
    // sample and the median has rejected nothing.
    await step({ reading: frame({ distance_cm: 80 }) });
    render(<GuidanceSession />);
    await step({ reading: frame({ distance_cm: 50 }), filtered: false });
    expect(vibrate).not.toHaveBeenCalled();

    // Once the window has a majority behind it, the arrival is real.
    await step({ reading: frame({ distance_cm: 50, seq: 2 }), filtered: true });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a suppressed axis, whatever the last frame said', async () => {
    await step({ reading: frame({ distance_cm: 80 }) });
    render(<GuidanceSession />);
    await step({ reading: frame({ distance_cm: 50 }), distanceLive: false });

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('honours the mute toggle', async () => {
    cuesEnabled.value = false;
    await step({ reading: frame({ distance_cm: 80 }) });
    render(<GuidanceSession />);
    await step({ reading: frame({ distance_cm: 50 }) });

    expect(vibrate).not.toHaveBeenCalled();
  });

  /**
   * Finding 2, stated as a test. The app bar chip says in as many words that
   * guidance continues after you leave the live screen. Before this, leaving
   * unmounted the component holding the cue and the wake lock, so the
   * photographer walked to the stand, arrived on target, and got nothing —
   * the exact case the cue exists for — on a phone that had also gone to sleep.
   */
  describe('surviving a walk away from the live screen', () => {
    /** What App renders: the session outside the screen switch, not inside it. */
    function Harness() {
      return (
        <>
          <GuidanceSession />
          {screen.value === 'live' ? <LiveGuidance /> : null}
        </>
      );
    }

    it('still buzzes on arrival after the live screen has been left', async () => {
      await step({ reading: frame({ distance_cm: 80 }) });
      const { container } = render(<Harness />);
      // The live screen is up and rendering guidance.
      expect(container.querySelector('.guide-head')).not.toBeNull();

      // "Setups" — leaves the live screen without stopping guidance.
      await act(async () => {
        screen.value = 'home';
      });
      expect(container.querySelector('.guide-head')).toBeNull();

      // Walks to the stand, both hands on it, and arrives.
      await step({ reading: frame({ distance_cm: 50 }) });
      expect(vibrate).toHaveBeenCalledTimes(1);
    });

    it('holds the wake lock across the screen change and releases it on stop', async () => {
      await step({ reading: frame({ distance_cm: 80 }) });
      render(<Harness />);
      expect(requestWakeLock).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.value = 'home';
      });
      // Walking back to a slept phone needs a free hand, and both are on the
      // stand. The lock is scoped to the session, not to the screen.
      expect(releaseWakeLock).not.toHaveBeenCalled();

      // Stopping guidance is what ends it — a wake lock nobody asked for is a
      // flat battery.
      await act(async () => {
        activeTarget.value = null;
      });
      expect(releaseWakeLock).toHaveBeenCalledTimes(1);
    });

    it('does not re-fire when the user returns to an already-settled screen', async () => {
      await step({ reading: frame({ distance_cm: 80 }) });
      render(<Harness />);
      await step({ reading: frame({ distance_cm: 50 }) });
      expect(vibrate).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.value = 'home';
      });
      await act(async () => {
        screen.value = 'live';
      });
      await step({ reading: frame({ distance_cm: 50, seq: 9 }) });

      // The session never unmounted, so it knows nothing changed.
      expect(vibrate).toHaveBeenCalledTimes(1);
    });
  });
});
