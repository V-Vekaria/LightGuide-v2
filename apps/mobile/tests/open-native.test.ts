import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

// Expo native modules cannot load in Node. Execute the actual initializer with
// controlled SQLite/seed failures to verify retry and singleton publication.
const source = stripTypeScriptTypes(
  readFileSync(new URL("../src/data/open.ts", import.meta.url), "utf8"),
).replace(/^import(?:[\s\S]*?);\r?\n/gm, "").replace(/export /g, "");
test("failed first-run seed closes SQLite and permits a concurrent-safe retry", async () => {
  let opens = 0, closes = 0, seeds = 0;
  class Repository {
    ensureAcceptanceSeed() {
      if (++seeds === 1) throw new Error("disk full");
    }
  }
  const open = runInNewContext(source + "\nopenRepository;", {
    Repository,
    randomUUID: () => "id",
    openDatabaseAsync: async () => {
      opens++;
      return { closeSync: () => { closes++; } };
    },
  }) as () => Promise<Repository>;
  const first = await Promise.allSettled([open(), open()]);
  assert.ok(first.every((result) => result.status === "rejected"));
  assert.equal(opens, 1);
  assert.equal(closes, 1);
  const [a, b] = await Promise.all([open(), open()]);
  assert.equal(a, b);
  assert.equal(await open(), a);
  assert.equal(opens, 2);
  assert.equal(seeds, 2);
  assert.equal(closes, 1);
});
