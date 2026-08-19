import { TargetView } from './Target';
import { verdict as computeVerdict } from '../guidance/verdict';
import { activeTarget, lastGoodAt, reading, status, stopGuiding } from '../store/store';

const STALE_AFTER_MS = 2000;

export function LiveGuidance() {
  const target = activeTarget.value;
  const live = reading.value;
  if (!target) return null;

  const stale = lastGoodAt.value === null || Date.now() - lastGoodAt.value > STALE_AFTER_MS;
  const disconnected = status.value !== 'connected';

  // A stale reading is never rendered as live: fall back to an all-unknown verdict.
  const blank = { distance_cm: null, brightness: null, ambient: null, seq: 0, ts: 0 };
  const v = computeVerdict(stale || disconnected ? blank : live ?? blank, target);
  // Tells TargetView whether an 'unknown' brightness channel means "nothing to verify"
  // (distance-only setup) or "sensor dropped out on a setup that guides on light" —
  // those two must render differently, and only the target can distinguish them.
  const guidingOnLight = target.brightness_above_ambient !== null;

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">Guiding</div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          <span class={`status-dot status-${status.value}`} />
          {target.distance_cm} cm target
        </span>
      </div>

      <div class="screen-body">
        {(stale || disconnected) && (
          <div class="stale-banner">
            {disconnected ? 'Device disconnected' : 'No usable reading'} — showing no guidance rather
            than a stale one.
            {lastGoodAt.value && (
              <> Last good reading {Math.round((Date.now() - lastGoodAt.value) / 1000)}s ago.</>
            )}
          </div>
        )}

        <div style={{ opacity: stale || disconnected ? 0.4 : 1, transition: 'opacity .2s' }}>
          <TargetView
            verdict={v}
            distanceTolCm={target.distance_tol_cm}
            brightnessTol={target.brightness_tol}
            guidingOnLight={guidingOnLight}
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <div style={{
            fontSize: 24, fontWeight: 700,
            color: v.distance_state === 'in_band' && v.brightness_state !== 'over'
              && v.brightness_state !== 'under' ? 'var(--ok)' : 'var(--warn)',
          }}>
            {v.instruction}
          </div>
          {v.distance_delta_cm !== null && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              distance {v.distance_delta_cm > 0 ? '+' : ''}{v.distance_delta_cm} cm
              {v.brightness_delta !== null && (
                <> · light {v.brightness_delta > 0 ? '+' : ''}{v.brightness_delta}</>
              )}
            </div>
          )}
        </div>
      </div>

      <div class="screen-foot">
        <button class="btn btn-ghost" onClick={() => void stopGuiding()}>Done</button>
      </div>
    </div>
  );
}
