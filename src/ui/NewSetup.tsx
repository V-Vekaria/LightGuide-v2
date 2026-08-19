import { useState } from 'preact/hooks';
import { DEFAULT_DISTANCE_TOL_CM, newSetup } from '../contract/types';
import {
  editingSetupId,
  liveReading,
  navigate,
  persistSetup,
  prefillDistanceCm,
  setups,
} from '../store/store';
import { CaptureLight } from './CaptureLight';

export function NewSetup() {
  // Mounted fresh per edit (app.tsx keys this component on editingSetupId), so
  // reading the setup once for the initial state is safe.
  const existing = setups.value.find((setup) => setup.id === editingSetupId.value) ?? null;
  const isEdit = existing !== null;

  const [name, setName] = useState(existing?.name ?? '');
  const [distance, setDistance] = useState(
    existing
      ? String(existing.distance_cm)
      : prefillDistanceCm.value !== null
        ? String(prefillDistanceCm.value)
        : ''
  );
  const [distanceSource, setDistanceSource] = useState<'typed' | 'captured'>(
    existing?.distance_source ?? 'typed'
  );
  const [tolerance, setTolerance] = useState(
    String(existing?.distance_tol_cm ?? DEFAULT_DISTANCE_TOL_CM)
  );
  const [light, setLight] = useState<number | null>(existing?.brightness_above_ambient ?? null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const liveDistance = liveReading()?.distance_cm ?? null;
  const distanceValue = Number(distance);
  const toleranceValue = Number(tolerance);
  // A tolerance of 0 is never satisfiable — verdict() can only report in_band
  // when |delta| <= tol, and a live sensor never lands on an exact value. Such
  // a setup would nag forever with no clue why, so refuse to save it.
  const toleranceValid = tolerance.trim() !== '' && Number.isFinite(toleranceValue) && toleranceValue >= 0.5;
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(distanceValue) &&
    distanceValue > 0 &&
    toleranceValid;

  if (capturing) {
    return (
      <CaptureLight
        onCaptured={(aboveAmbient) => {
          setLight(aboveAmbient);
          setCapturing(false);
        }}
        onCancel={() => setCapturing(false)}
      />
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const lightChanged = (existing?.brightness_above_ambient ?? null) !== light;
      const setup =
        existing !== null
          ? {
              ...existing,
              name: name.trim(),
              distance_cm: distanceValue,
              distance_source: distanceSource,
              distance_tol_cm: toleranceValue,
              brightness_above_ambient: light,
              brightness_captured_at:
                light === null
                  ? null
                  : lightChanged
                    ? new Date().toISOString()
                    : existing.brightness_captured_at,
              // Every write touches updated_at — last-write-wins merge and the
              // future sync tier both order on it, so an edit that left it
              // stale would silently lose to an older copy.
              updated_at: new Date().toISOString(),
            }
          : newSetup({
              name: name.trim(),
              distance_cm: distanceValue,
              distance_source: distanceSource,
              distance_tol_cm: toleranceValue,
              brightness_above_ambient: light,
            });

      await persistSetup(setup);
      navigate('library');
    } catch (caught) {
      // Save is confirmed by the device. If it failed, say so.
      setError((caught as Error).message || 'The device did not confirm the save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="wrap-tight">
      <div class="row">
        <span class="section-title">{isEdit ? 'Edit setup' : 'New setup'}</span>
        <button class="link-btn" onClick={() => navigate('library')}>
          Cancel
        </button>
      </div>

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
          onInput={(e) => {
            setDistance((e.currentTarget as HTMLInputElement).value);
            setDistanceSource('typed');
          }}
        />
        <button
          class="link-btn"
          disabled={liveDistance === null}
          onClick={() => {
            setDistance(String(liveDistance));
            setDistanceSource('captured');
          }}
        >
          {liveDistance === null
            ? 'Use current reading'
            : `Use current reading — ${liveDistance.toFixed(1)} cm`}
        </button>
        {liveDistance === null && <div class="hint">No live reading from the device.</div>}
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
        {!toleranceValid && (
          <div class="hint" style={{ color: 'var(--bad)' }}>
            Needs to be at least 0.5 cm — a zero tolerance can never be met, so the setup
            would never read as on target.
          </div>
        )}
      </div>

      <div class="field">
        <div class="field-label">Light reference</div>
        {light === null ? (
          <>
            <button class="btn btn-info" onClick={() => setCapturing(true)}>
              Capture light
            </button>
            <div class="hint">
              Optional — skip to guide on distance only. Light can only be measured, never typed.
            </div>
          </>
        ) : (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '11px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span class="num" style={{ fontSize: 14 }}>
              {light.toFixed(3)} above ambient
            </span>
            <button class="link-btn" onClick={() => setLight(null)}>
              Clear
            </button>
          </div>
        )}
      </div>

      {error && <div class="stale-banner">{error}</div>}

      <button class="btn btn-block" disabled={!valid || saving} onClick={() => void save()}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save setup'}
      </button>
    </div>
  );
}
