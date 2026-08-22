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

/**
 * The plot's three states, named rather than resolved straight to a colour.
 *
 * This used to return the tint directly. It reports the state instead because
 * the tint can no longer be the only thing carrying it: green-vs-amber is the
 * pairing red-green colour blindness collapses, so the settled state also has
 * to reach the band's border style (solid vs dashed, see theme.css). Both cues
 * now read off one decision instead of two that could drift apart.
 */
type PlotState = 'unknown' | 'settled' | 'adjust';

const PLOT_TINT: Record<PlotState, string> = {
  unknown: 'rgba(84,93,101,.09)',
  settled: 'rgba(23,124,67,.10)',
  adjust: 'rgba(184,101,5,.10)',
};

function plotState(distance: ChannelState, brightness: ChannelState, guidingOnLight: boolean): PlotState {
  if (distance === 'unknown') return 'unknown';
  // A dropped-out light sensor on a setup that guides on light is unverified, not settled —
  // give it the same neutral treatment as an unknown distance. Distance-only setups are
  // exempt: they have no light target, so brightness_state is permanently 'unknown' there
  // and that's expected, not a dropout.
  if (guidingOnLight && brightness === 'unknown') return 'unknown';
  const settled = distance === 'in_band' && (brightness === 'in_band' || !guidingOnLight);
  return settled ? 'settled' : 'adjust';
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

/**
 * The in-band zone. With a light target it's a box — both axes are being
 * judged, so both are bounded. Without one (a quick guide always has
 * `brightness_above_ambient: null`) it becomes a full-height vertical slab:
 * only horizontal position means anything, and a box would invite a
 * photographer reading the dot from 2 m away to take its vertical position as
 * a judgement about the light. There is no light judgement to make.
 */
function bandInset(guidingOnLight: boolean): string {
  return guidingOnLight ? `${BAND_INSET_PCT}%` : `0 ${BAND_INSET_PCT}%`;
}

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
  const state = plotState(verdict.distance_state, verdict.brightness_state, guidingOnLight);

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
      {/* Vertical axis labels only when there is a vertical judgement to read.
          On a distance-only setup the dot never leaves the centre line, and a
          BRIGHTER/DIMMER scale beside a dot that cannot move on it is a
          readout of nothing. */}
      {guidingOnLight && <div class="target-axis target-axis-top">BRIGHTER</div>}

      <div
        class={`target-plot${state === 'settled' ? ' is-in-band' : ''}`}
        style={{ background: PLOT_TINT[state] }}
      >
        <div class="target-frame" />
        <div
          class="target-band"
          style={{ inset: bandInset(guidingOnLight) }}
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
                  inBand ? 'rgba(23,124,67,.20)' : 'rgba(184,101,5,.18)'
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
      {guidingOnLight && <div class="target-axis target-axis-bottom">DIMMER</div>}
    </div>
  );
}
