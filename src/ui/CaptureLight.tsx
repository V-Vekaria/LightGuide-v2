import { useState } from 'preact/hooks';
import { liveReading } from '../store/store';

interface Props {
  onCaptured: (aboveAmbient: number) => void;
  onCancel: () => void;
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
      <div class="screen">
        <div class="screen-top">
          <div class="screen-title">Capture light</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>step 1 of 2</span>
        </div>
        <div class="screen-body" style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 34 }}>💡</div>
          <div style={{ fontSize: 17, fontWeight: 600, margin: '14px 0 10px' }}>
            Switch the light off
          </div>
          <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6 }}>
            Reading the room's ambient level first is what keeps this reference valid next week,
            under different daylight.
          </p>
          <div style={{
            marginTop: 24, background: '#131c2b', border: '1px solid #2a3444',
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>
              AMBIENT NOW
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
              {ambientNow === null ? '—' : ambientNow.toFixed(2)}
            </div>
          </div>
        </div>
        <div class="screen-foot">
          <button
            class="btn"
            disabled={ambientNow === null}
            onClick={() => setAmbientAtConfirm(ambientNow)}
          >
            Ambient captured — next
          </button>
          {ambientNow === null && (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
              No live reading from the device.
            </p>
          )}
          <button class="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const aboveAmbient = live?.brightness == null || live?.ambient == null
    ? null
    : Number((live.brightness - live.ambient).toFixed(3));
  const notAboveAmbient = aboveAmbient !== null && aboveAmbient <= 0;

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">Capture light</div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>step 2 of 2</span>
      </div>
      <div class="screen-body" style={{ textAlign: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 34 }}>🔆</div>
        <div style={{ fontSize: 17, fontWeight: 600, margin: '14px 0 10px' }}>
          Switch the light on and set it how you want it
        </div>
        <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6 }}>
          We store the difference from ambient, not the raw level.
        </p>
        <div style={{
          marginTop: 24, background: '#131c2b', border: '1px solid #2a3444',
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>
            ABOVE AMBIENT
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
            {aboveAmbient === null ? '—' : aboveAmbient.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            ambient was {ambientAtConfirm.toFixed(2)}
          </div>
        </div>
      </div>
      <div class="screen-foot">
        <button
          class="btn"
          disabled={aboveAmbient === null || notAboveAmbient}
          onClick={() => onCaptured(aboveAmbient!)}
        >
          Use this light level
        </button>
        {noLiveReading && (
          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
            No live reading from the device.
          </p>
        )}
        {!noLiveReading && notAboveAmbient && (
          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
            The light must read brighter than ambient before it can be used as a reference.
          </p>
        )}
        <button class="btn btn-ghost" onClick={() => setAmbientAtConfirm(null)}>Back</button>
      </div>
    </div>
  );
}
