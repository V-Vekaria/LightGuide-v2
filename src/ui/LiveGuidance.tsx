import { TargetView } from './Target';
import { verdict as computeVerdict } from '../guidance/verdict';
import { isFeedStale, shouldSuppressGuidance, STALE_AFTER_MS } from '../guidance/liveness';
import { activeTarget, lastGoodAt, reading, status, stopGuiding, tick } from '../store/store';

export function LiveGuidance() {
  // Read (and discard) the heartbeat so this component re-renders every 500ms
  // while mounted, even when no new frame arrives. Staleness below depends on
  // elapsed wall-clock time, and signals only re-render on a write — nothing
  // else here writes a signal when time merely passes. Do not delete this as
  // "unused": removing it silently breaks the staleness gate (see store.ts).
  void tick.value;

  const target = activeTarget.value;
  const live = reading.value;
  if (!target) return null;

  const stale = isFeedStale(lastGoodAt.value, Date.now(), STALE_AFTER_MS);
  const disconnected = status.value !== 'connected';
  const suppressed = shouldSuppressGuidance(status.value, stale);

  // A stale reading is never rendered as live: fall back to an all-unknown verdict.
  const blank = { distance_cm: null, brightness: null, ambient: null, seq: 0, ts: 0 };
  const v = computeVerdict(suppressed ? blank : live ?? blank, target);
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
        {suppressed && (
          <div class="stale-banner">
            {disconnected ? 'Device disconnected' : 'No usable reading'} — showing no guidance rather
            than a stale one.
            {lastGoodAt.value && (
              <> Last good reading {Math.round((Date.now() - lastGoodAt.value) / 1000)}s ago.</>
            )}
          </div>
        )}

        <div style={{ opacity: suppressed ? 0.4 : 1, transition: 'opacity .2s' }}>
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
              && v.brightness_state !== 'under'
              && !(guidingOnLight && v.brightness_state === 'unknown') ? 'var(--ok)' : 'var(--warn)',
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
