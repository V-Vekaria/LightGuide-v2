import { targetFromSetup, type Setup } from '../contract/types';
import { exportSetups, importSetups } from '../backup/transfer';
import {
  PartialPersistError,
  activeSetupId,
  createSetup,
  editSetup,
  navigate,
  persistSetups,
  removeSetup,
  setups,
  startGuiding,
} from '../store/store';
import { LiveStrip } from './Chrome';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Some browsers cancel the download if the object URL is revoked
  // synchronously; give it a beat since this is the user's only backup path.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Row({ setup, active }: { setup: Setup; active: boolean }) {
  return (
    <div class={`trow${active ? ' is-active' : ''}`}>
      <div class="tname">
        <span
          class="status-dot"
          style={{ background: active ? 'var(--ok)' : 'var(--line)' }}
        />
        <button class="tname-btn" onClick={() => editSetup(setup.id)} title="Edit this setup">
          <span class="tname-text">{setup.name}</span>
        </button>
      </div>
      <div class="tcell">{setup.distance_cm.toFixed(1)}</div>
      <div class="tcell tcell-dim">±{setup.distance_tol_cm}</div>
      <div class="tcell tcell-dim">
        {setup.brightness_above_ambient === null ? '—' : setup.brightness_above_ambient.toFixed(3)}
      </div>
      <div class="trow-actions">
        <button
          class="link-btn"
          onClick={() => {
            void startGuiding(targetFromSetup(setup), setup.id).catch((error) =>
              alert((error as Error).message)
            );
          }}
        >
          {active ? 'Guiding' : 'Guide'}
        </button>
        <button
          class="link-btn link-danger"
          onClick={() => {
            if (confirm(`Delete "${setup.name}"?`)) {
              void removeSetup(setup.id).catch((error) => alert((error as Error).message));
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function Library() {
  const list = setups.value;
  const activeId = activeSetupId.value;

  async function onImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const merged = importSetups(await file.text(), list);
      // Only write what the import actually changes: re-importing your own
      // export should not rewrite every unchanged setup to device flash.
      const currentById = new Map(list.map((setup) => [setup.id, setup]));
      const toWrite = merged.filter((incoming) => {
        const current = currentById.get(incoming.id);
        return !current || current.updated_at !== incoming.updated_at;
      });
      if (toWrite.length > 0) {
        await persistSetups(toWrite).catch((error) => {
          const written = error instanceof PartialPersistError ? error.written : 0;
          throw new Error(
            `Import failed after saving ${written} of ${toWrite.length} setups: ${(error as Error).message}`
          );
        });
      }
    } catch (error) {
      alert((error as Error).message);
    }
    input.value = '';
  }

  return (
    <>
      <LiveStrip />
      <div class="wrap">
        <div class="row">
          <span class="section-title">Saved setups</span>
          <div class="actions">
            <label class="btn btn-ghost" style={{ cursor: 'pointer' }}>
              Import
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={onImport}
              />
            </label>
            <button
              class="btn btn-ghost"
              disabled={list.length === 0}
              onClick={() => download('lightguide-setups.json', exportSetups(list))}
            >
              Export
            </button>
            <button class="btn btn-ghost" onClick={() => navigate('quick')}>
              Quick guide
            </button>
            <button class="btn" onClick={() => createSetup()}>
              New setup
            </button>
          </div>
        </div>

        <div class="panel">
          <div class="thead">
            <span>Setup</span>
            <span>Distance</span>
            <span>Tol</span>
            <span>Light</span>
            <span />
          </div>

          {list.length === 0 ? (
            <div class="empty">
              No setups yet. <strong>Quick guide</strong> walks you to a distance right now without
              saving anything; <strong>New setup</strong> keeps one for later.
            </div>
          ) : (
            list.map((setup) => (
              <Row key={setup.id} setup={setup} active={setup.id === activeId} />
            ))
          )}
        </div>

        <div class="footnote">
          Light is stored above ambient, not raw — a reference captured at night still holds at noon.
          Export writes a JSON file you can re-import; it is the only backup until cloud sync lands.
        </div>
      </div>
    </>
  );
}
