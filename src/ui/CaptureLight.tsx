import { useState } from 'preact/hooks';
import { reading } from '../store/store';

interface Props {
  onCaptured: (aboveAmbient: number) => void;
  onCancel: () => void;
}

/**
 * Two steps, and the first one is the point: reading ambient with the light off is
 * what makes the reference still valid next week under different daylight.
 */
export function CaptureLight({ onCaptured, onCancel }: Props) {
  const [ambient, setAmbient] = useState<number | null>(null);
  const live = reading.value;
  const brightness = live?.brightness ?? null;

  if (ambient === null) {
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
              {brightness === null ? '—' : brightness.toFixed(2)}
            </div>
          </div>
        </div>
        <div class="screen-foot">
          <button
            class="btn"
            disabled={brightness === null}
            onClick={() => setAmbient(brightness)}
          >
            Ambient captured — next
          </button>
          <button class="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const aboveAmbient = brightness === null ? null : Number((brightness - ambient).toFixed(3));

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
            ambient was {ambient.toFixed(2)}
          </div>
        </div>
      </div>
      <div class="screen-foot">
        <button
          class="btn"
          disabled={aboveAmbient === null || aboveAmbient <= 0}
          onClick={() => onCaptured(aboveAmbient!)}
        >
          Use this light level
        </button>
        <button class="btn btn-ghost" onClick={() => setAmbient(null)}>Back</button>
      </div>
    </div>
  );
}
