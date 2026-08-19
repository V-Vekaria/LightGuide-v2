// Mock ESP32. Implements the same HTTP + WS surface the firmware will.
// Replays real v1 traces at 10 Hz so the UI sees genuine noise and dropouts.
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
  for (const file of files) {
    const text = readFileSync(join(DIR, 'traces', file), 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    const header = lines[0].split(',');
    const iDist = header.indexOf('dist_mm');
    const iLdr = header.indexOf('ldr');
    const iMissed = header.indexOf('missed');
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      if (cells.length < header.length) continue;
      const missed = cells[iMissed] === '1';
      rows.push({
        // Dropout is null, never 0.
        distance_cm: missed ? null : Number(cells[iDist]) / 10,
        brightness: Number(cells[iLdr]) / ADC_MAX,
      });
    }
  }
  return rows;
}

const trace = loadTrace();
console.log(`mock device: ${trace.length} rows loaded from real v1 traces`);

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
setInterval(() => {
  const row = trace[cursor % trace.length];
  cursor += 1;
  seq += 1;
  const payload = JSON.stringify({
    distance_cm: row.distance_cm,
    brightness: row.brightness,
    ambient: AMBIENT,
    seq,
    ts: Date.now(),
  });
  for (const sock of wss.clients) {
    if (sock.readyState === 1) sock.send(payload);
  }
}, 100);

server.listen(PORT, () => console.log(`mock device on http://localhost:${PORT}`));
