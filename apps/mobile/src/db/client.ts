import { openExpoDriver } from './driver.expo';
import type { SqlDriver } from './driver';
import { migrate } from './migrate';

/**
 * App-runtime entry point: opens the on-device database and migrates it.
 * Not imported by any test - tests use driver.node.ts + migrate() directly
 * against a real temp file so they never need the Expo/React Native runtime.
 */
let client: SqlDriver | null = null;

export function getDb(): SqlDriver {
  if (!client) {
    client = openExpoDriver('lightguide.db');
    migrate(client);
  }
  return client;
}
