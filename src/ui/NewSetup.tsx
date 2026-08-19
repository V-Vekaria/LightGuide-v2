import { useState } from 'preact/hooks';
import { DEFAULT_DISTANCE_TOL_CM, newSetup } from '../contract/types';
import { persistSetup, reading, screen } from '../store/store';
import { CaptureLight } from './CaptureLight';

export function NewSetup() {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState('');
  const [distanceSource, setDistanceSource] = useState<'typed' | 'captured'>('typed');
  const [tolerance, setTolerance] = useState(String(DEFAULT_DISTANCE_TOL_CM));
  const [light, setLight] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const liveDistance = reading.value?.distance_cm ?? null;
  const distanceValue = Number(distance);
  const valid = name.trim().length > 0 && Number.isFinite(distanceValue) && distanceValue > 0;

  if (capturing) {
    return (
      <CaptureLight
        onCaptured={(aboveAmbient) => { setLight(aboveAmbient); setCapturing(false); }}
        onCancel={() => setCapturing(false)}
      />
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await persistSetup(newSetup({
        name: name.trim(),
        distance_cm: distanceValue,
        distance_source: distanceSource,
        distance_tol_cm: (() => { const n = Number(tolerance); return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DISTANCE_TOL_CM; })(),
        brightness_above_ambient: light,
      }));
      screen.value = 'library';
    } catch (caught) {
      // Save is confirmed by the device. If it failed, say so.
      setError((caught as Error).message || 'The device did not confirm the save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">New setup</div>
        <button class="link-btn" onClick={() => (screen.value = 'library')}>Cancel</button>
      </div>

      <div class="screen-body">
        <div class="field">
          <div class="field-label">Name</div>
          <input
            class="input"
            value={name}
            placeholder="Portrait key"
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <div class="field-label">Target distance (cm)</div>
          <input
            class="input"
            type="number"
            inputMode="decimal"
            value={distance}
            placeholder="50"
            onInput={(e) => { setDistance((e.currentTarget as HTMLInputElement).value); setDistanceSource('typed'); }}
          />
          {liveDistance !== null && (
            <button class="link-btn" onClick={() => { setDistance(String(liveDistance)); setDistanceSource('captured'); }}>
              ↻ or use current reading — {liveDistance.toFixed(1)} cm
            </button>
          )}
        </div>

        <div class="field">
          <div class="field-label">Tolerance (± cm)</div>
          <input
            class="input"
            type="number"
            inputMode="decimal"
            value={tolerance}
            onInput={(e) => setTolerance((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <div class="field-label">Light reference</div>
          {light === null ? (
            <>
              <button class="btn btn-info" onClick={() => setCapturing(true)}>Capture light</button>
              <div class="hint">Optional — skip to guide on distance only.</div>
            </>
          ) : (
            <div style={{
              background: '#131c2b', border: '1px solid #2a3444',
              borderRadius: 9, padding: 12, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14 }}>{light.toFixed(2)} above ambient</span>
              <button class="link-btn" onClick={() => setLight(null)}>Clear</button>
            </div>
          )}
        </div>

        {error && <div class="stale-banner">{error}</div>}
      </div>

      <div class="screen-foot">
        <button class="btn" disabled={!valid || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save setup'}
        </button>
      </div>
    </div>
  );
}
