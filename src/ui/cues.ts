import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { createArrivalState, observeSettled, type ArrivalState } from '../guidance/arrival';

/**
 * Out-of-band channels for the live guidance screen: keeping the screen awake
 * while a target is being placed, and announcing arrival through something
 * other than the screen.
 *
 * The whole file is written to the same rule: **every browser API in here is
 * optional.** Wake Lock, Vibration and Web Audio are each absent on some
 * browser a photographer might realistically open this on (and the ESP32
 * serves the app over plain http, where several of them are simply not
 * exposed). Nothing here may throw, warn, block a render, or degrade the
 * guidance itself when an API is missing or refuses — the screen must stay
 * fully usable, just quieter.
 */

const CUE_PREFERENCE_KEY = 'lightguide.arrival-cues';

function readStoredPreference(): boolean {
  try {
    // Default on: the buzz is the point of the feature, and a photographer who
    // wants silence is far more likely to go looking for a mute control than
    // one who wants feedback is to go looking for an unmute.
    return localStorage.getItem(CUE_PREFERENCE_KEY) !== 'off';
  } catch {
    // Private mode / storage disabled. Not a reason to lose the cue.
    return true;
  }
}

/** Whether arrival cues (buzz + tone) are armed. User-controlled, persisted. */
export const cuesEnabled = signal(readStoredPreference());

export function setCuesEnabled(next: boolean): void {
  cuesEnabled.value = next;
  try {
    localStorage.setItem(CUE_PREFERENCE_KEY, next ? 'on' : 'off');
  } catch {
    // Preference just won't survive a reload. The toggle still works.
  }
}

/* ---------- audio ---------- */

/**
 * Browsers refuse to start audio until the page has had a real user gesture.
 * We therefore watch for the first one and open the AudioContext *inside* that
 * gesture, which is the only construction that reliably lands in the 'running'
 * state on both Chrome and Safari. Installed at module scope rather than from
 * the guidance screen's effect deliberately: the gesture that gets a user onto
 * that screen ("Guide me") happens before it mounts, and a listener installed
 * afterwards would miss it — leaving the very first arrival silent.
 */
let gestureSeen = false;
let toneContext: AudioContext | null = null;

function audioContextConstructor(): typeof AudioContext | null {
  const scope = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export function noteUserGesture(): void {
  if (gestureSeen) return;
  gestureSeen = true;
  const Ctor = audioContextConstructor();
  if (!Ctor) return; // No Web Audio at all: haptics carry the cue alone.
  try {
    toneContext = new Ctor();
  } catch {
    toneContext = null;
  }
}

function installGestureWatch(): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const onGesture = () => {
    noteUserGesture();
    for (const name of events) window.removeEventListener(name, onGesture, true);
  };
  for (const name of events) window.addEventListener(name, onGesture, true);
}

installGestureWatch();

/**
 * A short two-note chime, synthesised. No audio file: the bundle ships from
 * ESP32 flash, where every kilobyte is real.
 *
 * Returns whether a tone was actually started, which is what the guard tests
 * assert on. A suspended context is left alone rather than resumed — outside a
 * gesture handler that call is refused anyway, and fighting it just produces
 * unhandled rejections.
 */
export function playArrivalTone(): boolean {
  const ctx = toneContext;
  if (!gestureSeen || !ctx) return false;
  if (ctx.state !== 'running') return false;
  try {
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // Two rising notes: reads as "done" rather than as a warning, and carries
    // across a room better than a single blip.
    osc.frequency.setValueAtTime(784, start);
    osc.frequency.setValueAtTime(1175, start + 0.1);
    // Ramp the envelope rather than switching it — a square edge on the gain
    // is an audible click at any volume.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.015);
    gain.gain.setValueAtTime(0.25, start + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.28);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Already torn down.
      }
    };
    return true;
  } catch {
    return false;
  }
}

/* ---------- haptics ---------- */

/** Short–short–long: distinct from any incoming-notification pattern. */
export const ARRIVAL_VIBRATION = [55, 40, 90];

export function vibrateArrival(): boolean {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  // iOS Safari has no Vibration API at all; some browsers expose it and then
  // refuse without engagement. Both are silent no-ops here.
  if (!nav || typeof nav.vibrate !== 'function') return false;
  try {
    return nav.vibrate(ARRIVAL_VIBRATION);
  } catch {
    return false;
  }
}

/** Fires both channels, subject to the user's mute preference. */
export function signalArrival(): void {
  if (!cuesEnabled.value) return;
  vibrateArrival();
  playArrivalTone();
}

/* ---------- hooks ---------- */

/**
 * Fires the arrival cue on the not-settled -> settled edge, and only there.
 *
 * Two independent guards, because the failure they prevent is the same one
 * twice over: the effect's dependency list keeps it from re-running on the
 * 500 ms heartbeat re-render, and `observeSettled` keeps a re-run from firing
 * anyway. The pure helper is the one that also refuses to fire on mount.
 */
export function useArrivalCue(settled: boolean): void {
  const tracker = useRef<ArrivalState>(createArrivalState());
  useEffect(() => {
    const step = observeSettled(tracker.current, settled);
    tracker.current = step.state;
    if (step.arrived) signalArrival();
  }, [settled]);
}

/**
 * Holds a screen wake lock for as long as the caller is mounted.
 *
 * The loop this serves is: read the phone, walk to the stand, adjust it with
 * both hands, walk back. The adjusting step routinely outlasts the auto-lock
 * timeout, and waking the phone again needs a free hand. So the lock is held
 * for the whole of the guidance screen and released the moment it unmounts —
 * never longer, since a wake lock nobody asked for is a flat battery.
 *
 * Re-acquisition on visibilitychange is mandatory, not defensive: the browser
 * drops the lock whenever the page is hidden and does not give it back. Coming
 * back from the lock screen or another tab would otherwise leave the screen
 * sleeping again for the rest of the session.
 */
export function useWakeLock(): void {
  useEffect(() => {
    const lock: WakeLock | undefined =
      typeof navigator === 'undefined' ? undefined : navigator.wakeLock;
    if (!lock || typeof lock.request !== 'function') return; // Unsupported: nothing to do.

    let disposed = false;
    let held: WakeLockSentinel | null = null;
    let requesting = false;

    const acquire = async (): Promise<void> => {
      if (disposed || held || requesting) return;
      // Requesting while hidden is guaranteed to reject; don't bother.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      requesting = true;
      try {
        const sentinel = await lock.request('screen');
        if (disposed) {
          void Promise.resolve(sentinel.release()).catch(() => {});
          return;
        }
        held = sentinel;
        // The browser can drop the lock on its own (page hidden, low battery).
        // Clearing our handle is what lets the visibility handler re-acquire.
        sentinel.addEventListener?.('release', () => {
          if (held === sentinel) held = null;
        });
      } catch {
        // Unsupported, denied, insecure context, or the page went hidden
        // mid-request. Silent by design: the screen simply behaves as it
        // always did, and guidance is unaffected.
      } finally {
        requesting = false;
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const sentinel = held;
      held = null;
      if (sentinel) void Promise.resolve(sentinel.release()).catch(() => {});
    };
  }, []);
}
