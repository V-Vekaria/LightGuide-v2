import { useRef, useState } from 'preact/hooks';
import { targetFromSetup, type Setup } from '../contract/types';
import { exportSetups, importSetups } from '../backup/transfer';
import {
  PartialPersistError,
  activeSetupId,
  allSetups,
  editSetup,
  persistSetups,
  removeSetup,
  setups,
  setupsChecked,
  startGuiding,
  status,
} from '../store/store';
import { LiveStrip } from './Chrome';
import { Banner } from './Banner';
import { HomeIntro, HomeReference } from './HomeIntro';
import { resolveHomeState, showsConnectionBanner, showsLiveStrip } from './screens';
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
  const editId = `setup-${setup.id}-edit`;
  const guideId = `setup-${setup.id}-guide`;
  const deleteId = `setup-${setup.id}-delete`;

  return (
    <div class={`trow${active ? ' is-active' : ''}`}>
      {/* The name used to *be* the edit control: a button whose only affordance
          was a hover underline, which is no affordance at all on the phone this
          app is mostly used from. It is plain text now, and editing has a
          labelled button of its own in the row's actions. The tap height the
          button used to contribute moves onto .tname so the row does not
          shrink back below 44px. */}
      <div class="tname">
        <span class={`status-dot ${active ? 'dot-active' : 'dot-idle'}`} aria-hidden="true" />
        <span class="tname-text" id={nameId}>
          {setup.name}
        </span>
      </div>
      {/* The column headings are hidden on a phone, which left three bare
          numbers under the name with nothing to say which was which. The
          labels come back inline at that width (see theme.css). */}
      <div class="tcell" data-label="Distance">
        {setup.distance_cm.toFixed(1)}
      </div>
      <div class="tcell tcell-dim" data-label="Tolerance">
        ±{setup.distance_tol_cm}
      </div>
      <div class="tcell tcell-dim" data-label="Light">
        {setup.brightness_above_ambient === null ? '—' : setup.brightness_above_ambient.toFixed(3)}
      </div>
      <div class="trow-actions">
        {/* Editing needs no device — it opens a form, and the form's own Save
            is what the device gates. Leaving it live is also the only thing
            there is to do with a setup while the device is off. */}
        <button
          id={editId}
          class="link-btn"
          aria-labelledby={`${editId} ${nameId}`}
          onClick={() => editSetup(setup.id)}
        >
          Edit
        </button>
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
            identical text buttons ~10px apart at the thumb edge of the row.
            Edit joins on the far side of Guide rather than beside Delete: a
            mis-tap between Edit and Guide costs a screen, and the whole point
            of the rule is that a mis-tap on this side of it costs a setup. */}
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

/**
 * The screen the app opens on, and the one every "get me out of here" control
 * returns to.
 *
 * It is one screen, not a landing page in front of the setups list, and that
 * is the central decision here. A returning photographer opens this app
 * mid-shoot to tap a saved setup and start guiding; a separate landing screen
 * would put a click in front of that, every time, forever, to serve a need
 * they have exactly once. So the list stays where it was and the *top* of the
 * page changes instead — see `resolveHomeState` in `screens.ts` for what
 * decides which version they get, and why it is decided from live state
 * rather than from a flag recording whether the intro has been dismissed.
 */
export function Home() {
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

  const home = resolveHomeState({
    status: status.value,
    setupCount: list.length,
    setupsChecked: setupsChecked.value,
  });

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
      {/* Four tiles reading "—", "—", "—" and "0" are the first thing a
          newcomer used to meet. They are withheld while there is genuinely
          nothing to read and in no other state — this never hides a live
          instrument, only an empty one. */}
      {showsLiveStrip(home) && <LiveStrip />}
      <main class="wrap">
        <HomeIntro state={home} status={status.value} />

        <div class="row row-setups">
          {/* Demoted from <h1>: the page has a real heading of its own now, and
              this names a section within it. Same class, so it looks unchanged. */}
          <h2 class="section-title">Saved setups</h2>
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
            {/* "Quick guide" and "New setup" used to sit here, in a wrapping
                row of four equal-looking ghost buttons where the two that
                actually start a placement were indistinguishable from the two
                that manage a backup file. They have moved up into the band
                above, where they are the page's primary actions and are
                labelled with what they do rather than with what they are
                called. Import and Export stay exactly as they were, next to
                the list they act on. */}
          </div>
        </div>

        {/* Suppressed on first run only: not being connected is what first run
            *means* — the phone has not joined the device's network yet — so
            the warning would be reporting the expected state as a fault, and
            the panel above already explains it properly. Every other state
            keeps this banner untouched. */}
        {connection && showsConnectionBanner(home) && <Banner tone="warn" message={connection} />}

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
            /* The old copy named two buttons — "Quick guide" and "New setup" —
               to somebody who had never seen either and had no idea what the
               app was. Both are now explained and offered above this table, so
               the empty row only has to say that the table is empty. */
            <div class="empty">Nothing saved yet. Setups you keep will be listed here.</div>
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

        {/* Not on first run: the welcome panel above already says all of this,
            at more length and in the order a newcomer needs it. */}
        {home !== 'welcome' && home !== 'looking' && <HomeReference status={status.value} />}

        <div class="footnote">
          Light is stored above ambient, not raw — a reference captured at night still holds at noon.
          Export writes a JSON file you can re-import; it is the only backup until cloud sync lands.
        </div>
      </main>
    </>
  );
}
