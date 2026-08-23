// Mock ESP32. Implements the same HTTP + WS surface the firmware will.
// Replays real v1 traces at 10 Hz. The traces carry genuine sensor noise,
// but no dropouts at all: the full v1 capture had missed=1 on 0 of its 1832
// rows, and the ~181 rows vendored here under traces/ inherit that. Default
// replay therefore never exercises the null-distance path — set
// MOCK_DROPOUT_PCT to inject dropouts and exercise it.
//
// Run as a script (`node mock-device/server.mjs`) for manual use on :8080, or
// import `createMockDevice()` to start an isolated instance — its own port,
// its own store — which is how the conformance suite gets a clean device to
// run against without a server anyone started by hand.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE = join(DIR, 'setups.json');
const DEFAULT_TRACES = join(DIR, 'traces');
const DEFAULT_PORT = 8080;
const ADC_MAX = 4095;      // 12-bit, matches v1 calibration
const AMBIENT = 0.06;      // simulated ambient level, 0..1
const FRAME_INTERVAL_MS = 100;

// --- identity ---------------------------------------------------------------

/**
 * What GET /api/info answers with.
 *
 * The version of the *contract*, not of any firmware. The app refuses to guide
 * a device outside the range it supports, so this is the number to change when
 * testing that refusal — `createMockDevice({ protocol: 99 })`.
 */
const PROTOCOL_VERSION = 1;
/**
 * A fixed, MAC-shaped id, and a name derived from its last four hex digits —
 * the same rule the firmware is asked to follow, so the app is developed
 * against the shape a board will actually send. Fixed rather than random
 * because a real device's id survives reboots.
 */
const DEFAULT_DEVICE_ID = 'lg-a1b2c3d4e5f6';
const DEFAULT_NAME = 'LightGuide E5F6';
/**
 * `model` and `firmware` say plainly that this is not a board. Nothing in the
 * payload may claim to be hardware that isn't: the device screen exists so
 * somebody watching a demo can tell a real board from a simulation, and a mock
 * that introduced itself as firmware would defeat it.
 */
const DEFAULT_MODEL = 'Mock device (mock-device/server.mjs)';
const DEFAULT_FIRMWARE = '0.0.0-mock';
/** The Nano ESP32's ffat partition, 9.375 MB — see device/docs/00-BOARD.md. */
const FILESYSTEM_BYTES = 9_830_400;

// --- trace parsing ----------------------------------------------------------

/**
 * One CSV trace to replay rows. Exported so the unit conversions have a seam
 * to test: a silent mm/cm or ADC-scale error here would look like plausible
 * sensor data everywhere downstream.
 *
 * Returns `{ rows, skipped }`, where a row is `{ distance_cm, brightness }`:
 * millimetres become centimetres, a 12-bit ADC count becomes a 0..1 fraction,
 * and `missed=1` becomes a null distance — never 0.
 */
export function parseTraceText(text, label = 'trace') {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const rows = [];
  let skipped = 0;
  if (lines.length === 0) return { rows, skipped };

  const header = lines[0].split(',');
  const iDist = header.indexOf('dist_mm');
  const iLdr = header.indexOf('ldr');
  const iMissed = header.indexOf('missed');
  // Fail loudly rather than silently parsing garbage into NaN/null.
  if (iDist === -1) throw new Error(`${label}: missing required column "dist_mm"`);
  if (iLdr === -1) throw new Error(`${label}: missing required column "ldr"`);
  if (iMissed === -1) throw new Error(`${label}: missing required column "missed"`);

  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length < header.length) { skipped += 1; continue; }
    const missed = cells[iMissed] === '1';
    // Number('') is 0, not NaN, so an empty cell must be rejected explicitly
    // or a blank reading would silently become a fake 0 instead of being skipped.
    const ldr = cells[iLdr].trim() === '' ? NaN : Number(cells[iLdr]);
    if (!Number.isFinite(ldr)) { skipped += 1; continue; }
    let distance_cm;
    if (missed) {
      // Dropout is null, never 0. The dist_mm cell is irrelevant here,
      // so a blank/malformed value on a genuine dropout row isn't corruption.
      distance_cm = null;
    } else {
      const dist = cells[iDist].trim() === '' ? NaN : Number(cells[iDist]);
      if (!Number.isFinite(dist)) { skipped += 1; continue; }
      distance_cm = dist / 10;
    }
    rows.push({ distance_cm, brightness: ldr / ADC_MAX });
  }
  return { rows, skipped };
}

