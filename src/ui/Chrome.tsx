import { activeTarget, liveReading, setups, status } from '../store/store';

export function AppBar() {
  return (
    <div class="app-bar">
      <div class="brand">
        <span class="brand-name">LightGuide</span>
        <span class="brand-sub">Studio lighting placement</span>
      </div>
      <div class="conn">
        <span class={`status-dot status-${status.value}`} />
        <span>
          {status.value === 'connected'
            ? 'Device connected'
            : status.value === 'connecting'
              ? 'Connecting…'
              : 'Device disconnected'}
        </span>
      </div>
    </div>
  );
}

/**
 * The live sensor strip. Reads through `liveReading()`, which withholds the
 * frame entirely when the feed is stale or the device is gone — so a tile
 * showing a number is always a number worth trusting. A dash is the honest
 * answer, not a placeholder.
 */
export function LiveStrip() {
  const live = liveReading();
  const target = activeTarget.value;

  const distance = live?.distance_cm ?? null;
  const aboveAmbient =
    live && live.brightness !== null && live.ambient !== null
      ? live.brightness - live.ambient
      : null;

  const distanceDelta =
    distance !== null && target ? Math.round((distance - target.distance_cm) * 10) / 10 : null;

  const lightDelta =
    aboveAmbient !== null && target && target.brightness_above_ambient !== null
      ? aboveAmbient - target.brightness_above_ambient
      : null;

  const lightInBand =
    lightDelta !== null && target ? Math.abs(lightDelta) <= target.brightness_tol : null;

  const distanceInBand =
    distanceDelta !== null && target ? Math.abs(distanceDelta) <= target.distance_tol_cm : null;

  return (
    <div class="live-strip">
      <div class="tile">
        <div class="tile-label">Distance</div>
        <div class="tile-value">
          {distance === null ? <span style={{ color: 'var(--faint)' }}>—</span> : distance.toFixed(1)}
          {distance !== null && <span class="tile-unit">cm</span>}
        </div>
        <div class={`tile-note${distanceInBand === null ? '' : distanceInBand ? ' is-ok' : ' is-warn'}`}>
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
          {live?.ambient == null ? <span style={{ color: 'var(--faint)' }}>—</span> : live.ambient.toFixed(3)}
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
