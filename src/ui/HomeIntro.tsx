import type { ConnectionStatus } from '../contract/types';
import { createSetup, navigate } from '../store/store';
import type { HomeState } from './screens';

/**
 * The part of the home screen that changes with what the visitor already
 * knows — see `resolveHomeState` in `screens.ts` for why it changes on state
 * rather than on a "seen it" flag.
 *
 * All the copy in here follows the same rule as `messages.ts`: it is written
 * for a photographer standing in a dim room with a hand on a light stand, and
 * it never suggests the internet. The phone is joined to the device's own
 * access point and has no internet at all while this app is in use — saying
 * "check your connection" would send someone to fix the one thing that is
 * supposed to be broken.
 */

/**
 * Connection, said in words as well as in colour.
 *
 * `absent` is the "disconnected" wording, because the same fact needs two
 * different sentences: on first run there has never been a device, and at the
 * foot of a page belonging to somebody with four saved setups there certainly
 * has been. "No device yet" is reassuring in the first case and simply wrong
 * in the second.
 */
function StatusLine({ status, absent }: { status: ConnectionStatus; absent: string }) {
  const label =
    status === 'connected'
      ? 'Device connected'
      : status === 'connecting'
        ? 'Looking for the device…'
        : absent;
  return (
    <p class="status-line">
      <span class={`status-dot status-${status}`} aria-hidden="true" />
      {label}
    </p>
  );
}

/** The two buttons that start a placement. Same pair, whatever the state. */
function StartActions({ big = false }: { big?: boolean }) {
  return (
    <div class="start-actions">
      {/* The everyday route, and so the loud one. It is labelled with what
          happens rather than with the name of the screen it opens: "Quick
          guide" means nothing to somebody who has never used this. */}
      <button class={`btn${big ? ' btn-lg' : ''}`} onClick={() => navigate('quick')}>
        Guide me to a distance
      </button>
      <button class={`btn btn-ghost${big ? ' btn-lg' : ''}`} onClick={() => createSetup()}>
        Save a setup
      </button>
    </div>
  );
}

/**
 * First run: nothing saved, and no device answering — which for a newcomer is
 * not a fault but the only state they *can* be in, because the phone cannot
 * reach a device whose network it has not joined yet.
 *
 * So this is where the app finally says the three things it never said
 * anywhere: what it is for, that half of it is a physical device, and that
 * the phone has to join that device's own Wi-Fi before anything works.
 */
