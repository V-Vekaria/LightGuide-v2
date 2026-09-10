import type { Uuid } from './types';

/**
 * UUIDs are generated on the phone for product records (DATABASE_SCHEMA.md
 * "Type and ownership conventions"). Prefers the platform's real random UUID
 * (available in Node for tests, and in the Hermes/Expo runtime) and falls
 * back to a Math.random-based RFC 4122 v4 generator only if neither exists.
 */
export function newUuid(): Uuid {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  let uuid = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += ((Math.random() * 4) | 8).toString(16);
    } else {
      uuid += Math.floor(Math.random() * 16).toString(16);
    }
  }
  return uuid;
}

export function nowIso(): string {
  return new Date().toISOString();
}
