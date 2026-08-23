import { useState } from 'preact/hooks';
import { TargetView } from './Target';
import { cuesEnabled, setCuesEnabled, useArrivalCue, useWakeLock } from './cues';
import type { Target } from '../contract/types';
import {
  activeSetupId,
  activeTarget,
  createSetup,
  guidanceView,
  lastGoodAt,
  leaveGuidanceScreen,
  setups,
  startGuiding,
  status,
  stopGuiding,
  tick,
} from '../store/store';

/** Same rungs Quick guide offers, so the two places you set a distance agree. */
const DISTANCE_PRESETS = [30, 50, 80, 120];

/**
 * The half of a guiding session that must outlive the live *screen*: the
 * screen wake lock and the arrival cue. Renders nothing; it exists to hold
 * hooks for exactly as long as there is an active target.
 *
 * Both used to live inside `Guidance`, scoped to the screen being mounted.
 * That made two individually-correct features cancel each other out. The app
 * bar chip promises, in as many words, that guidance continues after you leave
 * the live screen — so the photographer taps "Home" to check a name, walks
 * to the stand with both hands on it, and arrives on target with no buzz and
 * no chime, which is the exact case the cue exists for. The phone has slept
 * too, so walking back means waking it one-handed.
 *
 * Mounted by `App` for the whole life of the app and gated on
 * `activeTarget !== null`, so the lock and the tracker now span precisely what
 * the chip claims: the guiding session, whatever screen is showing.
 *
 * The "no target" case returns before any hook runs, which is what lets
 * `Session` use hooks unconditionally. Stopping guidance unmounts `Session`,
 * releasing the lock and discarding the arrival tracker with no teardown code
 * of its own.
 */
export function GuidanceSession() {
  const target = activeTarget.value;
  if (!target) return null;
  return <Session target={target} />;
}

function Session({ target }: { target: Target }) {
  // Keeps the screen awake for the whole session — not the whole screen.
  // Absent API, rejected request, page hidden: all handled inside, all silent.
  useWakeLock();

  // `settled` comes from the store rather than from the screen below, because
  // the screen may well not be mounted. Same derivation either way, so the
  // buzz can never disagree with what the live screen would have shown.
  //
  // The tracker inside refuses to fire on its first observation, so returning
  // to an already-settled stand stays silent: `Session` never unmounted, so
  // it has been watching all along and knows nothing changed.
  useArrivalCue(guidanceView(target).settled);
  return null;
}

/**
 * Thin shell: it exists only so the "no target" case can return before any
 * hook runs, leaving `Guidance` free to use hooks unconditionally.
 */
export function LiveGuidance() {
  const target = activeTarget.value;
  if (!target) return null;
  return <Guidance target={target} />;
}

