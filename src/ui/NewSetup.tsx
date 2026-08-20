import { useState } from 'preact/hooks';
import { DEFAULT_DISTANCE_TOL_CM, newSetup } from '../contract/types';
import {
  editingSetupId,
  liveReading,
  navigate,
  persistSetup,
  prefillDistanceCm,
  setups,
  status,
} from '../store/store';
import { CaptureLight } from './CaptureLight';
import { Banner } from './Banner';
import {
  connectionNotice,
  deviceActionReason,
  deviceErrorMessage,
  liveReadingNotice,
  type UserMessage,
} from './messages';

export function NewSetup() {
  // Mounted fresh per edit (app.tsx keys this component on editingSetupId), so
  // reading the setup once for the initial state is safe.
  const existing = setups.value.find((setup) => setup.id === editingSetupId.value) ?? null;
  const isEdit = existing !== null;

  // Snapshotted on first render only. This is the baseline every "have you
  // changed anything?" question is answered against, so it must not drift
  // when the device refreshes the list underneath us.
  const [initial] = useState(() => ({
    name: existing?.name ?? '',
    distance: existing
      ? String(existing.distance_cm)
      : prefillDistanceCm.value !== null
        ? String(prefillDistanceCm.value)
        : '',
    tolerance: String(existing?.distance_tol_cm ?? DEFAULT_DISTANCE_TOL_CM),
    light: existing?.brightness_above_ambient ?? null,
  }));

  const [name, setName] = useState(initial.name);
  const [distance, setDistance] = useState(initial.distance);
  const [distanceSource, setDistanceSource] = useState<'typed' | 'captured'>(
    existing?.distance_source ?? 'typed'
  );
  const [tolerance, setTolerance] = useState(initial.tolerance);
  const [light, setLight] = useState<number | null>(initial.light);
  const [capturing, setCapturing] = useState(false);
  const [failure, setFailure] = useState<UserMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const connected = status.value === 'connected';
  const connection = connectionNotice(status.value);
  const reason = deviceActionReason(status.value);

  const liveDistance = liveReading()?.distance_cm ?? null;
  const readingNotice = liveReadingNotice(status.value, liveDistance !== null);
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

  const dirty =
    name !== initial.name ||
    distance !== initial.distance ||
    tolerance !== initial.tolerance ||
    light !== initial.light;
  /**
   * A light reference is the one thing on this form that cost physical work:
   * the studio light had to be switched off, the reading had to settle, then
   * the light went back on and was set again. Typing a name costs nothing;
   * this costs a trip to the stand and a client's patience. So the leave
   * confirmation names it specifically instead of saying "unsaved changes".
   */
  const capturedLight = light !== null && light !== initial.light;

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

  function leave() {
    if (!dirty) {
      navigate('library');
      return;
    }
    setConfirmLeave(true);
  }

  async function save() {
    setSaving(true);
    setFailure(null);
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
      // Save is confirmed by the device. If it failed, say so — and say what
      // to do about it, with the form still filled in behind the message.
      setFailure(deviceErrorMessage(caught, isEdit ? 'save your changes' : 'save this setup'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="wrap-tight">
      <div class="row">
        <span class="section-title">{isEdit ? 'Edit setup' : 'New setup'}</span>
        <button class="link-btn" onClick={leave}>
          Cancel
        </button>
      </div>

      {connection && <Banner tone="warn" message={connection} />}

      {confirmLeave && (
        <Banner
          tone="warn"
          message={
            capturedLight && light !== null
              ? {
                  title: 'Leave and lose the light you just captured?',
                  detail: `The reference reads ${light.toFixed(
                    3
                  )} above ambient. Capturing it again means switching the studio light off, waiting for the reading to settle, switching it back on and setting it how you want it.`,
                }
              : {
                  title: 'Leave without saving?',
                  detail: 'The name, distance and tolerance on this form have not been saved yet.',
                }
          }
        >
          <div class="banner-actions">
            <button class="btn btn-ghost" onClick={() => setConfirmLeave(false)}>
              Keep editing
            </button>
            <button class="btn" onClick={() => navigate('library')}>
              Leave without saving
            </button>
          </div>
        </Banner>
      )}

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
        {readingNotice && (
          <div class="hint">
            {/* When the device is gone the banner above already carries the
                recovery steps; repeating them under every field is noise. */}
            {readingNotice.title}
            {connected ? ` ${readingNotice.detail}` : ''}
          </div>
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

      {failure && <Banner tone="warn" message={failure} onDismiss={() => setFailure(null)} />}

      {/* The device confirms every save — there is no optimistic write to fall
          back on, so with no device there is nothing this button can do. */}
      <button
        class="btn btn-block"
        disabled={!valid || saving || !connected}
        title={connected ? undefined : (reason ?? undefined)}
        onClick={() => void save()}
      >
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save setup'}
      </button>
    </div>
  );
}
