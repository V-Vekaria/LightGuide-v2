import { useRef, useState } from 'preact/hooks';
import { targetFromSetup, type Setup } from '../contract/types';
import { exportSetups, importSetups } from '../backup/transfer';
import {
  PartialPersistError,
  activeSetupId,
  allSetups,
  createSetup,
  editSetup,
  navigate,
  persistSetups,
  removeSetup,
  setups,
  startGuiding,
  status,
} from '../store/store';
import { LiveStrip } from './Chrome';
import { Banner } from './Banner';
import {
  connectionNotice,
  deleteConfirmMessage,
  deleteSuccessMessage,
  deviceActionReason,
  deviceErrorMessage,
  importAckLabel,
  importConfirmLabel,
  importPartialMessage,
  importPlanSummary,
  importPlanTitle,
  importSuccessMessage,
  nameList,
  summariseImport,
  type ImportSummary,
  type UserMessage,
} from './messages';

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

/** A parsed, previewed import waiting for the user to say yes. Nothing is written until they do. */
interface PendingImport {
  fileName: string;
  summary: ImportSummary;
}

function Row({
  setup,
  active,
  connected,
  reason,
  onGuide,
  onDelete,
}: {
  setup: Setup;
  active: boolean;
  connected: boolean;
  reason: string | null;
  onGuide: (setup: Setup) => void;
  onDelete: (setup: Setup) => void;
}) {
  // Out of context, "Guide" and "Delete" name no particular setup — every row
  // has a pair, and a screen reader announces them one after another with
  // nothing to tell them apart. Pointing each button's label at its own text
  // plus the row's name gives "Guide, Portrait key" without inventing any
  // copy: both halves are already on screen.
  const nameId = `setup-${setup.id}-name`;
  const guideId = `setup-${setup.id}-guide`;
  const deleteId = `setup-${setup.id}-delete`;

  return (
    <div class={`trow${active ? ' is-active' : ''}`}>
      <div class="tname">
        <span class={`status-dot ${active ? 'dot-active' : 'dot-idle'}`} aria-hidden="true" />
        <button class="tname-btn" onClick={() => editSetup(setup.id)} title="Edit this setup">
          <span class="tname-text" id={nameId}>
            {setup.name}
          </span>
        </button>
      </div>
      <div class="tcell">{setup.distance_cm.toFixed(1)}</div>
      <div class="tcell tcell-dim">±{setup.distance_tol_cm}</div>
      <div class="tcell tcell-dim">
        {setup.brightness_above_ambient === null ? '—' : setup.brightness_above_ambient.toFixed(3)}
      </div>
      <div class="trow-actions">
        {/* Guiding and deleting both go through the device. Offering them while
            it is gone only produces a failure the user cannot act on — so the
            state of the connection is shown on the control itself. */}
        <button
          id={guideId}
          class="row-guide"
          disabled={!connected}
          title={reason ?? undefined}
          aria-labelledby={`${guideId} ${nameId}`}
          onClick={() => onGuide(setup)}
        >
          {active ? 'Guiding' : 'Guide'}
        </button>
        {/* Guide is a bordered button, Delete is bare text, and this rule holds
            28px of empty space between the two hit areas. They used to be
            identical text buttons ~10px apart at the thumb edge of the row. */}
        <span class="row-sep" aria-hidden="true" />
        <button
          id={deleteId}
          class="link-btn link-danger"
          disabled={!connected}
          title={reason ?? undefined}
          aria-labelledby={`${deleteId} ${nameId}`}
          onClick={() => onDelete(setup)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function Library() {
  const list = setups.value;
  /**
   * The full record, tombstones included — what backup works on. Rows are
   * still drawn from `list`; nothing deleted is ever rendered.
   */
  const record = allSetups.value;
  const activeId = activeSetupId.value;
  const connected = status.value === 'connected';
  const connection = connectionNotice(status.value);
  const reason = deviceActionReason(status.value);

  const [failure, setFailure] = useState<UserMessage | null>(null);
  const [result, setResult] = useState<UserMessage | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  /**
   * The deliberate second act a deletion has to pass through. One tap on
   * "Import" is the right amount of friction for adding setups and even for
   * overwriting them — the file still holds a copy of everything it wrote.
   * A deletion is different: it is the one import outcome that leaves the
   * user with strictly less than they had and no file anywhere that can
   * restore it. So when the plan removes something, the confirm button stays
   * inert until this is ticked, and the ticking is what cannot be done by
   * muscle memory. It is only ever required for deletions.
   */
  const [ackDeletions, setAckDeletions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function closePending() {
    setPending(null);
    setAckDeletions(false);
  }

  /** Non-null only when the pending import deletes something. */
  const ackLabel = pending === null ? null : importAckLabel(pending.summary);

  function clearMessages() {
    setFailure(null);
    setResult(null);
  }

  async function guide(setup: Setup) {
    clearMessages();
    try {
      await startGuiding(targetFromSetup(setup), setup.id);
    } catch (caught) {
      setFailure(deviceErrorMessage(caught, 'start guiding'));
    }
  }

  async function reallyDelete(setup: Setup) {
    setConfirmDelete(null);
    clearMessages();
    try {
      await removeSetup(setup.id);
      setResult(deleteSuccessMessage(setup));
    } catch (caught) {
      setFailure(deviceErrorMessage(caught, `delete “${setup.name}”`));
    }
  }

  /**
   * Reads and previews the file. Deliberately writes nothing: the merge is
   * last-write-wins by id, so a file can overwrite a setup that took a light
   * capture and a shoot to tune — and, since exports carry tombstones, it can
   * delete one outright. Export/import is the only backup there is, which
   * makes both unrecoverable — so the user sees what will change first.
   */
  async function onImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    clearMessages();
    closePending();
    try {
      // Merged against the full record, not the visible list: a setup deleted
      // last Tuesday must look like a deletion to the merge, not like one the
      // device has never heard of — otherwise an older file adds it straight
      // back.
      const merged = importSetups(await file.text(), allSetups.value);
      const summary = summariseImport(allSetups.value, merged);
      if (summary.changed.length === 0) {
        // Nothing to confirm, and nothing to write. Say so out loud — a silent
        // no-op is indistinguishable from a failure.
        setResult(importSuccessMessage(summary));
        return;
      }
      setPending({ fileName: file.name, summary });
    } catch (caught) {
      setFailure({
        title: `Couldn't import “${file.name}”.`,
        detail: (caught as Error).message || 'That file could not be read. Nothing was changed.',
      });
    } finally {
      // Clearing the value is what lets the same file be picked a second time
      // — after cancelling a preview, the next pick is usually the same file.
      input.value = '';
    }
  }

  /** Writes exactly the setups the user was shown — never a freshly recomputed set. */
  async function confirmImport(plan: PendingImport) {
    closePending();
    clearMessages();
    setBusy(true);
    try {
      await persistSetups(plan.summary.changed);
      setResult(importSuccessMessage(plan.summary));
    } catch (caught) {
      // Saves are confirmed by the device one at a time, so a failure partway
      // through means some changes really did land — including, possibly, some
      // of the deletions. Report which, never a blanket success or failure.
      const written = caught instanceof PartialPersistError ? caught.written : 0;
      setFailure(importPartialMessage(written, plan.summary, caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LiveStrip />
      <main class="wrap">
        <div class="row">
          <h1 class="section-title">Saved setups</h1>
          <div class="actions">
            {/* Was a <label> wrapping the hidden input. A <label> is not
                focusable, which made import — one of the two primary actions on
                this screen, and half of the only backup route there is —
                impossible to reach without a pointer. A real button that clicks
                the input for it is focusable, Enter/Space-activatable, and can
                be genuinely :disabled rather than only looking it. */}
            <button
              class="btn btn-ghost"
              disabled={!connected}
              title={reason ?? undefined}
              onClick={() => fileInput.current?.click()}
            >
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              disabled={!connected}
              onChange={onImport}
            />
            {/* Export never touches the device: it stays available precisely
                when the device is gone, because that is when a backup matters.
                It writes the full record — tombstones included — so restoring
                this file carries deletions forward instead of undoing them.
                Which is why it is gated on the record and not on the visible
                list: a user who has deleted everything has an empty list and a
                record full of tombstones, and those deletions are exactly what
                they would lose by not being able to export them. */}
            <button
              class="btn btn-ghost"
              disabled={record.length === 0}
              onClick={() => download('lightguide-setups.json', exportSetups(record))}
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

        {connection && <Banner tone="warn" message={connection} />}

        {confirmDelete && (
          <Banner tone="warn" message={deleteConfirmMessage(confirmDelete)}>
            <div class="banner-actions">
              <button class="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </button>
              <button class="btn" onClick={() => void reallyDelete(confirmDelete)}>
                Delete setup
              </button>
            </div>
          </Banner>
        )}

        {pending && (
          <Banner
            tone="warn"
            message={{
              title: importPlanTitle(pending.fileName, pending.summary),
              detail: importPlanSummary(pending.summary),
            }}
          >
            {/* Deletions first, always. They are the only outcome here that
                leaves the user with less than they started with and no file
                anywhere that can undo it. */}
            {pending.summary.deleted.length > 0 && (
              <>
                <div class="banner-subhead">
                  These setups are removed from the device. Their distance, tolerance and light
                  reference go with them, and nothing in the app can bring them back:
                </div>
                <ul class="banner-list">
                  {pending.summary.deleted.map((entry) => (
                    <li key={entry.id}>{entry.name}</li>
                  ))}
                </ul>
              </>
            )}
            {pending.summary.replaced.length > 0 && (
              <>
                <div class="banner-subhead">
                  These saved setups are overwritten by the file's newer copies — distance,
                  tolerance and light reference included. It cannot be undone:
                </div>
                <ul class="banner-list">
                  {pending.summary.replaced.map((entry) => (
                    <li key={entry.id}>
                      {entry.name}
                      {entry.incomingName !== entry.name ? ` → renamed “${entry.incomingName}”` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {pending.summary.added > 0 && (
              <div class="banner-subhead">
                Adding: {nameList(pending.summary.addedNames)}.
              </div>
            )}

            {(pending.summary.deleted.length > 0 || pending.summary.replaced.length > 0) && (
              <div class="banner-subhead">
                {/* The mitigation, not just the warning: the state about to be
                    lost is still on the device right now, and this writes it to
                    a file without leaving the confirmation. */}
                <button
                  class="link-btn"
                  onClick={() => download('lightguide-setups-before-import.json', exportSetups(record))}
                >
                  Export a backup of the current setups first
                </button>
              </div>
            )}

            {ackLabel !== null && (
              <div class="banner-ack">
                <input
                  type="checkbox"
                  id="import-ack-deletions"
                  checked={ackDeletions}
                  onChange={(e) => setAckDeletions((e.currentTarget as HTMLInputElement).checked)}
                />
                <label for="import-ack-deletions">{ackLabel}</label>
              </div>
            )}

            <div class="banner-actions">
              <button class="btn btn-ghost" onClick={closePending}>
                Cancel
              </button>
              <button
                class="btn"
                disabled={!connected || busy || (ackLabel !== null && !ackDeletions)}
                title={
                  ackLabel !== null && !ackDeletions
                    ? 'Tick the box above to confirm the deletions'
                    : (reason ?? undefined)
                }
                onClick={() => void confirmImport(pending)}
              >
                {busy ? 'Saving…' : importConfirmLabel(pending.summary)}
              </button>
            </div>
          </Banner>
        )}

        {failure && <Banner tone="warn" message={failure} onDismiss={() => setFailure(null)} />}
        {result && <Banner tone="ok" message={result} onDismiss={() => setResult(null)} />}

        <div class="panel">
          <div class="thead">
            <span>Setup</span>
            <span>Distance</span>
            <span>Tolerance</span>
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
              <Row
                key={setup.id}
                setup={setup}
                active={setup.id === activeId}
                connected={connected}
                reason={reason}
                onGuide={(target) => void guide(target)}
                onDelete={(target) => {
                  clearMessages();
                  setConfirmDelete(target);
                }}
              />
            ))
          )}
        </div>

        <div class="footnote">
          Light is stored above ambient, not raw — a reference captured at night still holds at noon.
          Export writes a JSON file you can re-import; it is the only backup until cloud sync lands.
        </div>
      </main>
    </>
  );
}
