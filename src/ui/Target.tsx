import type { ChannelState, Verdict } from '../contract/types';

interface Props {
  verdict: Verdict;
  distanceTolCm: number;
  brightnessTol: number;
  /**
   * Whether this setup has a light target at all (Setup.brightness_above_ambient !== null).
   * `verdict.brightness_state` alone can't distinguish "distance-only setup, nothing to
   * verify" from "this setup guides on light, but the sensor reading dropped out" — both
   * report 'unknown'. Those two cases must render differently (green/solid vs neutral/
   * hollow), so the caller has to tell us which one we're in. Don't remove this prop in
   * favour of inferring it from brightness_state — the information genuinely isn't there.
   */
  guidingOnLight: boolean;
}

/** Clamp an axis delta to -1..1 of the plot, where +/-1 is four tolerances out. */
function axisFraction(delta: number | null, tol: number): number | null {
  if (delta === null) return null;
  const scaled = delta / (tol * 4);
  return Math.max(-1, Math.min(1, scaled));
}

const NEUTRAL_TINT = 'rgba(148,163,184,.10)';

function surroundColour(distance: ChannelState, brightness: ChannelState, guidingOnLight: boolean): string {
  if (distance === 'unknown') return NEUTRAL_TINT;
  // A dropped-out light sensor on a setup that guides on light is unverified, not settled —
  // give it the same neutral treatment as an unknown distance. Distance-only setups are
  // exempt: they have no light target, so brightness_state is permanently 'unknown' there
  // and that's expected, not a dropout.
  if (guidingOnLight && brightness === 'unknown') return NEUTRAL_TINT;
  const settled = distance === 'in_band' && (brightness === 'in_band' || !guidingOnLight);
  return settled ? 'rgba(34,197,94,.14)' : 'rgba(245,158,11,.12)';
}

// Dot geometry: the rendered dot's visible extent is its own box plus the halo ring around
// it. Keep that whole footprint inside the plot (rather than clamping only the centre) so
// nothing sits outside the container at full deflection.
const DOT_SIZE = 18;
const DOT_RADIUS = DOT_SIZE / 2;
const HALO_WIDTH = 6;
const DOT_INSET = DOT_RADIUS + HALO_WIDTH;

function clampToPlot(px: number, size: number, inset: number): number {
  return Math.max(inset, Math.min(size - inset, px));
}

export function TargetView({ verdict, distanceTolCm, brightnessTol, guidingOnLight }: Props) {
  const SIZE = 240;
  const half = SIZE / 2;

  const dx = axisFraction(verdict.distance_delta_cm, distanceTolCm);
  // Brightness axis is inverted: brighter is up, and positive delta means brighter.
  const dy = axisFraction(verdict.brightness_delta, brightnessTol);

  const bandPx = (SIZE / 2) * 0.25; // one tolerance = a quarter of the half-width
  const dotX = clampToPlot(half + (dx ?? 0) * half, SIZE, DOT_INSET);
  const dotY = clampToPlot(half - (dy ?? 0) * half, SIZE, DOT_INSET);
  const known = dx !== null;
  // Position is known (distance reading present) but the light channel is unverified on a
  // setup that's supposed to be guiding on light — draw the dot hollow, not solid.
  const lightUnverified = guidingOnLight && verdict.brightness_state === 'unknown';

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>BRIGHTER</div>
      <div
        style={{
          position: 'relative', width: SIZE, height: SIZE, margin: '6px auto',
          borderRadius: 14, overflow: 'hidden',
          background: surroundColour(verdict.distance_state, verdict.brightness_state, guidingOnLight),
          transition: 'background .3s',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, border: '1px solid var(--line)', borderRadius: 14 }} />
        <div
          style={{
            position: 'absolute', left: half - bandPx, top: half - bandPx,
            width: bandPx * 2, height: bandPx * 2,
            border: '2px solid var(--ok)', borderRadius: 8, background: 'rgba(34,197,94,.10)',
          }}
        />
        <div style={{ position: 'absolute', left: half, top: 0, bottom: 0, width: 1, background: 'var(--line)' }} />
        <div style={{ position: 'absolute', top: half, left: 0, right: 0, height: 1, background: 'var(--line)' }} />
        {known ? (
          lightUnverified ? (
            <div
              style={{
                position: 'absolute', left: dotX - DOT_RADIUS, top: dotY - DOT_RADIUS,
                width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
                background: 'transparent', border: '2px solid var(--dim)',
                transition: 'left .12s linear, top .12s linear',
              }}
            />
          ) : (
            <div
              style={{
                position: 'absolute', left: dotX - DOT_RADIUS, top: dotY - DOT_RADIUS,
                width: DOT_SIZE, height: DOT_SIZE,
                borderRadius: '50%',
                background: verdict.distance_state === 'in_band' ? 'var(--ok)' : 'var(--warn)',
                boxShadow: `0 0 0 ${HALO_WIDTH}px ${verdict.distance_state === 'in_band'
                  ? 'rgba(34,197,94,.22)' : 'rgba(245,158,11,.22)'}`,
                transition: 'left .12s linear, top .12s linear',
              }}
            />
          )
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', fontSize: 13,
          }}>
            no reading
          </div>
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        width: SIZE, margin: '0 auto', fontSize: 10,
        letterSpacing: '.1em', color: 'var(--muted)',
      }}>
        <span>CLOSER</span><span>FURTHER</span>
      </div>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)', marginTop: 4 }}>DIMMER</div>
    </div>
  );
}
