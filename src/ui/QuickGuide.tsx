import { useState } from 'preact/hooks';
import { DEFAULT_BRIGHTNESS_TOL, DEFAULT_DISTANCE_TOL_CM } from '../contract/types';
import { screen, startGuiding } from '../store/store';

/** Type a distance, get guided. Nothing named, nothing saved — the common case. */
export function QuickGuide() {
  const [distance, setDistance] = useState('');
  const value = Number(distance);
  const valid = Number.isFinite(value) && value > 0;

  return (
    <div class="wrap-tight">
      <div class="row">
        <span class="section-title">Quick guide</span>
        <button class="link-btn" onClick={() => (screen.value = 'library')}>
          Cancel
        </button>
      </div>

      <p class="hint" style={{ marginTop: 0, marginBottom: 22, fontSize: 13.5 }}>
        Where do you want the light? We'll walk you to it. Nothing is saved — use{' '}
        <strong>New setup</strong> if you want to keep it.
      </p>

      <div class="field">
        <div class="field-label">Target distance (cm)</div>
        <input
          class="input"
          type="number"
          inputMode="decimal"
          value={distance}
          placeholder="50"
          autofocus
          onInput={(e) => setDistance((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <div class="preset-row">
        {[30, 50, 80, 120].map((preset) => (
          <button key={preset} class="preset" onClick={() => setDistance(String(preset))}>
            {preset} cm
          </button>
        ))}
      </div>

      <div style={{ marginTop: 26 }}>
        <button
          class="btn btn-block"
          disabled={!valid}
          onClick={() => {
            void startGuiding({
              distance_cm: value,
              distance_tol_cm: DEFAULT_DISTANCE_TOL_CM,
              brightness_above_ambient: null,
              brightness_tol: DEFAULT_BRIGHTNESS_TOL,
            }).catch((error) => alert((error as Error).message));
          }}
        >
          Guide me
        </button>
      </div>
    </div>
  );
}
