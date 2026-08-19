import { useState } from 'preact/hooks';
import { DEFAULT_BRIGHTNESS_TOL, DEFAULT_DISTANCE_TOL_CM } from '../contract/types';
import { screen, startGuiding } from '../store/store';

/** Type a distance, get guided. Nothing named, nothing saved — the common case. */
export function QuickGuide() {
  const [distance, setDistance] = useState('');
  const value = Number(distance);
  const valid = Number.isFinite(value) && value > 0;

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">Quick guide</div>
        <button class="link-btn" onClick={() => (screen.value = 'library')}>Cancel</button>
      </div>

      <div class="screen-body">
        <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
          Where do you want the light? We'll walk you to it. Nothing is saved.
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[30, 50, 80, 120].map((preset) => (
            <button
              key={preset}
              class="link-btn"
              style={{
                border: '1px solid var(--line)', borderRadius: 8,
                padding: '8px 14px', color: 'var(--text)',
              }}
              onClick={() => setDistance(String(preset))}
            >
              {preset} cm
            </button>
          ))}
        </div>
      </div>

      <div class="screen-foot">
        <button
          class="btn"
          disabled={!valid}
          onClick={() => void startGuiding({
            distance_cm: value,
            distance_tol_cm: DEFAULT_DISTANCE_TOL_CM,
            brightness_above_ambient: null,
            brightness_tol: DEFAULT_BRIGHTNESS_TOL,
          })}
        >
          Guide me
        </button>
      </div>
    </div>
  );
}
