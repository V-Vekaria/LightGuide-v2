// Checks the node firmware against the Android app's Protocol v2 code, without
// changing the app:
//   1. every sample payload printed by `host_tests --emit-samples` is accepted
//      by the app's own parsers (apps/mobile/src/device/protocol.ts);
//   2. the GATT name and UUIDs in node_config.h equal the app's constants;
//   3. every payload fits one notification at Android's 517-byte ATT MTU.
//
// Usage: node conformance.mjs <samples.tsv>
// Needs Node >= 22.18 / 23.6 (built-in TypeScript type stripping).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const protocol = await import(pathToFileURL(resolve(repo, "apps/mobile/src/device/protocol.ts")).href);

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL ${msg}`);
};

// 1. Payloads
const parsers = {
  device_info: protocol.parseDeviceInfo,
  measurement: protocol.parseMeasurement,
  event: protocol.parseEvent,
  status: protocol.parseStatus,
};
const samples = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/);
let parsed = 0;
for (const line of samples) {
  const [kind, payload] = line.split("\t");
  try {
    const value = parsers[kind](payload);
    parsed++;
    if (kind === "measurement") {
      const raw = JSON.parse(payload);
      if (value.spectral.length !== 13) fail(`spectral length ${value.spectral.length}`);
      if (!value.tof_valid && value.distance_mm !== 0) fail("invalid ToF not zeroed");
      if (!value.spectral_valid && raw.spectral.some((x) => x !== 0)) fail("invalid spectrum not zeroed");
    }
  } catch (e) {
    fail(`${kind} rejected by the app parser: ${e.message}\n  ${payload}`);
  }
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > 514) fail(`${kind} is ${bytes} bytes, over one 517-MTU notification`);
}
console.log(`payloads: ${parsed}/${samples.length} accepted by apps/mobile/src/device/protocol.ts`);

// A payload with another major version must be rejected by the app.
try {
  protocol.parseStatus(samples.find((l) => l.startsWith("status")).split("\t")[1].replace('"v":2', '"v":3'));
  fail("app accepted v:3");
} catch {
  /* expected */
}

// Command encoding from the app is what the firmware parses (see host tests).
const cmd = protocol.encodeCommand("request_status");
if (cmd !== '{"v":2,"type":"command","command":"request_status"}') fail(`unexpected command ${cmd}`);

// 2. GATT identifiers
const config = readFileSync(resolve(here, "../LightGuideNode/node_config.h"), "utf8");
const define = (name) => {
  const m = config.match(new RegExp(`#define ${name} "([^"]+)"`));
  return m ? m[1] : undefined;
};
const expected = {
  LG_BLE_NAME: protocol.LIGHTGUIDE_LOCAL_NAME,
  LG_UUID_SERVICE: protocol.LIGHTGUIDE_UUIDS.service,
  LG_UUID_DEVICE_INFO: protocol.LIGHTGUIDE_UUIDS.deviceInfo,
  LG_UUID_MEASUREMENT: protocol.LIGHTGUIDE_UUIDS.measurement,
  LG_UUID_EVENT: protocol.LIGHTGUIDE_UUIDS.event,
  LG_UUID_COMMAND: protocol.LIGHTGUIDE_UUIDS.command,
  LG_UUID_STATUS: protocol.LIGHTGUIDE_UUIDS.status,
};
for (const [name, value] of Object.entries(expected)) {
  if (define(name) !== value) fail(`${name} is ${define(name)}, app expects ${value}`);
}
if (protocol.LIGHTGUIDE_PROTOCOL_VERSION !== 2) fail("app protocol version is not 2");
console.log(`GATT identifiers: ${Object.keys(expected).length} checked against the app`);

// Channel order: the firmware's names equal the protocol document's order.
const doc = readFileSync(resolve(repo, "docs/engineering/DEVICE_PROTOCOL.md"), "utf8");
const order = ["f1_405", "f2_425", "fz_450", "f3_475", "f4_515", "f5_550", "fy_555",
  "fxl_600", "f6_640", "f7_690", "f8_745", "nir_855", "clear"];
const docOrder = doc.match(/fixed order: (.*?)\. Each value/)[1].match(/`([a-z0-9_]+)`/g).map((s) => s.slice(1, -1));
if (JSON.stringify(docOrder) !== JSON.stringify(order)) fail(`doc channel order ${docOrder}`);
const fw = readFileSync(resolve(here, "../LightGuideNode/src/lg_protocol.cpp"), "utf8");
const fwOrder = [...fw.matchAll(/"([a-z0-9]+_[0-9]+|clear)"/g)].map((m) => m[1]).slice(0, 13);
if (JSON.stringify(fwOrder) !== JSON.stringify(order)) fail(`firmware channel order ${fwOrder}`);
// The driver channels actually read, in array order (AS_BANDS in the sketch).
const ino = readFileSync(resolve(here, "../LightGuideNode/lg_node.cpp"), "utf8");
const bands = ino.match(/AS_BANDS\[lg::kSpectralChannels\] = \{([^}]*)\}/)[1]
  .match(/AS7343_CHANNEL_\w+/g).map((s) => s.replace("AS7343_CHANNEL_", ""));
const expectedBands = ["F1", "F2", "FZ", "F3", "F4", "F5", "FY", "FXL", "F6", "F7", "F8", "NIR", "VIS_TL_0"];
if (JSON.stringify(bands) !== JSON.stringify(expectedBands)) fail(`AS_BANDS order ${bands}`);
console.log("spectral channel order: firmware names and AS_BANDS == DEVICE_PROTOCOL.md");

if (failures) {
  console.error(`${failures} conformance failure(s)`);
  process.exit(1);
}
console.log("conformance OK");
