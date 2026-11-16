import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

// Run the real native pipeline with delayed filesystem operations. Native modules
// cannot load in Node; this exercises ordering, rollback and registration only.
const source = stripTypeScriptTypes(
  readFileSync(new URL("../src/media/media.ts", import.meta.url), "utf8"),
)
  .replace(/^import(?:[\s\S]*?);\r?\n/gm, "")
  .replace(/export /g, "");
function harness(failMove = false, failCopy = false) {
  const files = new Set(["file:source", "file:resized"]);
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => p.uri ?? p).join("/");
    }
    get exists() {
      return files.has(this.uri);
    }
    async copy(to: File) {
      await new Promise((r) => setTimeout(r, 5));
      if (failCopy) throw new Error("copy rejected");
      files.add(to.uri);
    }
    async bytes() {
      if (!this.exists) throw new Error("ENOENT");
      return new Uint8Array([1, 2, 3]);
    }
    async move(to: File) {
      await new Promise((r) => setTimeout(r, 5));
      if (failMove) throw new Error("move rejected");
      files.add(to.uri);
      files.delete(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  class Directory {
    uri = "documents/photos";
    exists = true;
  }
  const context: any = {
    require: () => 0,
    Asset: { fromModule: () => ({ uri: "demo" }) },
    DEMO_RESULT_IMAGE_ID: "demo-result",
    DEMO_PLACEMENT_IMAGE_ID: "demo-placement",
    File,
    Directory,
    Paths: { cache: "cache", document: "documents" },
    Picker: {
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ uri: "file:source", width: 100, height: 100 }],
      }),
    },
    manipulateAsync: async () => ({
      uri: "file:resized",
      width: 100,
      height: 100,
    }),
    SaveFormat: { JPEG: "jpeg" },
    CryptoDigestAlgorithm: { SHA256: "sha256" },
    digest: async () => new Uint8Array(32),
    randomUUID: () => "11111111-1111-1111-1111-111111111111",
  };
  const pick = runInNewContext(source + "\npickPhoto;", context);
  let registrations = 0;
  const repo = {
    registerImage(row: any) {
      assert.ok(files.has("documents/photos/" + row.optimised_path));
      assert.ok(files.has("documents/photos/" + row.original_path));
      registrations++;
    },
  };
  return { pick: () => pick(repo), files, registrations: () => registrations };
}
test("photo is copied and moved completely before database registration", async () => {
  const h = harness();
  await h.pick();
  assert.equal(h.registrations(), 1);
});
for (const failure of ["copy", "move"])
  test(`${failure} failure leaves no registered or partial photo`, async () => {
    const h = harness(failure === "move", failure === "copy");
    await assert.rejects(h.pick(), /Could not save this photo/);
    assert.equal(h.registrations(), 0);
    assert.deepEqual([...h.files].sort(), ["file:resized", "file:source"]);
  });
