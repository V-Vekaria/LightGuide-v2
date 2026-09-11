// Narrow fixes for expo-sqlite 57.0.2's experimental web worker channel.
// Native SQLite is untouched. Fail on source drift so upgrades require review.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const path = "node_modules/expo-sqlite/web/WorkerChannel.ts";
let source = readFileSync(path, "utf8");
const changes = [
  [
    "resultArray.set(new Uint32Array([length]), 0);",
    "new DataView(resultBuffer).setUint32(0, length, true);",
  ],
  ["let i = 0;", "const deadline = performance.now() + 10_000;"],
  [
    "    ++i;",
    "    if (performance.now() > deadline) throw new Error('SQLite worker did not respond within 10 seconds');",
  ],
  [
    "      if (i > 1_000_000) {\n        throw new Error('Sync operation timeout');\n      }",
    "      // Use elapsed time; loop counts vary dramatically between CPUs.",
  ],
  [
    "      if (i > 1000_000_000) {\n        throw new Error('Sync operation timeout');\n      }",
    "      // The same wall-clock deadline also applies without Atomics.pause.",
  ],
];
for (const [before, after] of changes) {
  if (source.includes(before)) source = source.replace(before, after);
  else if (!source.includes(after))
    throw new Error(
      "Review the expo-sqlite web patch against the installed version.",
    );
}
writeFileSync(path, source);
// query-string 7 expects a CommonJS decoder; the patched decoder is ESM.
const queryPath = createRequire(
  require.resolve("expo-router/package.json"),
).resolve("query-string");
const query = readFileSync(queryPath, "utf8");
const before = "const decodeComponent = require('decode-uri-component');";
const after =
  "const decoderModule = require('decode-uri-component');\nconst decodeComponent = decoderModule.default ?? decoderModule;";
if (query.includes(before))
  writeFileSync(queryPath, query.replace(before, after));
else if (!query.includes(after))
  throw new Error("Review the query-string decoder compatibility patch.");
