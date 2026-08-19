import { targetFromSetup, type Setup } from '../contract/types';
import { exportSetups, importSetups } from '../backup/transfer';
import { persistSetup, removeSetup, screen, setups, startGuiding, status } from '../store/store';

function MiniTarget({ setup }: { setup: Setup }) {
  // Tolerance drives the inset: a tighter band draws a smaller box.
  const inset = Math.max(4, 18 - setup.distance_tol_cm);
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, border: '1px solid #374151', borderRadius: 4 }} />
      <div style={{
        position: 'absolute', inset, borderRadius: 3,
        border: `1.5px solid ${setup.brightness_above_ambient === null ? 'var(--info)' : 'var(--ok)'}`,
        background: setup.brightness_above_ambient === null
          ? 'rgba(96,165,250,.14)' : 'rgba(34,197,94,.14)',
      }} />
    </div>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Library() {
  const list = setups.value;

  async function onImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const merged = importSetups(await file.text(), list);
      for (const setup of merged) await persistSetup(setup);
    } catch (error) {
      alert((error as Error).message);
    }
    input.value = '';
  }

  return (
    <div class="screen">
      <div class="screen-top">
        <div>
          <div class="screen-title">Setups</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            <span class={`status-dot status-${status.value}`} />
            {list.length} saved · device {status.value}
          </div>
        </div>
      </div>

      <div class="screen-body">
        {list.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
            No setups yet. Use <strong>Quick guide</strong> to hit a distance right now, or save one
            here to come back to later.
          </p>
        )}

        {list.map((setup) => (
          <div
            key={setup.id}
            style={{
              display: 'flex', gap: 12, alignItems: 'center', padding: '11px 12px',
              background: 'var(--panel)', border: '1px solid var(--line)',
              borderRadius: 10, marginBottom: 8,
            }}
          >
            <MiniTarget setup={setup} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{setup.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {setup.distance_cm} cm ±{setup.distance_tol_cm}
                {setup.brightness_above_ambient === null
                  ? ' · distance only'
                  : ` · light ${setup.brightness_above_ambient.toFixed(2)}`}
              </div>
            </div>
            <button
              class="link-btn"
              onClick={() => void startGuiding(targetFromSetup(setup), setup.id)}
            >
              Guide
            </button>
            <button
              class="link-btn"
              style={{ color: 'var(--bad)' }}
              onClick={() => { if (confirm(`Delete "${setup.name}"?`)) void removeSetup(setup.id); }}
            >
              Delete
            </button>
          </div>
        ))}

        <div style={{ marginTop: 20, display: 'flex', gap: 14 }}>
          <button
            class="link-btn"
            onClick={() => download('lightguide-setups.json', exportSetups(list))}
          >
            Export
          </button>
          <label class="link-btn" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={onImport} />
          </label>
        </div>
      </div>

      <div class="screen-foot">
        <button class="btn" onClick={() => (screen.value = 'quick')}>Quick guide</button>
        <button class="btn btn-ghost" onClick={() => (screen.value = 'new')}>+ New setup</button>
      </div>
    </div>
  );
}
