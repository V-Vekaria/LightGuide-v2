// Mock ESP32. Implements the same HTTP + WS surface the firmware will.
// Replays real v1 traces at 10 Hz. The traces carry genuine sensor noise,
// but the vendored dataset has no dropouts (0 of 1832 rows have missed=1),
// so set MOCK_DROPOUT_PCT to exercise the null-distance dropout path.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const DIR = dirname(fileURLToPath(import.meta.url));
const STORE = join(DIR, 'setups.json');
const PORT = 8080;
const ADC_MAX = 4095;      // 12-bit, matches v1 calibration
const AMBIENT = 0.06;      // simulated ambient level, 0..1
// The recorded traces contain no dropouts, so this is the only way to
// exercise the null-distance dropout path against the mock.
const parsedDropout = Number(process.env.MOCK_DROPOUT_PCT || '0');
const MOCK_DROPOUT_PCT = Number.isFinite(parsedDropout) ? Math.max(0, Math.min(100, parsedDropout)) : 0;

function loadSetups() {
  if (!existsSync(STORE)) return [];
  try { return JSON.parse(readFileSync(STORE, 'utf8')); } catch { return []; }
}
function saveSetups(list) {
  writeFileSync(STORE, JSON.stringify(list, null, 2));
}

// --- trace replay -----------------------------------------------------------
function loadTrace() {
  const files = readdirSync(join(DIR, 'traces')).filter((f) => f.endsWith('.csv'));
  if (files.length === 0) throw new Error('no traces in mock-device/traces');
  const rows = [];
  let skipped = 0;
  for (const file of files) {
    const text = readFileSync(join(DIR, 'traces', file), 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    const header = lines[0].split(',');
    const iDist = header.indexOf('dist_mm');
    const iLdr = header.indexOf('ldr');
    const iMissed = header.indexOf('missed');
    // Fail loudly at startup rather than silently parsing garbage into NaN/null.
    if (iDist === -1) throw new Error(`${file}: missing required column "dist_mm"`);
    if (iLdr === -1) throw new Error(`${file}: missing required column "ldr"`);
    if (iMissed === -1) throw new Error(`${file}: missing required column "missed"`);
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      if (cells.length < header.length) continue;
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
  }
  return { rows, skipped };
}

const { rows: trace, skipped: skippedRows } = loadTrace();
console.log(`mock device: ${trace.length} rows loaded from real v1 traces`);
if (skippedRows > 0) {
  console.log(`mock device: skipped ${skippedRows} malformed row(s)`);
}
if (MOCK_DROPOUT_PCT > 0) {
  console.log(`mock device: injecting ${MOCK_DROPOUT_PCT}% distance dropouts`);
}

let setups = loadSetups();
let activeTarget = null;
let seq = 0;
let cursor = 0;

// --- http -------------------------------------------------------------------
function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const json = (code, payload) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  if (url.pathname === '/api/setups' && req.method === 'GET') {
    return json(200, setups.filter((s) => !s.deleted));
  }
  if (url.pathname.startsWith('/api/setups/') && req.method === 'PUT') {
    const id = url.pathname.split('/').pop();
    const incoming = await body(req);
    setups = setups.filter((s) => s.id !== id).concat({ ...incoming, id });
    saveSetups(setups);
    return json(200, { ...incoming, id });
  }
  if (url.pathname.startsWith('/api/setups/') && req.method === 'DELETE') {
    const id = url.pathname.split('/').pop();
    const found = setups.find((s) => s.id === id);
    if (found) { found.deleted = true; found.updated_at = new Date().toISOString(); }
    saveSetups(setups);
    // 204 must carry no body.
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === '/api/active' && req.method === 'POST') {
    activeTarget = await body(req);
    if (activeTarget && Object.keys(activeTarget).length === 0) activeTarget = null;
    return json(200, { ok: true });
  }
  if (url.pathname === '/api/ambient' && req.method === 'GET') {
    return json(200, { ambient: AMBIENT });
  }
  return json(404, { error: 'not found' });
});

// --- websocket: 10 Hz live feed --------------------------------------------
const wss = new WebSocketServer({ server, path: '/live' });
wss.on('connection', (sock) => {
  // Abrupt client disconnects can fire 'error' on the socket mid-send.
  // An unhandled 'error' event throws and kills the whole process, so a
  // no-op listener is required to keep one flaky client from taking down
  // the mock for everyone else.
  sock.on('error', () => {});
});
setInterval(() => {
  const row = trace[cursor % trace.length];
  cursor += 1;
  seq += 1;
  let distance = row.distance_cm;
  if (MOCK_DROPOUT_PCT > 0 && Math.random() * 100 < MOCK_DROPOUT_PCT) {
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
}, 100);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`mock device: port ${PORT} is already in use - another instance is probably already running`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => console.log(`mock device on http://localhost:${PORT}`));
