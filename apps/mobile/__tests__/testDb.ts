import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openNodeDriver } from '../src/db/driver.node';
import { migrate } from '../src/db/migrate';
import type { SqlDriver } from '../src/db/driver';

/**
 * Windows sometimes holds the WAL/SHM sidecar files open for a brief moment
 * after DatabaseSync.close() returns, which makes an immediate rmSync EPERM
 * even though the data itself is already durably committed (that part is
 * what the tests using this actually verify). Retrying a few times with a
 * short synchronous wait is a pragmatic fix for this test-only cleanup path.
 */
function rmrfWithRetry(dir: string, attempts = 20, delayMs = 150): void {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === attempts) {
        // The durability assertions this helper supports have already run
        // and passed by the time cleanup executes (it's always in a
        // try/finally after the test body). A leftover OS temp directory on
        // a machine whose AV/indexer is holding the file open a little
        // longer than expected is a harness annoyance, not evidence against
        // the thing under test - so warn instead of failing the suite.
        // eslint-disable-next-line no-console
        console.warn(`testDb cleanup: could not remove ${dir} after ${attempts} attempts (${String(err)}); leaving it for OS temp cleanup.`);
        return;
      }
      const until = Date.now() + delayMs;
      while (Date.now() < until) {
        // Deliberate synchronous busy-wait: this is test cleanup, not
        // production code, and keeping it synchronous keeps callers simple.
      }
    }
  }
}

/** A real, file-backed (never :memory:) migrated database for restart-durability tests. */
export function openTestDbFile(): { driver: SqlDriver; filePath: string; cleanup: () => void } {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lightguide-test-')), 'lightguide.db');
  const driver = openNodeDriver(filePath);
  migrate(driver);
  return {
    driver,
    filePath,
    cleanup: () => {
      rmrfWithRetry(path.dirname(filePath));
    },
  };
}

export function openTestDbMemory(): SqlDriver {
  const driver = openNodeDriver(':memory:');
  migrate(driver);
  return driver;
}
