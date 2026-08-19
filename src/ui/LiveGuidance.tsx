import { TargetView } from './Target';
import { verdict as computeVerdict } from '../guidance/verdict';
import { isFeedStale, shouldSuppressGuidance, STALE_AFTER_MS } from '../guidance/liveness';
import {
  activeSetupId,
  activeTarget,
  createSetup,
  lastGoodAt,
  leaveGuidanceScreen,
  reading,
  setups,
  status,
  stopGuiding,
  tick,
} from '../store/store';

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

  const settled =
    v.distance_state === 'in_band' &&
    v.brightness_state !== 'over' &&
    v.brightness_state !== 'under' &&
    !(guidingOnLight && v.brightness_state === 'unknown');

  const named = setups.value.find((setup) => setup.id === activeSetupId.value);

  // Live readouts follow the same rule as the target: suppressed means no number.
  const shownDistance = suppressed ? null : (live?.distance_cm ?? null);
  const shownLight =
    suppressed || !live || live.brightness === null || live.ambient === null
      ? null
      : live.brightness - live.ambient;

  return (
    <>
      <div class="wrap" style={{ display: 'flex', flexDirection: 'column' }}>
        <div class="guide-head">
          <div>
            <div class="guide-name">{named ? named.name : 'Quick guide'}</div>
            <div class="guide-target">
              Target {target.distance_cm} cm ±{target.distance_tol_cm}
              {guidingOnLight
                ? ` · light ${target.brightness_above_ambient} ±${target.brightness_tol}`
                : ' · distance only'}
            </div>
          </div>
          <div class="guide-readouts">
            <div>
              <div class="readout-label">Distance</div>
              <div
                class="readout-value"
                style={{ color: v.distance_state === 'in_band' ? 'var(--ok)' : undefined }}
              >
                {shownDistance === null ? (
                  <span style={{ color: 'var(--faint)' }}>—</span>
                ) : (
                  <>
                    {shownDistance.toFixed(1)}
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 3 }}>cm</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <div class="readout-label">Light</div>
              <div
                class="readout-value"
                style={{ color: v.brightness_state === 'in_band' ? 'var(--ok)' : undefined }}
              >
                {shownLight === null ? (
                  <span style={{ color: 'var(--faint)' }}>—</span>
                ) : (
                  shownLight.toFixed(3)
                )}
              </div>
            </div>
          </div>
        </div>

        {suppressed && (
          <div class="stale-banner">
            {disconnected ? 'Device disconnected' : 'No usable reading'} — showing no guidance rather
            than a stale one.
            {lastGoodAt.value && (
              <> Last good reading {Math.round((Date.now() - lastGoodAt.value) / 1000)}s ago.</>
            )}
          </div>
        )}

        <div class="guide-stage" style={{ opacity: suppressed ? 0.4 : 1, transition: 'opacity .2s' }}>
          <TargetView
            verdict={v}
            distanceTolCm={target.distance_tol_cm}
            brightnessTol={target.brightness_tol}
            guidingOnLight={guidingOnLight}
          />
        </div>

        <div class="guide-foot">
          <div>
            <div class={`instruction ${settled ? 'is-ok' : 'is-warn'}`}>{v.instruction}</div>
            {v.distance_delta_cm !== null && (
              <div class="instruction-sub">
                distance {v.distance_delta_cm > 0 ? '+' : ''}
                {v.distance_delta_cm} cm
                {v.brightness_delta !== null && (
                  <>
                    {' · '}light {v.brightness_delta > 0 ? '+' : ''}
                    {v.brightness_delta}
                  </>
                )}
              </div>
            )}
          </div>
          <div class="actions">
            {/* A quick guide has no setup behind it. Offer to keep a good
                ad-hoc result in one tap rather than making the user retype it
                into New setup — the spec's promised save-after-quick-guide. */}
            {!named && (
              <button class="btn btn-ghost" onClick={() => createSetup(target.distance_cm)}>
                Save as setup
              </button>
            )}
            <button class="btn btn-ghost" onClick={leaveGuidanceScreen}>
              Setups
            </button>
            <button class="btn" onClick={() => void stopGuiding()}>
              Stop guiding
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
