import { TargetView } from './Target';
import type { Reading } from '../contract/types';
import { verdict as computeVerdict } from '../guidance/verdict';
import { shouldSuppressAxis, STALE_AFTER_MS } from '../guidance/liveness';
import {
  activeSetupId,
  activeTarget,
  createSetup,
  lastGoodAt,
  lastGoodLightAt,
  leaveGuidanceScreen,
  setups,
  stableReading,
  stableTarget,
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
  // The stability-filtered reading, not the raw signal: at 10 Hz the raw feed
  // makes the instruction and the dot flicker several times a second. See
  // guidance/stability.ts for what it filters and what it deliberately doesn't.
  const live = stableReading.value;
  if (!target) return null;

  const now = Date.now();
  const disconnected = status.value !== 'connected';
  // Staleness is judged per axis. A missed ultrasonic ping ages out the
  // distance axis only; the light readout keeps working, and vice versa
  // (spec §8). A dead connection still suppresses both — shouldSuppressAxis
  // keeps the connection check, so this can only ever be more granular.
  const distanceDown = shouldSuppressAxis(status.value, lastGoodAt.value, now, STALE_AFTER_MS);
  const lightDown = shouldSuppressAxis(status.value, lastGoodLightAt.value, now, STALE_AFTER_MS);
  const suppressed = distanceDown && lightDown;

  // A stale axis is never rendered as live: it is nulled out independently, so
  // the verdict reports 'unknown' for that channel alone rather than blanking
  // a perfectly good reading on the other one.
  const gated: Reading = {
    distance_cm: distanceDown ? null : live?.distance_cm ?? null,
    brightness: lightDown ? null : live?.brightness ?? null,
    ambient: lightDown ? null : live?.ambient ?? null,
    seq: live?.seq ?? 0,
    ts: live?.ts ?? 0,
  };
  // Classified against the hysteresis-widened target so the in-band boundary
  // doesn't oscillate; the real `target` is what gets displayed below.
  const v = computeVerdict(gated, stableTarget.value ?? target);
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

  // Live readouts follow exactly the same per-axis rule as the target, so a
  // number on screen always agrees with the channel the verdict was built from.
  const shownDistance = gated.distance_cm;
  const shownLight =
    gated.brightness === null || gated.ambient === null ? null : gated.brightness - gated.ambient;

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

        {(distanceDown || lightDown) && (
          <div class="stale-banner">
            {disconnected
              ? 'Device disconnected — showing no guidance rather than a stale one.'
              : suppressed
                ? 'No usable reading — showing no guidance rather than a stale one.'
                : distanceDown
                  ? 'No distance reading — the light readout is still live.'
                  : 'No light reading — distance guidance is still live.'}
            {distanceDown && lastGoodAt.value && (
              <> Last good distance {Math.round((now - lastGoodAt.value) / 1000)}s ago.</>
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
