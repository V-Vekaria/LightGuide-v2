import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ADDRESS_STORAGE_KEY,
  SAME_ORIGIN,
  hostOf,
  normaliseAddress,
  readStoredAddress,
  writeStoredAddress,
} from './endpoint';

describe('normaliseAddress', () => {
  it('accepts a bare IP and assumes plain HTTP', () => {
    // Nobody types a scheme, and the device serves plain HTTP on its own
    // access point — there is no certificate on a board.
    expect(normaliseAddress('192.168.4.1')).toBe('http://192.168.4.1');
  });

  it('keeps an explicit port and drops a default one', () => {
    expect(normaliseAddress('192.168.4.1:8080')).toBe('http://192.168.4.1:8080');
    expect(normaliseAddress('http://192.168.4.1:80')).toBe('http://192.168.4.1');
  });

  it('accepts a hostname, which is what an mDNS name looks like', () => {
    expect(normaliseAddress('lightguide.local')).toBe('http://lightguide.local');
  });

  it('keeps an explicit https, for a device reached through something else', () => {
    expect(normaliseAddress('https://lightguide.local')).toBe('https://lightguide.local');
  });

  it('discards a pasted path or query rather than refusing the address', () => {
    // Somebody copying out of a browser bar has told us exactly which device
    // they mean. Refusing that would be pedantry with a cost.
    expect(normaliseAddress('http://192.168.4.1/index.html')).toBe('http://192.168.4.1');
    expect(normaliseAddress('192.168.4.1/?x=1')).toBe('http://192.168.4.1');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseAddress('  192.168.4.1  ')).toBe('http://192.168.4.1');
  });

  it('refuses whitespace inside, which is always a typo', () => {
    // URL parsing would percent-encode it into a host that cannot resolve,
    // turning "I typed it wrong" into "the device didn't answer".
    expect(normaliseAddress('192.168.4.1 8080')).toBeNull();
    expect(normaliseAddress('192.168 .4.1')).toBeNull();
  });

  it('refuses an empty or blank address', () => {
    expect(normaliseAddress('')).toBeNull();
    expect(normaliseAddress('   ')).toBeNull();
  });

  it('refuses any scheme that is not http or https', () => {
    // The value ends up in fetch(). A javascript: or file: string must never
    // survive this function.
    expect(normaliseAddress('javascript:alert(1)')).toBeNull();
    expect(normaliseAddress('file:///etc/passwd')).toBeNull();
    expect(normaliseAddress('ftp://192.168.4.1')).toBeNull();
    expect(normaliseAddress('ws://192.168.4.1')).toBeNull();
  });

  it('refuses embedded credentials rather than storing a password', () => {
    expect(normaliseAddress('http://user:secret@192.168.4.1')).toBeNull();
  });

  it('refuses a scheme with nothing after it', () => {
    expect(normaliseAddress('http://')).toBeNull();
  });
});

describe('hostOf', () => {
  it('names the host of a real address', () => {
    expect(hostOf('http://192.168.4.1')).toBe('192.168.4.1');
    expect(hostOf('http://192.168.4.1:8080')).toBe('192.168.4.1:8080');
  });

  it('has nothing to say about same-origin', () => {
    // There is no address to quote: the page came from the device.
    expect(hostOf(SAME_ORIGIN)).toBeNull();
  });

  it('returns null rather than throwing on a value that is not an origin', () => {
    expect(hostOf('not an origin')).toBeNull();
  });
});

describe('the remembered address', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is null when nothing has been chosen — the zero-setup default', () => {
    expect(readStoredAddress()).toBeNull();
  });

  it('round-trips an address', () => {
    writeStoredAddress('http://192.168.4.1:8080');
    expect(readStoredAddress()).toBe('http://192.168.4.1:8080');
  });

  it('forgets the address when given null or same-origin', () => {
    writeStoredAddress('http://192.168.4.1');
    writeStoredAddress(null);
    expect(readStoredAddress()).toBeNull();

    writeStoredAddress('http://192.168.4.1');
    writeStoredAddress(SAME_ORIGIN);
    expect(readStoredAddress()).toBeNull();
    expect(localStorage.getItem(ADDRESS_STORAGE_KEY)).toBeNull();
  });

  it('re-validates on the way out, so a hand-edited value cannot be fetched', () => {
    // The key survives app updates and is editable in devtools. A stored
    // javascript: URL must degrade to the shipped default, not to a fetch.
    localStorage.setItem(ADDRESS_STORAGE_KEY, 'javascript:alert(1)');
    expect(readStoredAddress()).toBeNull();
  });

  it('normalises a stored value that was written in a looser form', () => {
    localStorage.setItem(ADDRESS_STORAGE_KEY, '192.168.4.1/');
    expect(readStoredAddress()).toBe('http://192.168.4.1');
  });

  it('falls back to same-origin when storage itself throws', () => {
    // Safari private browsing and disabled cookies both throw on access.
    // Same-origin needs no storage at all, so it is the correct failure.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readStoredAddress()).toBeNull();
  });

  it('does not throw when storage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeStoredAddress('http://192.168.4.1')).not.toThrow();
  });
});

describe('what gets remembered', () => {
  /**
   * `openDevice` writes through `writeStoredAddress`, and these are the rules
   * that decide whether it writes at all. They are asserted here, against the
   * storage functions directly, because the consequence of getting them wrong
   * is not visible until the next launch — by which time the app is pointed at
   * an address nobody chose.
   */
  beforeEach(() => {
    localStorage.clear();
  });

  it('storing same-origin is the same act as forgetting', () => {
    // Which is what makes "go back to the device that served this page" a
    // reset rather than another address to get wrong.
    writeStoredAddress('http://192.168.4.1');
    writeStoredAddress(SAME_ORIGIN);
    expect(localStorage.getItem(ADDRESS_STORAGE_KEY)).toBeNull();
    expect(readStoredAddress()).toBeNull();
  });

  it('a remembered address survives being read back as an origin, not as typed', () => {
    // The app compares the stored value against `deviceAddress`, which is
    // always an origin. A stored value in some looser form would never match.
    writeStoredAddress(normaliseAddress('192.168.4.1:8080')!);
    expect(readStoredAddress()).toBe(normaliseAddress('http://192.168.4.1:8080/'));
  });
});
