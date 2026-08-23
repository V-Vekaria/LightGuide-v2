import { useState } from 'preact/hooks';
import { DEFAULT_BRIGHTNESS_TOL, DEFAULT_DISTANCE_TOL_CM } from '../contract/types';
import { navigate, startGuiding, status } from '../store/store';
import { Banner } from './Banner';
import {
  connectionNotice,
  deviceActionReason,
  deviceErrorMessage,
  type UserMessage,
} from './messages';

/** Type a distance, get guided. Nothing named, nothing saved — the common case. */
export function QuickGuide() {
  const [distance, setDistance] = useState('');
  const [failure, setFailure] = useState<UserMessage | null>(null);
  const [starting, setStarting] = useState(false);
  const value = Number(distance);
  const valid = Number.isFinite(value) && value > 0;

  const connected = status.value === 'connected';
  const connection = connectionNotice(status.value);
  const reason = deviceActionReason(status.value);

  async function guide() {
    setFailure(null);
    setStarting(true);
    try {
      await startGuiding({
        distance_cm: value,
        distance_tol_cm: DEFAULT_DISTANCE_TOL_CM,
        brightness_above_ambient: null,
        brightness_tol: DEFAULT_BRIGHTNESS_TOL,
      });
    } catch (caught) {
      setFailure(deviceErrorMessage(caught, 'start guiding'));
    } finally {
      setStarting(false);
    }
  }

  return (
    <main class="wrap-tight">
      <div class="row">
        <h1 class="section-title">Quick guide</h1>
        <button class="link-btn" onClick={() => navigate('home')}>
          Cancel
        </button>
      </div>

      <p class="hint" style={{ marginTop: 0, marginBottom: 22, fontSize: 13.5 }}>
        {/* Points at "Save a setup" on the home screen — which is where you
            would go to do this — rather than at "New setup", which is the
            heading of the screen that button opens and is not a control
            anybody can find from here. */}
        Where do you want the light? We'll walk you to it. Nothing is saved — use{' '}
        <strong>Save a setup</strong> on the home screen if you want to keep it.
      </p>

      {connection && <Banner tone="warn" message={connection} />}
      {failure && <Banner tone="warn" message={failure} onDismiss={() => setFailure(null)} />}

      <div class="field">
        <label class="field-label" for="quick-distance">
          Target distance (cm)
        </label>
        <input
          id="quick-distance"
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
        {/* Guiding is the device's job — the target has to be sent to it. With
            no device there is nothing to press, so the button says so rather
            than failing after the tap. */}
        <button
          class="btn btn-block"
          disabled={!valid || !connected || starting}
          title={reason ?? undefined}
          onClick={() => void guide()}
        >
          {starting ? 'Starting…' : 'Guide me'}
        </button>
      </div>
    </main>
  );
}
