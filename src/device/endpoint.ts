/**
 * Where the device is.
 *
 * The shipped product has no address bar in it: the phone joins the device's
 * own access point, opens its address, and the app is *served by the device*.
 * Same origin, zero setup, and that path must never grow a step — which is why
 * the default here is the empty string and not a stored value that could be
 * missing on first run.
 *
 * The second path exists for the bench. A laptop on the studio network, or a
 * phone that is on the same LAN as the device rather than joined to its AP,
 * cannot use the same-origin route at all; without a way to name an address,
 * demonstrating the product from a laptop means re-juggling Wi-Fi every time.
 * So an address can be typed, and once validated it is remembered.
 *
 * Everything in here is pure except the two storage functions, which are the
 * only place `localStorage` is touched.
 */

/**
 * The default: talk to whoever served this page.
 *
 * The empty string is what `HttpDeviceClient` already means by same-origin, so
 * this is a name for an existing convention rather than a new one.
 */
export const SAME_ORIGIN = '';

/**
 * Where a chosen address is remembered.
 *
 * Versioned in the name (`.v1`) because this value is read by whatever app
 * version happens to be cached in a browser months from now. If the shape ever
 * changes, a new key is a clean break, whereas a silently reinterpreted old
 * value is a device address that points somewhere nobody chose.
 */
export const ADDRESS_STORAGE_KEY = 'lightguide.device-address.v1';

/**
 * Turns whatever a customer typed into an origin, or null if it cannot be one.
 *
 * Deliberately forgiving about the things people actually type and strict
 * about the things that are not addresses:
 *
 *  - a bare host or IP gets `http://` — the device serves plain HTTP on its
 *    own access point, and nobody types a scheme
 *  - a port is kept (`192.168.4.1:8080`), a default port is dropped
 *  - a pasted path or query is discarded rather than rejected: somebody who
 *    copies `http://192.168.4.1/index.html` out of a browser bar has told us
 *    exactly which device they mean
 *  - anything that is not http(s) is refused, so a `javascript:` or `file:`
 *    string can never become an address the app fetches from
 *  - embedded credentials are refused: `http://user:pass@host` is never a
 *    thing a photographer meant to type, and quietly storing a password is
 *    worse than saying no
 */
export function normaliseAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Whitespace inside is always a typo (or two addresses pasted together).
  // URL parsing would silently percent-encode it into a host that cannot
  // resolve, which turns a typo into "the device didn't answer".
  if (/\s/.test(trimmed)) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname === '') return null;
  if (url.username !== '' || url.password !== '') return null;

  return url.origin;
}

/**
 * The host part of an origin, for showing a customer which device they are
 * pointed at. Null for same-origin, which has no address to show — the caller
 * knows its own location and what to call it.
 */
export function hostOf(origin: string): string | null {
  if (origin === SAME_ORIGIN) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * The remembered address, or null for "use whoever served the page".
 *
 * Re-normalised on the way out, not trusted as stored. The value survives app
 * updates and can be edited by hand in devtools, and a malformed one must
 * degrade to the zero-setup default rather than to a fetch against garbage.
 */
export function readStoredAddress(): string | null {
  try {
    const stored = localStorage.getItem(ADDRESS_STORAGE_KEY);
    if (stored === null) return null;
    return normaliseAddress(stored);
  } catch {
    // Storage can throw outright (Safari private browsing, disabled cookies).
    // Falling back to same-origin is the correct failure: it is the shipped
    // configuration, and it needs no storage at all.
    return null;
  }
}

/** Remembers an address, or forgets it when given null. Never throws. */
export function writeStoredAddress(origin: string | null): void {
  try {
    if (origin === null || origin === SAME_ORIGIN) {
      localStorage.removeItem(ADDRESS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ADDRESS_STORAGE_KEY, origin);
  } catch {
    // Losing the preference is survivable — the app still works this session,
    // and same-origin is what it falls back to next time. Failing the
    // connection over it would not be.
  }
}
