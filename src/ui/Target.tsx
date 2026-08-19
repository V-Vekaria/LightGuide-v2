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

const NEUTRAL_TINT = 'rgba(107,117,126,.09)';

function surroundColour(distance: ChannelState, brightness: ChannelState, guidingOnLight: boolean): string {
  if (distance === 'unknown') return NEUTRAL_TINT;
  // A dropped-out light sensor on a setup that guides on light is unverified, not settled —
  // give it the same neutral treatment as an unknown distance. Distance-only setups are
  // exempt: they have no light target, so brightness_state is permanently 'unknown' there
  // and that's expected, not a dropout.
  if (guidingOnLight && brightness === 'unknown') return NEUTRAL_TINT;
  const settled = distance === 'in_band' && (brightness === 'in_band' || !guidingOnLight);
  return settled ? 'rgba(31,157,85,.10)' : 'rgba(217,119,6,.10)';
}

// Dot geometry: the rendered dot's visible extent is its own box plus the halo ring around
// it. Keep that whole footprint inside the plot (rather than clamping only the centre) so
// nothing sits outside the container at full deflection. Positions are percentages so the
// plot can scale with the viewport; the CSS clamp mixes px and % to hold the inset at any
// size, and overflow:hidden on the plot is the belt-and-braces backstop.
const DOT_SIZE = 20;
const HALO_WIDTH = 7;
const DOT_INSET = DOT_SIZE / 2 + HALO_WIDTH;

/** One tolerance is a quarter of the half-width, so the in-band box spans 37.5%–62.5%. */
const BAND_INSET_PCT = 37.5;

function axisPosition(fraction: number): string {
  const pct = 50 + fraction * 50;
  return `clamp(${DOT_INSET}px, ${pct}%, calc(100% - ${DOT_INSET}px))`;
}

export function TargetView({ verdict, distanceTolCm, brightnessTol, guidingOnLight }: Props) {
  const dx = axisFraction(verdict.distance_delta_cm, distanceTolCm);
  // Brightness axis is inverted: brighter is up, and positive delta means brighter.
  const dy = axisFraction(verdict.brightness_delta, brightnessTol);

  const known = dx !== null;
  // Position is known (distance reading present) but the light channel is unverified on a
  // setup that's supposed to be guiding on light — draw the dot hollow, not solid.
  const lightUnverified = guidingOnLight && verdict.brightness_state === 'unknown';
  const inBand = verdict.distance_state === 'in_band';

  const dotBase = {
    position: 'absolute' as const,
    left: axisPosition(dx ?? 0),
    top: axisPosition(-(dy ?? 0)),
    width: DOT_SIZE,
    height: DOT_SIZE,
    marginLeft: -DOT_SIZE / 2,
    marginTop: -DOT_SIZE / 2,
    borderRadius: '50%',
    transition: 'left .12s linear, top .12s linear',
  };

  return (
    <div class="target">
      <div class="target-axis target-axis-top">BRIGHTER</div>

      <div
        class="target-plot"
        style={{
          background: surroundColour(verdict.distance_state, verdict.brightness_state, guidingOnLight),
        }}
      >
        <div class="target-frame" />
        <div
          class="target-band"
          style={{ inset: `${BAND_INSET_PCT}%` }}
        />
        <div class="target-cross-v" />
        <div class="target-cross-h" />

        {known ? (
          lightUnverified ? (
            <div
              style={{
                ...dotBase,
                background: 'transparent',
                border: '2px solid var(--muted)',
              }}
            />
          ) : (
            <div
              style={{
                ...dotBase,
                background: inBand ? 'var(--ok)' : 'var(--warn-dot)',
                boxShadow: `0 0 0 ${HALO_WIDTH}px ${
                  inBand ? 'rgba(31,157,85,.20)' : 'rgba(217,119,6,.18)'
                }`,
              }}
            />
          )
        ) : (
          <div class="target-empty">no reading</div>
        )}
      </div>

      <div class="target-axis target-axis-sides">
        <span>CLOSER</span>
        <span>FURTHER</span>
      </div>
      <div class="target-axis target-axis-bottom">DIMMER</div>
    </div>
  );
}
