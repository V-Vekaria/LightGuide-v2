import type { ChannelState, Verdict } from '../contract/types';

interface Props {
  verdict: Verdict;
  distanceTolCm: number;
  brightnessTol: number;
}

/** Clamp an axis delta to -1..1 of the plot, where +/-1 is four tolerances out. */
function axisFraction(delta: number | null, tol: number): number | null {
  if (delta === null) return null;
  const scaled = delta / (tol * 4);
  return Math.max(-1, Math.min(1, scaled));
}

function surroundColour(distance: ChannelState, brightness: ChannelState): string {
  if (distance === 'unknown') return 'rgba(148,163,184,.10)';
  const settled = distance === 'in_band' && (brightness === 'in_band' || brightness === 'unknown');
  return settled ? 'rgba(34,197,94,.14)' : 'rgba(245,158,11,.12)';
}

export function TargetView({ verdict, distanceTolCm, brightnessTol }: Props) {
  const SIZE = 240;
  const half = SIZE / 2;

  const dx = axisFraction(verdict.distance_delta_cm, distanceTolCm);
  // Brightness axis is inverted: brighter is up, and positive delta means brighter.
  const dy = axisFraction(verdict.brightness_delta, brightnessTol);

  const bandPx = (SIZE / 2) * 0.25; // one tolerance = a quarter of the half-width
  const dotX = half + (dx ?? 0) * half;
  const dotY = half - (dy ?? 0) * half;
  const known = dx !== null;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>BRIGHTER</div>
      <div
        style={{
          position: 'relative', width: SIZE, height: SIZE, margin: '6px auto',
          borderRadius: 14, background: surroundColour(verdict.distance_state, verdict.brightness_state),
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
          <div
            style={{
              position: 'absolute', left: dotX - 9, top: dotY - 9, width: 18, height: 18,
              borderRadius: '50%',
              background: verdict.distance_state === 'in_band' ? 'var(--ok)' : 'var(--warn)',
              boxShadow: `0 0 0 6px ${verdict.distance_state === 'in_band'
                ? 'rgba(34,197,94,.22)' : 'rgba(245,158,11,.22)'}`,
              transition: 'left .12s linear, top .12s linear',
            }}
          />
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
