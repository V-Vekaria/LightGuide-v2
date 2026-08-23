import type { ConnectionStatus } from '../contract/types';
import type { Screen } from '../store/store';

/**
 * What the app calls its five screens, and what the home screen resolves to.
 *
 * Both are pure, and both live here rather than inside a component, because
 * they answer questions the app used to answer nowhere: *what is this page
 * called* and *what should someone who has just opened the app be looking at*.
 */

/* ---------- screen names ---------- */

/**
 * The user-facing name of each screen.
 *
 * The app has no router and no tab bar, so before this there was no place a
 * screen's name could be written down — three of the four had only a heading,
 * and `live` had not even that (its heading is the setup being guided).
 * These names are what goes in the browser/phone title bar, which is also the
 * label the phone's task switcher and the back-history menu use.
 *
 * `new` deliberately has no entry: it is two screens wearing one id, and only
 * `editingSetupId` can say which. See `screenTitle`.
 */
export const SCREEN_NAMES: Record<Exclude<Screen, 'new'>, string> = {
  home: 'Home',
  quick: 'Quick guide',
  live: 'Guiding',
  device: 'Device',
};

const APP_NAME = 'LightGuide';

/**
 * The document title for a screen: "Quick guide · LightGuide".
 *
 * Home is the bare app name — a title bar reading "Home · LightGuide" says
 * nothing the app name did not already say, and this is the string a phone
 * shows under the app in its task switcher.
 */
export function screenTitle(screen: Screen, editing: boolean = false): string {
  if (screen === 'home') return APP_NAME;
  const name = screen === 'new' ? (editing ? 'Edit setup' : 'New setup') : SCREEN_NAMES[screen];
  return `${name} · ${APP_NAME}`;
}

/* ---------- what the home screen shows ---------- */

/**
 * Which version of the home screen a visitor gets.
 *
 * The app opened on a table of saved setups that silently assumed the visitor
 * already knew what LightGuide was and already had data. A first-time
 * photographer saw an empty table, a red "disconnected" chip and four dashes,
 * and nothing anywhere said that a physical device exists or that their phone
 * has to join its Wi-Fi before any of it works.
 *
 * The fix is not a separate landing screen. A returning photographer opens
 * this app mid-shoot to tap a saved setup and start guiding; making them click
 * past an introduction to reach it — every time, forever, to serve a one-time
 * need — is a worse bargain than the one it replaces. So there is one home,
 * and *it* changes.
 *
 * It changes on observable state, never on a "has seen the intro" flag. That
 * distinction is the whole design:
 *
 *  - A flag is per-browser. The same photographer on the studio's second phone
 *    is a first-time user again, and the flag says otherwise.
 *  - A flag answers the wrong question. Someone whose phone has slipped off
 *    the device's network is in exactly the newcomer's situation and needs
 *    exactly the newcomer's instructions — and a flag is precisely what would
 *    hide them.
 *
 * Two inputs decide it, and both are things the app can see for itself.
 */
export interface HomeInputs {
  /** The live device connection. */
  status: ConnectionStatus;
  /** How many setups are saved — tombstones already filtered out. */
  setupCount: number;
  /**
   * Whether the device has been asked for its setups and has answered, one
   * way or the other. False only during the first moments after the app
   * opens.
   */
  setupsChecked: boolean;
}

export type HomeState =
  /**
   * The opening instant: the app has asked the device for its setups and has
   * no answer yet. Deliberately its own state rather than being folded into
   * `welcome`, because "we do not know yet" and "there is nothing here" are
   * different facts and the wrong one is expensive: a returning photographer
   * would get a flash of first-run instructions on every launch.
   */
  | 'looking'
  /**
   * Nothing saved, no device. For a newcomer this is not a failure — it is
   * the normal starting state, because the phone cannot reach a device it has
   * not joined the Wi-Fi of yet. So this is where the app explains itself:
   * what LightGuide is, that a physical device is half of it, and how to join
   * its network.
   */
  | 'welcome'
  /**
   * The device is talking and nothing is saved. The Wi-Fi instructions have
   * demonstrably worked, so they are not repeated; what is left is showing
   * the two ways to start.
   */
  | 'ready'
  /**
   * There are saved setups, so the product has been understood and used.
   * The introduction shrinks to a band of actions above the list.
   */
  | 'working';

/**
 * Resolves the home screen's shape from what the app can observe.
 *
 * Order matters, and this is the order:
 *
 *  1. **Any saved setup wins.** Someone with setups has used this before, and
 *     that is true whether or not the device is answering right now — a
 *     photographer whose device is switched off should still see their list,
 *     not an introduction to a product they already own.
 *  2. **Nothing is claimed before the device has answered.** Saying "you have
 *     no setups" while the question is still in flight is a guess, and it is
 *     the guess that flashes an introduction at an established user.
 *  3. **Connected and empty is `ready`**, not `welcome`: the connection is
 *     proof the Wi-Fi step is already done.
 *  4. Otherwise `welcome` — empty, and no device to be found.
 */
export function resolveHomeState(input: HomeInputs): HomeState {
  if (input.setupCount > 0) return 'working';
  if (!input.setupsChecked) return 'looking';
  return input.status === 'connected' ? 'ready' : 'welcome';
}

/**
 * Whether the home screen should show the live sensor strip.
 *
 * Four tiles reading "—", "—", "—" and "0" are the first thing a newcomer
 * currently meets, and they measure nothing: there is no device to read and
 * nothing saved to count. They are withheld in that one state and in no other
 * — this hides an empty instrument, never a live one, and the moment there is
 * anything to say the strip is back.
 */
export function showsLiveStrip(state: HomeState): boolean {
  return state !== 'welcome' && state !== 'looking';
}

/**
 * Whether the home screen should show the standing "device isn't connected"
 * banner.
 *
 * Suppressed in `welcome` alone. Not being connected is what `welcome`
 * *means* — the phone has not joined the device's network yet — so the
 * warning is describing the expected state as a fault, and the panel beneath
 * it already explains the same thing at length and in the right tone. Every
 * other state keeps the banner exactly as it was.
 */
export function showsConnectionBanner(state: HomeState): boolean {
  return state !== 'welcome';
}