function Welcome({ status }: { status: ConnectionStatus }) {
  return (
    <section class="welcome">
      <p class="home-lede">
        LightGuide puts a light stand exactly where you want it — 50 cm from your subject, or 80,
        or whatever the shot needs — instead of guessing by eye.
      </p>
      <p class="home-lede">
        It is two pieces. The <strong>LightGuide device</strong> sits by your subject and measures
        how far away the light is and how bright it is. This page reads the device and tells you
        which way to move the stand, and how far, until it is where you asked for.
      </p>

      <h2 class="home-h2" id="first-run-steps">
        Setting it up the first time
      </h2>
      <ol class="steps" aria-labelledby="first-run-steps">
        <li class="step">
          <span class="step-n" aria-hidden="true">
            1
          </span>
          <div>
            <div class="step-title">Switch the device on</div>
            <div class="step-copy">Give it a few seconds to wake up.</div>
          </div>
        </li>
        <li class="step">
          <span class="step-n" aria-hidden="true">
            2
          </span>
          <div>
            <div class="step-title">Join the device's Wi-Fi on this phone</div>
            <div class="step-copy">
              Open your phone's Wi-Fi settings and pick the <strong>LightGuide</strong> network.
              The device makes its own network and this page talks straight to it — so there is no
              internet while you are using it, and there does not need to be. That is normal, not a
              fault.
            </div>
          </div>
        </li>
        <li class="step">
          <span class="step-n" aria-hidden="true">
            3
          </span>
          <div>
            <div class="step-title">Come back to this page</div>
            <div class="step-copy">
              The dot at the top of the screen turns green when the device is talking, and this
              page will offer you a distance to aim for.
            </div>
          </div>
        </li>
      </ol>

      <StatusLine status={status} absent="No device yet" />

      <h2 class="home-h2" id="two-ways">
        Then there are two ways to work
      </h2>
      <div class="ways" aria-labelledby="two-ways">
        <div class="way">
          <div class="way-title">Guide me to a distance</div>
          <div class="way-copy">
            Type the number you want. The device measures, and the page talks you in — "move
            10.6 cm closer" — and buzzes when the stand is there. Nothing is kept. This is the one
            you will use most.
          </div>
        </div>
        <div class="way">
          <div class="way-title">Save a setup</div>
          <div class="way-copy">
            Give a distance a name — "Portrait key" — and it waits here for you. Setups can hold
            how bright the light was too, so a look you found in March can be set up again in
            November.
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The device is answering and nothing is saved. The Wi-Fi step has visibly
 * worked, so it is not repeated; what is left is the invitation to start.
 */
function Ready() {
  return (
    <section class="ready">
      <p class="home-lede">
        Your device is connected. Tell it how far from your subject you want the light, and it
        will talk you into position.
      </p>
      <StartActions big />
      <p class="hint home-hint">
        Guiding is instant and keeps nothing. Save a setup when it is a distance you will want
        again.
      </p>
    </section>
  );
}

/**
 * Somebody who has saved setups knows what this is, so the introduction
 * collapses to the two actions and one line of orientation. Their list is
 * directly below, which is what they opened the app for.
 */
function Working() {
  return (
    <section class="start-band">
      <p class="start-copy">
        Pick a distance and LightGuide talks the stand into position — or start from one of your
        saved setups below.
      </p>
      <StartActions />
    </section>
  );
}

/** The device has been asked and has not answered yet. Says only that. */
function Looking() {
  return (
    <section class="looking">
      <p class="home-lede">Looking for your LightGuide device…</p>
    </section>
  );
}

export function HomeIntro({ state, status }: { state: HomeState; status: ConnectionStatus }) {
  return (
    <>
      <h1 class="home-h1">Place a light</h1>
      {state === 'welcome' && <Welcome status={status} />}
      {state === 'ready' && <Ready />}
      {state === 'working' && <Working />}
      {state === 'looking' && <Looking />}
    </>
  );
}

/**
 * The two reference panels below the setups list.
 *
 * They exist for two reasons at once. The screen asked for them: one saved
 * setup on a 1280×720 window left the bottom half of the page blank, and
 * blank space at the foot of a page reads as an unfinished app. And the
 * content asked for them: the fact that the phone is on the device's own
 * network — the single most load-bearing thing about operating this product —
 * was written down nowhere a user could see, and putting it only in the
 * first-run panel would hide it from the person most likely to need it later,
 * whose phone has quietly wandered back onto the studio Wi-Fi.
 *
 * Deliberately not shown on first run: the welcome panel above already says
 * all of it, at more length and in the right order.
 */
export function HomeReference({ status }: { status: ConnectionStatus }) {
  return (
    <div class="info-grid">
      <section class="info-card" aria-labelledby="how-it-works">
        <h2 class="info-title" id="how-it-works">
          How placing a light works
        </h2>
        <ol class="steps steps-tight">
          <li class="step">
            <span class="step-n" aria-hidden="true">
              1
            </span>
            <div class="step-copy">
              Say how far from your subject the light should be — type a number, or start one of
              your saved setups.
            </div>
          </li>
          <li class="step">
            <span class="step-n" aria-hidden="true">
              2
            </span>
            <div class="step-copy">
              Put the stand roughly where you think it goes. The device measures the gap ten times
              a second.
            </div>
          </li>
          <li class="step">
            <span class="step-n" aria-hidden="true">
              3
            </span>
            <div class="step-copy">
              The page tells you which way to move and by how much, and buzzes once the stand is
              inside the tolerance you set. You can leave this page and it keeps guiding.
            </div>
          </li>
        </ol>
      </section>

      <section class="info-card" aria-labelledby="about-device">
        <h2 class="info-title" id="about-device">
          Your device
        </h2>
        {/* Status only. The recovery steps deliberately are not repeated here:
            whenever this card can say "not connected", the standing banner
            further up the same page is already carrying them, and printing
            the same thirty words twice on one screen teaches the reader to
            skip both. */}
        <StatusLine status={status} absent="Not connected" />
        <p class="info-copy">
          While you are using LightGuide your phone is joined to the device's own Wi-Fi network,
          not to the internet. Everything you save lives on the device itself, and nothing here
          goes online.
        </p>
      </section>
    </div>
  );
}