/** Every .csv under `dir`, parsed and concatenated in filename order. */
export function loadTraces(dir = DEFAULT_TRACES) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
  if (files.length === 0) throw new Error(`no traces in ${dir}`);
  const rows = [];
  let skipped = 0;
  for (const file of files) {
    const parsed = parseTraceText(readFileSync(join(dir, file), 'utf8'), file);
    rows.push(...parsed.rows);
    skipped += parsed.skipped;
  }
  return { rows, skipped };
}

// --- setup store ------------------------------------------------------------

function loadSetups(storePath) {
  if (!storePath || !existsSync(storePath)) return [];
  try { return JSON.parse(readFileSync(storePath, 'utf8')); } catch { return []; }
}

function saveSetups(storePath, list) {
  if (!storePath) return;
  writeFileSync(storePath, JSON.stringify(list, null, 2));
}

/**
 * The two fields last-write-wins ordering is built on. A setup stored without
 * a usable `updated_at` can never be ordered against anything again, so the
 * device refuses the write instead of accepting a record it cannot merge.
 */
function isStorableSetup(value) {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof value.updated_at === 'string' && value.updated_at !== '' &&
    typeof value.deleted === 'boolean'
  );
}

/** A complete Target. Anything less is refused — never inferred as "clear". */
function isTarget(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  return (
    finite(value.distance_cm) &&
    finite(value.distance_tol_cm) &&
    finite(value.brightness_tol) &&
    (value.brightness_above_ambient === null || finite(value.brightness_above_ambient))
  );
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      // `undefined` means "no readable body", which is distinct from `{}` —
      // the whole point of finding #4: an empty body must never be inferred
      // to mean anything.
      if (raw.trim() === '') return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
  });
}

/**
 * Starts one isolated mock device.
 *
 * @param {object} [options]
 * @param {number} [options.port] 0 picks a free port — use it in tests so an
 *   instance can never collide with the one someone is using by hand.
 * @param {string|null} [options.storePath] null keeps setups in memory only,
 *   which is what makes a fresh instance a genuinely clean device.
 * @param {string} [options.tracesDir]
 * @param {number} [options.dropoutPct]
 * @param {boolean} [options.live] false stops the 10 Hz feed timer.
 * @param {number} [options.protocol] contract version to advertise — set it
 *   outside the app's supported range to exercise the mismatch path.
 * @param {boolean} [options.serveInfo] false makes `/api/info` 404, which is
 *   what firmware older than the route looks like from the app's side.
 * @param {string} [options.deviceId]
 * @param {string} [options.name]
 * @param {string} [options.firmware]
 * @param {{distance?: string, light?: string}} [options.sensors] per-sensor
 *   health to report: 'ok' | 'fault' | 'unknown'.
 */
