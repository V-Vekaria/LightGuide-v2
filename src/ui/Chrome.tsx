import { deviceInfo } from '../device/connection';
import {
  activeSetupId,
  activeTarget,
  navigate,
  screen,
  setups,
  stableDistanceReading,
  stableLightReading,
  stableTarget,
  status,
} from '../store/store';

export function AppBar() {
  const guiding = activeTarget.value !== null;
  const elsewhere = screen.value !== 'live';
  const named = setups.value.find((setup) => setup.id === activeSetupId.value);
  const onDeviceScreen = screen.value === 'device';

  // The indicator names the device once it has said who it is. That is the
  // whole demonstration in three words: a real board's own name, in the app
  // bar, next to a dot that is only green because it is answering.
  const identified = deviceInfo.value;
  const connectionLabel =
    status.value === 'connected'
      ? (identified?.name ?? 'Device connected')
      : status.value === 'connecting'
        ? 'Connecting…'
        : 'Device disconnected';

  return (
    <header class="app-bar">
      <button class="brand" onClick={() => navigate('home')} title="Home">
        <span class="brand-name">LightGuide</span>
        <span class="brand-sub">Studio lighting placement</span>
      </button>

      <div class="app-bar-right">
        {/* Leaving the live screen doesn't stop guidance — the device keeps its
            target. This chip is how you get back to it. */}
        {guiding && elsewhere && (
          <button class="guiding-chip" onClick={() => navigate('live')}>
            <span class="status-dot status-connected" aria-hidden="true" />
            <span>Guiding{named ? `: ${named.name}` : ''}</span>
            <span class="guiding-chip-go">Return</span>
          </button>
        )}
        {/* Was inert text: the one place in the app that reported the
            connection, and the one place a photographer could do nothing about
            it. It is a real control now, and it goes through navigate() like
            every other screen change so Back leaves the device screen again.
            aria-current marks it while you are on that screen, which is what
            keeps pressing it repeatedly from being a silent no-op to a screen
            reader. */}
        <button
          class="conn conn-btn"
          title="Device details"
          onClick={() => navigate('device')}
          aria-current={onDeviceScreen ? 'page' : undefined}
        >
          <span class={`status-dot status-${status.value}`} aria-hidden="true" />
          {/* The chevron is the only part that is not read out: it says
              "this goes somewhere" to the eye, and the button's own role
              already says it to a screen reader. Everything visible that
              carries meaning is in the accessible name, which is what keeps
              "tap the LightGuide E5F6 button" a workable instruction. */}
          <span class="conn-label">{connectionLabel}</span>
          <span class="conn-go" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
    </header>
  );
}

/**
 * The live sensor strip.
 *
 * Every tile is read per axis, through an accessor that withholds that axis
 * entirely when it is stale or the device is gone — so a tile showing a number
 * is always a number worth trusting, and a dropout on the ultrasonic no longer
 * blanks a photodiode that is working perfectly. A dash is the honest answer,
 * not a placeholder.
 *
 * It reads the *stabilised* feed and the widened target, which is what the
 * guidance screen classifies against. Reading the raw frame and the unwidened
 * tolerance meant this strip could show "+5.2 from target" in the same second
 * the guidance screen said "On target", with the digits churning at 10 Hz —
 * exactly the flicker guidance/stability.ts exists to remove, reintroduced
 * two components away.
 */
export function LiveStrip() {
  const distanceLive = stableDistanceReading();
  const lightLive = stableLightReading();
  // Shown to the user as the real target; classified against the widened one.
  const target = activeTarget.value;
  const band = stableTarget.value ?? target;

  const distance = distanceLive?.distance_cm ?? null;
  const aboveAmbient =
    lightLive && lightLive.brightness !== null && lightLive.ambient !== null
      ? lightLive.brightness - lightLive.ambient
      : null;

  const distanceDelta =
    distance !== null && target ? Math.round((distance - target.distance_cm) * 10) / 10 : null;

  const lightDelta =
    aboveAmbient !== null && target && target.brightness_above_ambient !== null
      ? aboveAmbient - target.brightness_above_ambient
      : null;

  const lightInBand =
    lightDelta !== null && band ? Math.abs(lightDelta) <= band.brightness_tol : null;

  const distanceInBand =
    distanceDelta !== null && band ? Math.abs(distanceDelta) <= band.distance_tol_cm : null;

  return (
    <div class="live-strip">
      <div class="tile">
        <div class="tile-label">Distance</div>
        <div class="tile-value">
          {distance === null ? <span style={{ color: 'var(--faint)' }}>—</span> : distance.toFixed(1)}
          {distance !== null && <span class="tile-unit">cm</span>}
        </div>
        <div class={`tile-note${distanceInBand === null ? '' : distanceInBand ? ' is-ok' : ' is-warn'}`}>
          {/* "+2.3 from target" is the same sentence whether it is good news or
              bad; green vs amber was the only thing telling them apart. The
              mark carries that difference as a shape instead — aria-hidden, so
              nothing is added to what a screen reader reads out. */}
          {distanceInBand !== null && (
            <span class="note-mark" aria-hidden="true">
              {distanceInBand ? '✓' : '!'}
            </span>
          )}
          {distanceDelta === null
            ? target
              ? 'no reading'
              : 'not guiding'
            : `${distanceDelta > 0 ? '+' : ''}${distanceDelta} from target`}
        </div>
      </div>

      <div class="tile">
        <div class="tile-label">Light above ambient</div>
        <div class="tile-value">
          {aboveAmbient === null ? (
            <span style={{ color: 'var(--faint)' }}>—</span>
          ) : (
            aboveAmbient.toFixed(3)
          )}
        </div>
        <div class={`tile-note${lightInBand === null ? '' : lightInBand ? ' is-ok' : ' is-warn'}`}>
          {lightInBand !== null && (
            <span class="note-mark" aria-hidden="true">
              {lightInBand ? '✓' : '!'}
            </span>
          )}
          {target?.brightness_above_ambient == null
            ? 'no light target'
            : lightDelta === null
              ? 'no reading'
              : `within ±${target.brightness_tol}`}
        </div>
      </div>

      <div class="tile">
        <div class="tile-label">Ambient</div>
        <div class="tile-value" style={{ color: 'var(--muted)' }}>
          {lightLive?.ambient == null ? (
            <span style={{ color: 'var(--faint)' }}>—</span>
          ) : (
            lightLive.ambient.toFixed(3)
          )}
        </div>
        <div class="tile-note">device estimate</div>
      </div>

      <div class="tile">
        <div class="tile-label">Saved setups</div>
        <div class="tile-value">{setups.value.length}</div>
        <div class="tile-note">{target ? 'guiding now' : 'idle'}</div>
      </div>
    </div>
  );
}
