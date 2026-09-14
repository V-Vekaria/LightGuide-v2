// Linux fallback: extract the npm-distributed Chromium without changing file owners.
import chromium from "@sparticuz/chromium";
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
const dir = resolve("artifacts/browser");
mkdirSync(dir, { recursive: true });
if (!existsSync(dir + "/chromium")) {
  for (const name of ["chromium", "swiftshader.tar", "fonts.tar"])
    await pipeline(
      createReadStream("node_modules/@sparticuz/chromium/bin/" + name + ".br"),
      createBrotliDecompress(),
      createWriteStream(dir + "/" + name),
    );
  chmodSync(dir + "/chromium", 0o700);
  mkdirSync(dir + "/fonts", { recursive: true });
  for (const [archive, target] of [
    ["swiftshader.tar", dir],
    ["fonts.tar", dir + "/fonts"],
  ]) {
    const extraction = spawnSync(
      "tar",
      ["--no-same-owner", "-xf", dir + "/" + archive, "-C", target],
      { stdio: "inherit" },
    );
    if (extraction.status !== 0) process.exit(1);
  }
}
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CHROMIUM_EXECUTABLE: dir + "/chromium",
      CHROMIUM_ARGS: JSON.stringify(chromium.args),
      LD_LIBRARY_PATH: dir,
      FONTCONFIG_PATH: existsSync("/etc/fonts/fonts.conf")
        ? "/etc/fonts"
        : dir + "/fonts",
    },
  },
);
process.exit(result.status ?? 1);