export async function createMockDevice(options = {}) {
  const {
    port = DEFAULT_PORT,
    storePath = DEFAULT_STORE,
    tracesDir = DEFAULT_TRACES,
    dropoutPct = 0,
    live = true,
    protocol = PROTOCOL_VERSION,
    serveInfo = true,
    deviceId = DEFAULT_DEVICE_ID,
    name = DEFAULT_NAME,
    firmware = DEFAULT_FIRMWARE,
    sensors = {},
  } = options;

  const startedAt = Date.now();
  const sensorHealth = {
    distance: { state: sensors.distance ?? 'ok' },
    light: { state: sensors.light ?? 'ok' },
  };

  const { rows: trace, skipped } = loadTraces(tracesDir);
  let setups = loadSetups(storePath);
  let activeTarget = null;
  let seq = 0;
  let cursor = 0;

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    const url = new URL(req.url, `http://localhost:${port}`);
    const json = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    const noContent = () => { res.writeHead(204); res.end(); };

    if (url.pathname === '/api/info' && req.method === 'GET' && serveInfo) {
      // Answers unconditionally — before the setups have loaded, with both
      // sensors faulty, with the live feed switched off. It is the route the
      // app falls back on to say "the device is there, and here is what is
      // wrong with it", so it must never depend on anything else working.
      //
      // No message, error or hint string here, deliberately: the device
      // reports state and the app writes the sentence. See the contract.
      const stored = JSON.stringify(setups);
      return json(200, {
        protocol,
        device_id: deviceId,
        name,
        model: DEFAULT_MODEL,
        firmware,
        uptime_s: Math.floor((Date.now() - startedAt) / 1000),
        free_storage_bytes: Math.max(0, FILESYSTEM_BYTES - Buffer.byteLength(stored)),
        sensors: sensorHealth,
      });
    }
    if (url.pathname === '/api/setups' && req.method === 'GET') {
      const flag = url.searchParams.get('include_deleted');
      // Strict: any value other than the documented "1" is refused rather
      // than quietly falling back to the active-only list. A client that
      // typo'd the flag would otherwise get a tombstone-free answer and
      // write a backup that resurrects deletions — silently, which is the
      // exact failure this flag exists to fix.
      if (flag !== null && flag !== '1') {
        return json(400, { error: 'include_deleted must be "1" if present' });
      }
      return json(200, flag === '1' ? setups : setups.filter((s) => !s.deleted));
    }
    if (url.pathname.startsWith('/api/setups/') && req.method === 'PUT') {
      const id = url.pathname.split('/').pop();
      const incoming = await readBody(req);
      if (!isStorableSetup(incoming)) {
        return json(400, { error: 'setup must carry a string updated_at and a boolean deleted' });
      }
      // Stored verbatim: updated_at and deleted come from the writer, never
      // from the device clock. An import writing a tombstone depends on it.
      const stored = { ...incoming, id };
      setups = setups.filter((s) => s.id !== id).concat(stored);
      saveSetups(storePath, setups);
      return json(200, stored);
    }
    if (url.pathname.startsWith('/api/setups/') && req.method === 'DELETE') {
      const id = url.pathname.split('/').pop();
      const found = setups.find((s) => s.id === id);
      // Tombstone, not removal: the record survives so a later export can
      // carry the deletion. The device stamps updated_at here because there
      // is no body to take one from.
      if (found) { found.deleted = true; found.updated_at = new Date().toISOString(); }
      saveSetups(storePath, setups);
      // 204 must carry no body.
      return noContent();
    }
    if (url.pathname === '/api/active' && req.method === 'GET') {
      return json(200, { target: activeTarget });
    }
    if (url.pathname === '/api/active' && req.method === 'POST') {
      const incoming = await readBody(req);
      if (!isTarget(incoming)) {
        return json(400, { error: 'POST /api/active requires a complete target; DELETE clears it' });
      }
      activeTarget = {
        distance_cm: incoming.distance_cm,
        distance_tol_cm: incoming.distance_tol_cm,
        brightness_above_ambient: incoming.brightness_above_ambient,
        brightness_tol: incoming.brightness_tol,
      };
      return noContent();
    }
    if (url.pathname === '/api/active' && req.method === 'DELETE') {
      activeTarget = null;
      return noContent();
    }
    // No GET /api/ambient. Ambient is a per-frame field on the live feed and
    // nothing has ever fetched it separately — leaving the route here only
    // gave a firmware author a fifth endpoint to implement for no caller.
    return json(404, { error: 'not found' });
  });

  // --- websocket: 10 Hz live feed -------------------------------------------
  const wss = new WebSocketServer({ server, path: '/live' });
  wss.on('connection', (sock) => {
    // Abrupt client disconnects can fire 'error' on the socket mid-send.
    // An unhandled 'error' event throws and kills the whole process, so a
    // no-op listener is required to keep one flaky client from taking down
    // the mock for everyone else.
    sock.on('error', () => {});
  });

  const timer = live
    ? setInterval(() => {
        const row = trace[cursor % trace.length];
        cursor += 1;
        seq += 1;
        let distance = row.distance_cm;
        if (dropoutPct > 0 && Math.random() * 100 < dropoutPct) {
          distance = null;
        }
        const payload = JSON.stringify({
          distance_cm: distance,
          brightness: row.brightness,
          ambient: AMBIENT,
          seq,
          ts: Date.now(),
        });
        for (const sock of wss.clients) {
          if (sock.readyState === 1) sock.send(payload);
        }
      }, FRAME_INTERVAL_MS)
    : null;
  // Never hold a test runner's event loop open on the replay timer alone.
  timer?.unref?.();

  // Where a transport error goes; swapped for the rejector while listen() is
  // in flight. Both emitters need a listener: WebSocketServer re-emits the
  // HTTP server's errors, and an unhandled 'error' event throws — which is
  // what would turn a readable "port already in use" into a raw stack trace.
  // Both emitters need a listener: WebSocketServer re-emits the HTTP server's
  // errors, and an unhandled 'error' event throws — which is what would turn
  // a readable "port already in use" message into a raw stack trace. They
  // hand over the same Error object, so the second copy of one already dealt
  // with is dropped instead of being reported twice.
  let seenError = null;
  /** Set while listen() is in flight; a failure there is the caller's to handle. */
  let pendingListen = null;
  const onTransportError = (err) => {
    if (err === seenError) return;
    seenError = err;
    if (pendingListen) {
      const { reject } = pendingListen;
      pendingListen = null;
      reject(err);
      return;
    }
    console.error('mock device: transport error', err);
  };
  server.on('error', onTransportError);
  wss.on('error', onTransportError);

  await new Promise((resolve, reject) => {
    pendingListen = { reject };
    server.once('listening', () => {
      pendingListen = null;
      resolve();
    });
    server.listen(port);
  });

  const actualPort = server.address().port;

  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    deviceId,
    name,
    traceRows: trace.length,
    skippedRows: skipped,
    async close() {
      if (timer) clearInterval(timer);
      for (const sock of wss.clients) sock.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// --- script entry point -----------------------------------------------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // The recorded traces contain no dropouts, so this is the only way to
  // exercise the null-distance dropout path against the mock.
  const parsedDropout = Number(process.env.MOCK_DROPOUT_PCT || '0');
  const dropoutPct = Number.isFinite(parsedDropout) ? Math.max(0, Math.min(100, parsedDropout)) : 0;
  // Lets a second instance run alongside the usual one on 8080 — including
  // MOCK_PORT=0 for "any free port".
  const parsedPort = Number(process.env.MOCK_PORT ?? DEFAULT_PORT);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 ? parsedPort : DEFAULT_PORT;

  try {
    const device = await createMockDevice({ dropoutPct, port });
    console.log(`mock device: ${device.traceRows} rows loaded from real v1 traces`);
    // Printed because the app now shows this on its device screen: if the two
    // ever disagree, the app is talking to something else.
    console.log(`mock device: identifies as "${device.name}" (${device.deviceId})`);
    if (device.skippedRows > 0) {
      console.log(`mock device: skipped ${device.skippedRows} malformed row(s)`);
    }
    if (dropoutPct > 0) {
      console.log(`mock device: injecting ${dropoutPct}% distance dropouts`);
    }
    console.log(`mock device on http://localhost:${device.port}`);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `mock device: port ${port} is already in use - another instance is probably already running`,
      );
      process.exit(1);
    }
    throw err;
  }
}
