import { useState } from 'preact/hooks';
import { liveReading } from '../store/store';

interface Props {
  onCaptured: (aboveAmbient: number) => void;
  onCancel: () => void;
}

function BulbIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={on ? 'var(--warn-dot)' : 'var(--faint)'}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3Z" />
      {on && (
        <>
          <path d="M12 1v-.01" />
          <path d="m4.5 4.5-.01-.01" />
          <path d="m19.5 4.5.01-.01" />
        </>
      )}
    </svg>
  );
}

/**
 * Two steps, and the first one is the point: reading ambient with the light off is
 * what makes the reference still valid next week under different daylight.
 *
 * Both steps share one zero, `reading.ambient` — the device's own ambient
 * estimate — never a client-side snapshot of raw brightness. Step 1 exists so
 * the *device* can settle that estimate; confirming it only records that the
 * user has acknowledged it looks settled, captured purely to redisplay for
 * context in step 2. Step 2 stores `brightness - ambient`, read live at the
 * moment of confirming, which is exactly the formula guidance later compares
 * against (src/guidance/verdict.ts) — so the stored reference and the live
 * comparison never disagree about what "zero" means.
 */
export function CaptureLight({ onCaptured, onCancel }: Props) {
  const [ambientAtConfirm, setAmbientAtConfirm] = useState<number | null>(null);
  const live = liveReading();
  const noLiveReading = live === null;

  if (ambientAtConfirm === null) {
    const ambientNow = live?.ambient ?? null;
    return (
      <div class="wrap-tight">
        <div class="row">
          <span class="section-title">Capture light</span>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>Step 1 of 2</span>
        </div>

        <div class="capture-stage">
          <BulbIcon on={false} />
          <div class="capture-title">Switch the light off</div>
          <p class="capture-copy">
            Reading the room's ambient level first is what keeps this reference valid next week,
            under different daylight.
          </p>

          <div class="capture-readout">
            <div class="field-label" style={{ marginBottom: 0 }}>
              Ambient now
            </div>
            <div class="capture-value">{ambientNow === null ? '—' : ambientNow.toFixed(3)}</div>
          </div>
        </div>

        {ambientNow === null && (
          <div class="notice" style={{ marginBottom: 12 }}>
            No live reading from the device.
          </div>
        )}

        <button
          class="btn btn-block"
          disabled={ambientNow === null}
          onClick={() => setAmbientAtConfirm(ambientNow)}
        >
          Ambient captured — next
        </button>
        <button class="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  const aboveAmbient =
    live?.brightness == null || live?.ambient == null
      ? null
      : Number((live.brightness - live.ambient).toFixed(3));
  const notAboveAmbient = aboveAmbient !== null && aboveAmbient <= 0;

  return (
    <div class="wrap-tight">
      <div class="row">
        <span class="section-title">Capture light</span>
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>Step 2 of 2</span>
      </div>

      <div class="capture-stage">
        <BulbIcon on />
        <div class="capture-title">Switch the light on and set it how you want it</div>
        <p class="capture-copy">We store the difference from ambient, not the raw level.</p>

        <div class="capture-readout">
          <div class="field-label" style={{ marginBottom: 0 }}>
            Above ambient
          </div>
          <div class="capture-value">{aboveAmbient === null ? '—' : aboveAmbient.toFixed(3)}</div>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
            ambient was {ambientAtConfirm.toFixed(3)}
          </div>
        </div>
      </div>

      {noLiveReading && (
        <div class="notice" style={{ marginBottom: 12 }}>
          No live reading from the device.
        </div>
      )}
      {!noLiveReading && notAboveAmbient && (
        <div class="notice" style={{ marginBottom: 12 }}>
          The light must read brighter than ambient before it can be used as a reference.
        </div>
      )}

      <button
        class="btn btn-block"
        disabled={aboveAmbient === null || notAboveAmbient}
        onClick={() => onCaptured(aboveAmbient!)}
      >
        Use this light level
      </button>
      <button
        class="btn btn-ghost btn-block"
        style={{ marginTop: 8 }}
        onClick={() => setAmbientAtConfirm(null)}
      >
        Back
      </button>
    </div>
  );
}