function Guidance({ target }: { target: Target }) {
  // Read (and discard) the heartbeat so this component re-renders every 500ms
  // while mounted, even when no new frame arrives. Staleness below depends on
  // elapsed wall-clock time, and signals only re-render on a write — nothing
  // else here writes a signal when time merely passes. Do not delete this as
  // "unused": removing it silently breaks the staleness gate (see store.ts).
  void tick.value;

  const [editingTarget, setEditingTarget] = useState(false);
  const [draft, setDraft] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const now = Date.now();
  const disconnected = status.value !== 'connected';
  // One derivation, shared with the guidance session that owns the buzz (see
  // `GuidanceSession` above and `guidanceView` in store.ts). It reads the
  // stability-filtered feed rather than the raw signal — at 10 Hz the raw feed
  // makes the instruction and the dot flicker several times a second — and it
  // judges staleness per axis, so a missed ultrasonic ping ages out the
  // distance axis only and the light readout keeps working (spec §8).
  //
  // `guidingOnLight` tells TargetView whether an 'unknown' brightness channel
  // means "nothing to verify" (distance-only setup) or "sensor dropped out on
  // a setup that guides on light" — those two must render differently, and
  // only the target can distinguish them.
  const { distanceDown, lightDown, suppressed, gated, verdict: v, guidingOnLight, settled } =
    guidanceView(target);

  const named = setups.value.find((setup) => setup.id === activeSetupId.value);
  const cuesOn = cuesEnabled.value;

  // Live readouts follow exactly the same per-axis rule as the target, so a
  // number on screen always agrees with the channel the verdict was built from.
  const shownDistance = gated.distance_cm;
  const shownLight =
    gated.brightness === null || gated.ambient === null ? null : gated.brightness - gated.ambient;

  const openTargetEditor = () => {
    setDraft(String(target.distance_cm));
    setApplyError(null);
    setEditingTarget(true);
  };

  /**
   * Retarget in place. `startGuiding` is the same call Quick guide makes, so
   * the device gets the new target through exactly one code path — and the
   * current setup association is carried through rather than dropped, so
   * retargeting a named setup doesn't silently demote it to a quick guide.
   *
   * `startGuiding` rejects when the device is unreachable. That surfaces
   * inline: swallowing it would leave the header showing a target the stand is
   * not being guided to, which is the one thing this screen must never do.
   */
  const applyTarget = (distanceCm: number) => {
    if (applying || !Number.isFinite(distanceCm) || distanceCm <= 0) return;
    setApplying(true);
    setApplyError(null);
    void startGuiding({ ...target, distance_cm: distanceCm }, activeSetupId.value ?? undefined)
      .then(() => setEditingTarget(false))
      .catch((error: unknown) => setApplyError((error as Error).message))
      .then(() => setApplying(false));
  };

  const draftValue = Number(draft);
  const draftValid = draft.trim() !== '' && Number.isFinite(draftValue) && draftValue > 0;

  return (
    <>
      <main class="wrap" style={{ display: 'flex', flexDirection: 'column' }}>
        <div class="guide-head">
          <div class="guide-head-main">
            <h1 class="guide-name">{named ? named.name : 'Quick guide'}</h1>
            {editingTarget ? (
              <div class="target-edit">
                <div class="target-edit-row">
                  {/* No autofocus: popping the numeric keyboard would cover the
                      presets, which are the fast path for the mid-shoot case
                      this editor exists for. */}
                  <input
                    class="input target-edit-input"
                    type="number"
                    inputMode="decimal"
                    value={draft}
                    disabled={applying}
                    aria-label="Target distance in centimetres"
                    aria-invalid={applyError !== null}
                    aria-describedby={applyError ? 'target-edit-error' : undefined}
                    onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyTarget(draftValue);
                      if (e.key === 'Escape') setEditingTarget(false);
                    }}
                  />
                  <span class="target-edit-unit">cm</span>
                  <button
                    class="btn"
                    disabled={!draftValid || applying}
                    onClick={() => applyTarget(draftValue)}
                  >
                    {applying ? 'Setting…' : 'Set'}
                  </button>
                  <button
                    class="btn btn-ghost"
                    disabled={applying}
                    onClick={() => setEditingTarget(false)}
                  >
                    Cancel
                  </button>
                </div>
                {/* Presets apply on the single tap. The complaint this fixes is
                    the number of small controls to hit mid-shoot; making a
                    labelled preset a two-tap action would hand half of that
                    back, and any mis-tap is undone by tapping the right one. */}
                <div class="preset-row target-edit-presets">
                  {DISTANCE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      class="preset"
                      disabled={applying}
                      onClick={() => applyTarget(preset)}
                    >
                      {preset} cm
                    </button>
                  ))}
                </div>
                {applyError && (
                  <div class="target-edit-error" id="target-edit-error" role="alert">
                    Target unchanged — {applyError}
                  </div>
                )}
              </div>
            ) : (
              <button
                class="guide-target-btn"
                onClick={openTargetEditor}
                title="Change the target without stopping"
              >
                <span class="guide-target">
                  Target {target.distance_cm} cm ±{target.distance_tol_cm}
                  {guidingOnLight
                    ? ` · light ${target.brightness_above_ambient} ±${target.brightness_tol}`
                    : ' · distance only'}
                </span>
                <span class="guide-target-edit">Edit</span>
              </button>
            )}
          </div>
          {/* Both readouts turned green in band and stayed default out of it —
              colour doing the work on its own. The tick repeats it as a shape,
              and sits after the number so the digits never shift sideways when
              the state flips. */}
          <div class="guide-readouts">
            <div>
              <div class="readout-label">Distance</div>
              <div
                class={`readout-value${v.distance_state === 'in_band' ? ' is-in-band' : ''}`}
              >
                {shownDistance === null ? (
                  <span style={{ color: 'var(--faint)' }}>—</span>
                ) : (
                  <>
                    {shownDistance.toFixed(1)}
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 3 }}>cm</span>
                  </>
                )}
                {v.distance_state === 'in_band' && (
                  <span class="note-mark-after" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>
            </div>
            <div>
              <div class="readout-label">Light</div>
              <div
                class={`readout-value${v.brightness_state === 'in_band' ? ' is-in-band' : ''}`}
              >
                {shownLight === null ? (
                  <span style={{ color: 'var(--faint)' }}>—</span>
                ) : (
                  shownLight.toFixed(3)
                )}
                {v.brightness_state === 'in_band' && (
                  <span class="note-mark-after" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {(distanceDown || lightDown) && (
          <div class="stale-banner">
            {disconnected
              ? 'Device disconnected — showing no guidance rather than a stale one.'
              : suppressed
                ? 'No usable reading — showing no guidance rather than a stale one.'
                : distanceDown
                  ? 'No distance reading — the light readout is still live.'
                  : 'No light reading — distance guidance is still live.'}
            {distanceDown && lastGoodAt.value && (
              <> Last good distance {Math.round((now - lastGoodAt.value) / 1000)}s ago.</>
            )}
          </div>
        )}

        <div class="guide-stage" style={{ opacity: suppressed ? 0.4 : 1, transition: 'opacity .2s' }}>
          <TargetView
            verdict={v}
            distanceTolCm={target.distance_tol_cm}
            brightnessTol={target.brightness_tol}
            guidingOnLight={guidingOnLight}
          />
        </div>

        <div class="guide-foot">
          <div>
            <div class={`instruction ${settled ? 'is-ok' : 'is-warn'}`}>{v.instruction}</div>
            {v.distance_delta_cm !== null && (
              <div class="instruction-sub">
                distance {v.distance_delta_cm > 0 ? '+' : ''}
                {v.distance_delta_cm} cm
                {v.brightness_delta !== null && (
                  <>
                    {' · '}light {v.brightness_delta > 0 ? '+' : ''}
                    {v.brightness_delta}
                  </>
                )}
              </div>
            )}
          </div>
          <div class="actions">
            {/* First in the row, and deliberately not next to "Stop guiding":
                muting is a one-off decision, stopping is destructive. */}
            <button
              class={`btn btn-ghost cue-toggle ${cuesOn ? 'is-on' : 'is-off'}`}
              aria-pressed={cuesOn}
              onClick={() => setCuesEnabled(!cuesOn)}
              title={
                cuesOn
                  ? 'Buzzing and chiming when the stand reaches the target'
                  : 'Arrival buzz and chime are muted'
              }
            >
              {cuesOn ? 'Alert on arrival' : 'Alerts muted'}
            </button>
            {/* A quick guide has no setup behind it. Offer to keep a good
                ad-hoc result in one tap rather than making the user retype it
                into New setup — the spec's promised save-after-quick-guide. */}
            {!named && (
              <button class="btn btn-ghost" onClick={() => createSetup(target.distance_cm)}>
                Save as setup
              </button>
            )}
            {/* Named for where it goes, which is the screen the app opens on
                — the saved setups are one section of it, not the whole of it. */}
            <button class="btn btn-ghost" onClick={leaveGuidanceScreen}>
              Home
            </button>
            <button class="btn" onClick={() => void stopGuiding()}>
              Stop guiding
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
