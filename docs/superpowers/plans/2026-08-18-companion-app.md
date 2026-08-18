# LightGuide v2 Companion App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a companion web app that lets a photographer type a target distance (or capture one), optionally capture a light reference, and be guided to that setup — running today against a mock device that replays real v1 sensor traces.

**Architecture:** Three layers with a typed contract at the hinge. The UI talks only to a `DeviceClient` interface; `HttpDeviceClient` speaks to the ESP32 (or the mock server, which implements the identical surface), and `InMemoryDeviceClient` backs tests and offline UI work. A conformance suite runs against every implementation so the mock and the real firmware cannot drift.

**Tech Stack:** Vite 7 · Preact · TypeScript · @preact/signals · Vitest · idb-keyval · `ws` (mock server only)

## Global Constraints

- Node 24, npm 11 (already installed).
- **Bundle target 30–50 KB gzipped** — it must fit in ESP32 flash beside firmware. Preact, not React. No UI component libraries, no router library.
- **`updated_at` and `deleted` on every setup from the first line of code.** These make the cloud tier a drop-in later. Never remove them, never write a setup without touching `updated_at`.
- **Brightness is stored above ambient**, never raw, as a dimensionless fraction of sensor range (0.0–1.0). Never lux — the sensor is not absolutely calibrated.
- **Never render a stale reading as live.** On disconnect the UI freezes, dims, and timestamps the last good reading.
- **Saves are confirmed by the device, never optimistic.**
- Distance is corrected before brightness in all instruction copy — moving the stand changes the light level, so the reverse order wastes the user's effort.
- Sensor dropout is `null`, never `0`.
- Commit after every task. Conventional Commits, subject ≤ 50 chars, no AI attribution trailers.

---

## File Structure

```
LightGuide-v2/
├── package.json                     scripts: dev, mock, test, build
├── tsconfig.json
├── vite.config.ts                   preact preset + vitest config
├── index.html
├── src/
│   ├── main.tsx                     mount
│   ├── app.tsx                      screen switching, device wiring
│   ├── contract/types.ts            Setup, Reading, Target, Verdict, DeviceClient
│   ├── guidance/verdict.ts          pure: reading + target → verdict
│   ├── guidance/verdict.test.ts
│   ├── device/in-memory-client.ts   test/offline implementation
│   ├── device/http-client.ts        real device + mock server
│   ├── device/conformance.ts        shared suite every client must pass
│   ├── device/conformance.test.ts
│   ├── store/store.ts               signals: setups, reading, status, screen
│   ├── cache/idb.ts                 IndexedDB write-through cache
│   ├── backup/transfer.ts           JSON export / import
│   ├── backup/transfer.test.ts
│   └── ui/
│       ├── Target.tsx               two-axis target
│       ├── LiveGuidance.tsx
│       ├── Library.tsx
│       ├── NewSetup.tsx
│       ├── CaptureLight.tsx
│       └── QuickGuide.tsx
└── mock-device/
    ├── server.mjs                   HTTP + WS, replays traces at 10 Hz
    ├── traces/*.csv                 copied from v1 data/raw
    └── setups.json                  mock persistence (gitignored)
```

---

### Task 1: Scaffold and the contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app.tsx`
- Create: `src/contract/types.ts`
- Test: `src/contract/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: every type below. All later tasks import from `src/contract/types`.

- [ ] **Step 1: Create the project files**

`package.json`:

```json
{
  "name": "lightguide-v2",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "mock": "node mock-device/server.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "vite build"
  },
  "dependencies": {
    "preact": "^10.24.0",
    "@preact/signals": "^2.0.0",
    "idb-keyval": "^6.2.1"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.9.0",
    "typescript": "^5.6.0",
    "vite": "^7.0.0",
    "vitest": "^2.1.0",
    "happy-dom": "^15.7.0",
    "ws": "^8.18.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'happy-dom',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/live': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>LightGuide</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { render } from 'preact';
import { App } from './app';

render(<App />, document.getElementById('app')!);
```

`src/app.tsx` (placeholder replaced in Task 11):

```tsx
export function App() {
  return <div>LightGuide</div>;
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without ERR, `node_modules/` created.

- [ ] **Step 3: Write the contract**

`src/contract/types.ts`:

```ts
export type ChannelState = 'in_band' | 'under' | 'over' | 'unknown';

export interface Setup {
  id: string;
  name: string;
  distance_cm: number;
  distance_source: 'typed' | 'captured';
  distance_tol_cm: number;
  /** Dimensionless fraction of sensor range, ambient already subtracted. Null = distance-only setup. */
  brightness_above_ambient: number | null;
  brightness_tol: number;
  brightness_captured_at: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface Reading {
  /** Null when the sensor missed — never 0. */
  distance_cm: number | null;
  /** Raw normalised brightness 0..1, ambient NOT subtracted. */
  brightness: number | null;
  /** Device's current ambient estimate, 0..1. */
  ambient: number | null;
  seq: number;
  ts: number;
}

export interface Target {
  distance_cm: number;
  distance_tol_cm: number;
  brightness_above_ambient: number | null;
  brightness_tol: number;
}

export interface Verdict {
  distance_delta_cm: number | null;
  distance_state: ChannelState;
  brightness_delta: number | null;
  brightness_state: ChannelState;
  instruction: string;
  trustworthy: boolean;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface DeviceClient {
  listSetups(): Promise<Setup[]>;
  saveSetup(setup: Setup): Promise<Setup>;
  deleteSetup(id: string): Promise<void>;
  setActiveTarget(target: Target | null): Promise<void>;
  subscribeLive(cb: (reading: Reading) => void): () => void;
  status(): ConnectionStatus;
  close(): void;
}

export const DEFAULT_DISTANCE_TOL_CM = 5;
export const DEFAULT_BRIGHTNESS_TOL = 0.08;

export function newSetup(fields: {
  name: string;
  distance_cm: number;
  distance_source: 'typed' | 'captured';
  distance_tol_cm?: number;
  brightness_above_ambient?: number | null;
  brightness_tol?: number;
}): Setup {
  const now = new Date().toISOString();
  const hasLight = fields.brightness_above_ambient != null;
  return {
    id: crypto.randomUUID(),
    name: fields.name,
    distance_cm: fields.distance_cm,
    distance_source: fields.distance_source,
    distance_tol_cm: fields.distance_tol_cm ?? DEFAULT_DISTANCE_TOL_CM,
    brightness_above_ambient: fields.brightness_above_ambient ?? null,
    brightness_tol: fields.brightness_tol ?? DEFAULT_BRIGHTNESS_TOL,
    brightness_captured_at: hasLight ? now : null,
    created_at: now,
    updated_at: now,
    deleted: false,
  };
}

export function targetFromSetup(setup: Setup): Target {
  return {
    distance_cm: setup.distance_cm,
    distance_tol_cm: setup.distance_tol_cm,
    brightness_above_ambient: setup.brightness_above_ambient,
    brightness_tol: setup.brightness_tol,
  };
}
```

- [ ] **Step 4: Write the test**

`src/contract/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newSetup, targetFromSetup, DEFAULT_DISTANCE_TOL_CM } from './types';

describe('newSetup', () => {
  it('stamps created_at, updated_at and deleted for sync', () => {
    const s = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
    expect(s.created_at).toBe(s.updated_at);
    expect(s.deleted).toBe(false);
    expect(s.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('defaults distance tolerance and leaves light unset', () => {
    const s = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
    expect(s.distance_tol_cm).toBe(DEFAULT_DISTANCE_TOL_CM);
    expect(s.brightness_above_ambient).toBeNull();
    expect(s.brightness_captured_at).toBeNull();
  });

  it('timestamps the light capture only when light is present', () => {
    const s = newSetup({
      name: 'Key', distance_cm: 50, distance_source: 'typed',
      brightness_above_ambient: 0.51,
    });
    expect(s.brightness_captured_at).not.toBeNull();
  });

  it('projects to a Target', () => {
    const s = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'captured' });
    expect(targetFromSetup(s)).toEqual({
      distance_cm: 50,
      distance_tol_cm: 5,
      brightness_above_ambient: null,
      brightness_tol: 0.08,
    });
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold app and device contract"
```

---

### Task 2: Guidance logic

The heart of the app, and pure — no I/O, no mocking needed.

**Files:**
- Create: `src/guidance/verdict.ts`
- Test: `src/guidance/verdict.test.ts`

**Interfaces:**
- Consumes: `Reading`, `Target`, `Verdict`, `ChannelState` from `src/contract/types`
- Produces: `verdict(reading: Reading, target: Target): Verdict`

- [ ] **Step 1: Write the failing tests**

`src/guidance/verdict.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { verdict } from './verdict';
import type { Reading, Target } from '../contract/types';

const target: Target = {
  distance_cm: 50,
  distance_tol_cm: 5,
  brightness_above_ambient: 0.50,
  brightness_tol: 0.08,
};

function reading(over: Partial<Reading> = {}): Reading {
  return { distance_cm: 50, brightness: 0.60, ambient: 0.10, seq: 1, ts: 0, ...over };
}

describe('verdict', () => {
  it('reports on target when both channels are in band', () => {
    const v = verdict(reading(), target);
    expect(v.distance_state).toBe('in_band');
    expect(v.brightness_state).toBe('in_band');
    expect(v.instruction).toBe('On target');
    expect(v.trustworthy).toBe(true);
  });

  it('tells you to move closer when too far', () => {
    const v = verdict(reading({ distance_cm: 65 }), target);
    expect(v.distance_delta_cm).toBe(15);
    expect(v.distance_state).toBe('over');
    expect(v.instruction).toBe('Move 15 cm closer');
  });

  it('tells you to move further when too close', () => {
    const v = verdict(reading({ distance_cm: 38 }), target);
    expect(v.distance_delta_cm).toBe(-12);
    expect(v.distance_state).toBe('under');
    expect(v.instruction).toBe('Move 12 cm further');
  });

  it('subtracts ambient before comparing brightness', () => {
    // brightness 0.60 - ambient 0.10 = 0.50 above ambient, exactly on target
    const v = verdict(reading(), target);
    expect(v.brightness_delta).toBe(0);
  });

  it('is not fooled by a change in ambient light', () => {
    // Brighter room, light dialled up the same amount: still on target.
    const v = verdict(reading({ brightness: 0.85, ambient: 0.35 }), target);
    expect(v.brightness_state).toBe('in_band');
  });

  it('asks to raise the light when underlit', () => {
    const v = verdict(reading({ brightness: 0.30 }), target);
    expect(v.brightness_state).toBe('under');
    expect(v.instruction).toBe('Raise the light');
  });

  it('asks to lower the light when overlit', () => {
    const v = verdict(reading({ brightness: 0.90 }), target);
    expect(v.brightness_state).toBe('over');
    expect(v.instruction).toBe('Lower the light');
  });

  it('corrects distance before brightness', () => {
    const v = verdict(reading({ distance_cm: 70, brightness: 0.30 }), target);
    expect(v.distance_state).toBe('over');
    expect(v.brightness_state).toBe('under');
    expect(v.instruction).toBe('Move 20 cm closer');
  });

  it('marks a missed distance reading as untrustworthy and withholds instruction', () => {
    const v = verdict(reading({ distance_cm: null }), target);
    expect(v.distance_delta_cm).toBeNull();
    expect(v.distance_state).toBe('unknown');
    expect(v.trustworthy).toBe(false);
    expect(v.instruction).toBe('Waiting for a clear reading');
  });

  it('ignores light entirely for a distance-only setup', () => {
    const distanceOnly: Target = { ...target, brightness_above_ambient: null };
    const v = verdict(reading({ brightness: 0.05 }), distanceOnly);
    expect(v.brightness_state).toBe('unknown');
    expect(v.brightness_delta).toBeNull();
    expect(v.instruction).toBe('On target');
  });

  it('still guides distance when the light sensor drops out', () => {
    const v = verdict(reading({ brightness: null, distance_cm: 62 }), target);
    expect(v.instruction).toBe('Move 12 cm closer');
    expect(v.brightness_state).toBe('unknown');
  });

  it('holds at the tolerance boundary', () => {
    expect(verdict(reading({ distance_cm: 55 }), target).distance_state).toBe('in_band');
    expect(verdict(reading({ distance_cm: 55.1 }), target).distance_state).toBe('over');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/guidance/verdict.test.ts`
Expected: FAIL — `Failed to resolve import "./verdict"`

- [ ] **Step 3: Implement**

`src/guidance/verdict.ts`:

```ts
import type { ChannelState, Reading, Target, Verdict } from '../contract/types';

function classify(delta: number, tol: number): ChannelState {
  if (Math.abs(delta) <= tol) return 'in_band';
  return delta < 0 ? 'under' : 'over';
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function instructionFor(
  distanceState: ChannelState,
  distanceDelta: number | null,
  brightnessState: ChannelState,
): string {
  if (distanceState === 'unknown' || distanceDelta === null) {
    return 'Waiting for a clear reading';
  }
  // Distance first: moving the stand changes the light level too.
  if (distanceState === 'over') return `Move ${round(Math.abs(distanceDelta), 1)} cm closer`;
  if (distanceState === 'under') return `Move ${round(Math.abs(distanceDelta), 1)} cm further`;
  if (brightnessState === 'under') return 'Raise the light';
  if (brightnessState === 'over') return 'Lower the light';
  return 'On target';
}

export function verdict(reading: Reading, target: Target): Verdict {
  const distance_delta_cm =
    reading.distance_cm === null ? null : round(reading.distance_cm - target.distance_cm, 1);
  const distance_state: ChannelState =
    distance_delta_cm === null ? 'unknown' : classify(distance_delta_cm, target.distance_tol_cm);

  let brightness_delta: number | null = null;
  let brightness_state: ChannelState = 'unknown';

  const guidingOnLight = target.brightness_above_ambient !== null;
  const lightReadable = reading.brightness !== null && reading.ambient !== null;

  if (guidingOnLight && lightReadable) {
    const aboveAmbient = reading.brightness! - reading.ambient!;
    brightness_delta = round(aboveAmbient - target.brightness_above_ambient!, 3);
    brightness_state = classify(brightness_delta, target.brightness_tol);
  }

  return {
    distance_delta_cm,
    distance_state,
    brightness_delta,
    brightness_state,
    instruction: instructionFor(distance_state, distance_delta_cm, brightness_state),
    trustworthy: distance_state !== 'unknown',
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/guidance/verdict.test.ts`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: guidance verdict from reading and target"
```

---

### Task 3: Mock device server

Replays real v1 traces so the live view is exercised against genuine sensor noise and dropouts.

**Files:**
- Create: `mock-device/server.mjs`
- Create: `mock-device/traces/` (copied CSVs)
- Modify: `.gitignore` (add `mock-device/setups.json`)

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone Node process)
- Produces: HTTP+WS endpoints that `HttpDeviceClient` (Task 4) targets —
  `GET /api/setups`, `PUT /api/setups/:id`, `DELETE /api/setups/:id`,
  `POST /api/active`, `GET /api/ambient`, `WS /live`

- [ ] **Step 1: Copy real traces into the repo**

```bash
mkdir -p mock-device/traces
cp "../LightGuide-Edge/data/raw/session1_0_optimal_20260806_163130.csv" mock-device/traces/
cp "../LightGuide-Edge/data/raw/session1_1_too_close_20260806_163440.csv" mock-device/traces/
cp ../LightGuide-Edge/data/raw/session1_2_too_far_*.csv mock-device/traces/ 2>/dev/null || true
ls mock-device/traces/
```

Expected: at least two `.csv` files listed. The repo is now self-contained — it does not read from the v1 repo at runtime.

- [ ] **Step 2: Add mock persistence to .gitignore**

```bash
echo "mock-device/setups.json" >> .gitignore
```

- [ ] **Step 3: Write the server**

`mock-device/server.mjs`:

```js
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
```

- [ ] **Step 4: Run it and verify the feed**

Terminal 1: `npm run mock`
Expected: `mock device: <N> rows loaded from real v1 traces` then `mock device on http://localhost:8080`

Terminal 2: `curl http://localhost:8080/api/setups`
Expected: `[]`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mock device replaying real v1 traces"
```

---

### Task 4: Device clients and the conformance suite

The suite is what stops the mock and the real firmware drifting apart.

**Files:**
- Create: `src/device/in-memory-client.ts`
- Create: `src/device/http-client.ts`
- Create: `src/device/conformance.ts`
- Test: `src/device/conformance.test.ts`

**Interfaces:**
- Consumes: `DeviceClient`, `Setup`, `Target`, `Reading`, `ConnectionStatus`, `newSetup` from `src/contract/types`
- Produces:
  - `class InMemoryDeviceClient implements DeviceClient` — constructor `(seed?: Setup[])`, plus test-only `emit(reading: Reading): void`
  - `class HttpDeviceClient implements DeviceClient` — constructor `(baseUrl: string)`
  - `function describeDeviceClient(name: string, make: () => DeviceClient): void`

- [ ] **Step 1: Write the shared conformance suite**

`src/device/conformance.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { DeviceClient } from '../contract/types';
import { newSetup } from '../contract/types';

/** Every DeviceClient implementation must pass this, mock and firmware alike. */
export function describeDeviceClient(name: string, make: () => DeviceClient): void {
  describe(`DeviceClient conformance: ${name}`, () => {
    it('starts with no setups', async () => {
      const client = make();
      expect(await client.listSetups()).toEqual([]);
      client.close();
    });

    it('round-trips a saved setup', async () => {
      const client = make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      const saved = await client.saveSetup(setup);
      expect(saved.id).toBe(setup.id);
      const list = await client.listSetups();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Key');
      client.close();
    });

    it('updates in place rather than duplicating', async () => {
      const client = make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      await client.saveSetup(setup);
      await client.saveSetup({ ...setup, name: 'Renamed', updated_at: new Date().toISOString() });
      const list = await client.listSetups();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Renamed');
      client.close();
    });

    it('hides deleted setups from the list', async () => {
      const client = make();
      const setup = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
      await client.saveSetup(setup);
      await client.deleteSetup(setup.id);
      expect(await client.listSetups()).toEqual([]);
      client.close();
    });

    it('accepts and clears an active target', async () => {
      const client = make();
      await client.setActiveTarget({
        distance_cm: 50, distance_tol_cm: 5,
        brightness_above_ambient: null, brightness_tol: 0.08,
      });
      await client.setActiveTarget(null);
      client.close();
    });

    it('returns an unsubscribe function that stops delivery', () => {
      const client = make();
      const seen: number[] = [];
      const off = client.subscribeLive((r) => seen.push(r.seq));
      expect(typeof off).toBe('function');
      off();
      client.close();
    });
  });
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/device`
Expected: FAIL — no test file imports the suite yet.

- [ ] **Step 3: Implement the in-memory client**

`src/device/in-memory-client.ts`:

```ts
import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';

/** Backs tests and offline UI work. No network. */
export class InMemoryDeviceClient implements DeviceClient {
  private setups: Setup[];
  private target: Target | null = null;
  private listeners = new Set<(r: Reading) => void>();

  constructor(seed: Setup[] = []) {
    this.setups = [...seed];
  }

  async listSetups(): Promise<Setup[]> {
    return this.setups.filter((s) => !s.deleted);
  }

  async saveSetup(setup: Setup): Promise<Setup> {
    this.setups = this.setups.filter((s) => s.id !== setup.id).concat(setup);
    return setup;
  }

  async deleteSetup(id: string): Promise<void> {
    const found = this.setups.find((s) => s.id === id);
    if (found) {
      found.deleted = true;
      found.updated_at = new Date().toISOString();
    }
  }

  async setActiveTarget(target: Target | null): Promise<void> {
    this.target = target;
  }

  subscribeLive(cb: (reading: Reading) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  status(): ConnectionStatus {
    return 'connected';
  }

  close(): void {
    this.listeners.clear();
  }

  /** Test-only: push a reading to subscribers. */
  emit(reading: Reading): void {
    for (const listener of this.listeners) listener(reading);
  }

  /** Test-only: the target last set. */
  activeTarget(): Target | null {
    return this.target;
  }
}
```

- [ ] **Step 4: Implement the HTTP client**

`src/device/http-client.ts`:

```ts
import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

/** Talks to the ESP32 — and to the mock server, which implements the same surface. */
export class HttpDeviceClient implements DeviceClient {
  private listeners = new Set<(r: Reading) => void>();
  private socket: WebSocket | null = null;
  private state: ConnectionStatus = 'disconnected';
  private backoff = RECONNECT_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private baseUrl: string = '') {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  listSetups(): Promise<Setup[]> {
    return this.json<Setup[]>('/api/setups');
  }

  saveSetup(setup: Setup): Promise<Setup> {
    return this.json<Setup>(`/api/setups/${setup.id}`, {
      method: 'PUT',
      body: JSON.stringify(setup),
    });
  }

  async deleteSetup(id: string): Promise<void> {
    await this.json<void>(`/api/setups/${id}`, { method: 'DELETE' });
  }

  async setActiveTarget(target: Target | null): Promise<void> {
    await this.json<void>('/api/active', {
      method: 'POST',
      body: JSON.stringify(target ?? {}),
    });
  }

  subscribeLive(cb: (reading: Reading) => void): () => void {
    this.listeners.add(cb);
    if (!this.socket) this.connect();
    return () => {
      this.listeners.delete(cb);
    };
  }

  private connect(): void {
    if (this.closed) return;
    this.state = 'connecting';
    const origin = this.baseUrl || window.location.origin;
    const url = origin.replace(/^http/, 'ws') + '/live';
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.state = 'connected';
      this.backoff = RECONNECT_MIN_MS;
    };
    socket.onmessage = (event) => {
      try {
        const reading = JSON.parse(event.data as string) as Reading;
        for (const listener of this.listeners) listener(reading);
      } catch {
        // A malformed frame is dropped, not rendered. Never show a bad reading.
      }
    };
    socket.onclose = () => {
      this.state = 'disconnected';
      this.socket = null;
      this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.listeners.size === 0) return;
    this.retryTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
  }

  status(): ConnectionStatus {
    return this.state;
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
    this.socket?.close();
    this.socket = null;
    this.state = 'disconnected';
  }
}
```

- [ ] **Step 5: Wire the suite to the in-memory client**

`src/device/conformance.test.ts`:

```ts
import { describeDeviceClient } from './conformance';
import { InMemoryDeviceClient } from './in-memory-client';

describeDeviceClient('InMemoryDeviceClient', () => new InMemoryDeviceClient());
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/device`
Expected: 6 conformance tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: device clients and conformance suite"
```

---

### Task 5: Cache and store

**Files:**
- Create: `src/cache/idb.ts`
- Create: `src/store/store.ts`

**Interfaces:**
- Consumes: `Setup`, `Reading`, `ConnectionStatus`, `DeviceClient`, `Target` from `src/contract/types`
- Produces:
  - `cacheSetups(list: Setup[]): Promise<void>`, `readCachedSetups(): Promise<Setup[]>`
  - signals `setups`, `reading`, `status`, `screen`, `activeTarget`, `activeSetupId`, `lastGoodAt`
  - `connect(client: DeviceClient): void`, `refreshSetups(): Promise<void>`,
    `persistSetup(setup: Setup): Promise<void>`, `removeSetup(id: string): Promise<void>`,
    `startGuiding(target: Target, setupId?: string): Promise<void>`, `stopGuiding(): Promise<void>`
  - `type Screen = 'library' | 'new' | 'live' | 'quick'`

- [ ] **Step 1: Write the cache**

`src/cache/idb.ts`:

```ts
import { get, set } from 'idb-keyval';
import type { Setup } from '../contract/types';

const KEY = 'lightguide.setups';

/** Cache only — never the system of record. Safe to lose entirely. */
export async function cacheSetups(list: Setup[]): Promise<void> {
  try {
    await set(KEY, list);
  } catch {
    // A failed cache write must never break the app.
  }
}

export async function readCachedSetups(): Promise<Setup[]> {
  try {
    return (await get<Setup[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Write the store**

`src/store/store.ts`:

```ts
import { signal } from '@preact/signals';
import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';
import { cacheSetups, readCachedSetups } from '../cache/idb';

export type Screen = 'library' | 'new' | 'live' | 'quick';

export const setups = signal<Setup[]>([]);
export const reading = signal<Reading | null>(null);
export const status = signal<ConnectionStatus>('disconnected');
export const screen = signal<Screen>('library');
export const activeTarget = signal<Target | null>(null);
export const activeSetupId = signal<string | null>(null);
/** Wall-clock ms of the last reading with a usable distance. Drives the stale banner. */
export const lastGoodAt = signal<number | null>(null);

let device: DeviceClient | null = null;
let unsubscribe: (() => void) | null = null;

export function connect(client: DeviceClient): void {
  device = client;
  unsubscribe?.();
  unsubscribe = client.subscribeLive((r) => {
    reading.value = r;
    if (r.distance_cm !== null) lastGoodAt.value = Date.now();
    status.value = client.status();
  });
  // Cached setups render immediately; the device is still the authority.
  void readCachedSetups().then((cached) => {
    if (setups.value.length === 0) setups.value = cached;
  });
  void refreshSetups();
}

export async function refreshSetups(): Promise<void> {
  if (!device) return;
  const list = await device.listSetups();
  setups.value = list;
  status.value = device.status();
  void cacheSetups(list);
}

export async function persistSetup(setup: Setup): Promise<void> {
  if (!device) throw new Error('no device connected');
  // Confirmed by the device before it reaches the UI — never optimistic.
  await device.saveSetup(setup);
  await refreshSetups();
}

export async function removeSetup(id: string): Promise<void> {
  if (!device) throw new Error('no device connected');
  await device.deleteSetup(id);
  await refreshSetups();
}

export async function startGuiding(target: Target, setupId?: string): Promise<void> {
  if (!device) throw new Error('no device connected');
  await device.setActiveTarget(target);
  activeTarget.value = target;
  activeSetupId.value = setupId ?? null;
  screen.value = 'live';
}

export async function stopGuiding(): Promise<void> {
  await device?.setActiveTarget(null);
  activeTarget.value = null;
  activeSetupId.value = null;
  screen.value = 'library';
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: signal store and idb cache"
```

---

### Task 6: Export and import

Ships in v1 as the durability answer before the cloud tier exists, and stays permanently as the anti-lock-in guarantee.

**Files:**
- Create: `src/backup/transfer.ts`
- Test: `src/backup/transfer.test.ts`

**Interfaces:**
- Consumes: `Setup` from `src/contract/types`
- Produces: `exportSetups(list: Setup[]): string`, `importSetups(json: string, existing: Setup[]): Setup[]`

- [ ] **Step 1: Write the failing tests**

`src/backup/transfer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { exportSetups, importSetups } from './transfer';
import { newSetup } from '../contract/types';

describe('export / import', () => {
  it('round-trips setups through JSON', () => {
    const list = [newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' })];
    const restored = importSetups(exportSetups(list), []);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.name).toBe('Key');
  });

  it('writes a versioned envelope', () => {
    const parsed = JSON.parse(exportSetups([]));
    expect(parsed.version).toBe(1);
    expect(parsed.exported_at).toBeTruthy();
    expect(Array.isArray(parsed.setups)).toBe(true);
  });

  it('keeps the newer copy when a setup exists on both sides', () => {
    const base = newSetup({ name: 'Old', distance_cm: 50, distance_source: 'typed' });
    const newer = { ...base, name: 'New', updated_at: '2099-01-01T00:00:00.000Z' };
    const merged = importSetups(exportSetups([newer]), [base]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe('New');
  });

  it('keeps the existing copy when the imported one is older', () => {
    const base = newSetup({ name: 'Current', distance_cm: 50, distance_source: 'typed' });
    const older = { ...base, name: 'Stale', updated_at: '2000-01-01T00:00:00.000Z' };
    const merged = importSetups(exportSetups([older]), [base]);
    expect(merged[0]!.name).toBe('Current');
  });

  it('adds setups that are not present locally', () => {
    const mine = newSetup({ name: 'Mine', distance_cm: 50, distance_source: 'typed' });
    const theirs = newSetup({ name: 'Theirs', distance_cm: 90, distance_source: 'typed' });
    const merged = importSetups(exportSetups([theirs]), [mine]);
    expect(merged).toHaveLength(2);
  });

  it('rejects a file that is not a LightGuide export', () => {
    expect(() => importSetups('{"hello":"world"}', [])).toThrow(/not a LightGuide export/i);
  });

  it('rejects malformed JSON with a readable message', () => {
    expect(() => importSetups('not json', [])).toThrow(/could not be read/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/backup`
Expected: FAIL — `Failed to resolve import "./transfer"`

- [ ] **Step 3: Implement**

`src/backup/transfer.ts`:

```ts
import type { Setup } from '../contract/types';

const VERSION = 1;

interface Envelope {
  version: number;
  exported_at: string;
  setups: Setup[];
}

export function exportSetups(list: Setup[]): string {
  const envelope: Envelope = {
    version: VERSION,
    exported_at: new Date().toISOString(),
    setups: list,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Last-write-wins per setup, by updated_at. Enough for one user. */
export function importSetups(json: string, existing: Setup[]): Setup[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file could not be read as JSON.');
  }

  const envelope = parsed as Partial<Envelope>;
  if (!envelope || typeof envelope.version !== 'number' || !Array.isArray(envelope.setups)) {
    throw new Error('That file is not a LightGuide export.');
  }

  const merged = new Map<string, Setup>();
  for (const setup of existing) merged.set(setup.id, setup);
  for (const incoming of envelope.setups) {
    const current = merged.get(incoming.id);
    if (!current || incoming.updated_at > current.updated_at) {
      merged.set(incoming.id, incoming);
    }
  }
  return [...merged.values()];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/backup`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: json export and import with merge"
```

---

### Task 7: The two-axis target component

**Files:**
- Create: `src/ui/Target.tsx`
- Create: `src/ui/theme.css`
- Modify: `src/main.tsx` (import the stylesheet)

**Interfaces:**
- Consumes: `Verdict`, `ChannelState` from `src/contract/types`
- Produces: `<TargetView verdict={Verdict} distanceTolCm={number} brightnessTol={number} />`

- [ ] **Step 1: Write the stylesheet**

`src/ui/theme.css`:

```css
:root {
  --bg: #0b0f19;
  --panel: #111827;
  --line: #1f2937;
  --text: #f9fafb;
  --muted: #6b7280;
  --dim: #94a3b8;
  --ok: #22c55e;
  --warn: #f59e0b;
  --bad: #ef4444;
  --info: #60a5fa;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

#app { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }

.screen { flex: 1; display: flex; flex-direction: column; }
.screen-top {
  padding: 14px 16px; border-bottom: 1px solid var(--line);
  display: flex; justify-content: space-between; align-items: center;
}
.screen-title { font-size: 18px; font-weight: 700; }
.screen-body { flex: 1; padding: 16px; }
.screen-foot { padding: 12px 16px 20px; border-top: 1px solid var(--line); }

.btn {
  width: 100%; padding: 13px; border-radius: 10px; border: 0;
  background: var(--ok); color: #05240f; font-size: 15px; font-weight: 700;
  font-family: inherit; cursor: pointer;
}
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--dim); }
.btn-info { background: #1e3a8a; color: #dbeafe; }
.btn + .btn { margin-top: 8px; }

.field { margin-bottom: 18px; }
.field-label {
  font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 6px;
}
.input {
  width: 100%; padding: 12px; border-radius: 9px; font-size: 16px;
  background: #131c2b; border: 1px solid #2a3444; color: var(--text);
  font-family: inherit;
}
.hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
.link-btn {
  background: none; border: 0; color: var(--info); font-size: 13px;
  padding: 6px 0; cursor: pointer; font-family: inherit;
}

.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.status-connected { background: var(--ok); }
.status-connecting { background: var(--warn); }
.status-disconnected { background: var(--bad); }

.stale-banner {
  background: rgba(239, 68, 68, .12); border: 1px solid rgba(239, 68, 68, .4);
  color: #fecaca; padding: 10px 12px; border-radius: 9px;
  font-size: 13px; margin-bottom: 14px;
}
```

`src/main.tsx` becomes:

```tsx
import { render } from 'preact';
import { App } from './app';
import './ui/theme.css';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 2: Write the target component**

`src/ui/Target.tsx`:

```tsx
import type { ChannelState, Verdict } from '../contract/types';

interface Props {
  verdict: Verdict;
  distanceTolCm: number;
  brightnessTol: number;
}

/** Clamp an axis delta to -1..1 of the plot, where +/-1 is four tolerances out. */
function axisFraction(delta: number | null, tol: number): number | null {
  if (delta === null) return null;
  const scaled = delta / (tol * 4);
  return Math.max(-1, Math.min(1, scaled));
}

function surroundColour(distance: ChannelState, brightness: ChannelState): string {
  if (distance === 'unknown') return 'rgba(148,163,184,.10)';
  const settled = distance === 'in_band' && (brightness === 'in_band' || brightness === 'unknown');
  return settled ? 'rgba(34,197,94,.14)' : 'rgba(245,158,11,.12)';
}

export function TargetView({ verdict, distanceTolCm, brightnessTol }: Props) {
  const SIZE = 240;
  const half = SIZE / 2;

  const dx = axisFraction(verdict.distance_delta_cm, distanceTolCm);
  // Brightness axis is inverted: brighter is up, and positive delta means brighter.
  const dy = axisFraction(verdict.brightness_delta, brightnessTol);

  const bandPx = (SIZE / 2) * 0.25; // one tolerance = a quarter of the half-width
  const dotX = half + (dx ?? 0) * half;
  const dotY = half - (dy ?? 0) * half;
  const known = dx !== null;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>BRIGHTER</div>
      <div
        style={{
          position: 'relative', width: SIZE, height: SIZE, margin: '6px auto',
          borderRadius: 14, background: surroundColour(verdict.distance_state, verdict.brightness_state),
          transition: 'background .3s',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, border: '1px solid var(--line)', borderRadius: 14 }} />
        <div
          style={{
            position: 'absolute', left: half - bandPx, top: half - bandPx,
            width: bandPx * 2, height: bandPx * 2,
            border: '2px solid var(--ok)', borderRadius: 8, background: 'rgba(34,197,94,.10)',
          }}
        />
        <div style={{ position: 'absolute', left: half, top: 0, bottom: 0, width: 1, background: 'var(--line)' }} />
        <div style={{ position: 'absolute', top: half, left: 0, right: 0, height: 1, background: 'var(--line)' }} />
        {known ? (
          <div
            style={{
              position: 'absolute', left: dotX - 9, top: dotY - 9, width: 18, height: 18,
              borderRadius: '50%',
              background: verdict.distance_state === 'in_band' ? 'var(--ok)' : 'var(--warn)',
              boxShadow: `0 0 0 6px ${verdict.distance_state === 'in_band'
                ? 'rgba(34,197,94,.22)' : 'rgba(245,158,11,.22)'}`,
              transition: 'left .12s linear, top .12s linear',
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', fontSize: 13,
          }}>
            no reading
          </div>
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        width: SIZE, margin: '0 auto', fontSize: 10,
        letterSpacing: '.1em', color: 'var(--muted)',
      }}>
        <span>CLOSER</span><span>FURTHER</span>
      </div>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)', marginTop: 4 }}>DIMMER</div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: two-axis target component"
```

---

### Task 8: Live guidance screen

**Files:**
- Create: `src/ui/LiveGuidance.tsx`

**Interfaces:**
- Consumes: `TargetView` from `src/ui/Target`, `verdict` from `src/guidance/verdict`, store signals from `src/store/store`
- Produces: `<LiveGuidance />`

- [ ] **Step 1: Implement**

`src/ui/LiveGuidance.tsx`:

```tsx
import { TargetView } from './Target';
import { verdict as computeVerdict } from '../guidance/verdict';
import { activeTarget, lastGoodAt, reading, status, stopGuiding } from '../store/store';

const STALE_AFTER_MS = 2000;

export function LiveGuidance() {
  const target = activeTarget.value;
  const live = reading.value;
  if (!target) return null;

  const stale = lastGoodAt.value === null || Date.now() - lastGoodAt.value > STALE_AFTER_MS;
  const disconnected = status.value !== 'connected';

  // A stale reading is never rendered as live: fall back to an all-unknown verdict.
  const blank = { distance_cm: null, brightness: null, ambient: null, seq: 0, ts: 0 };
  const v = computeVerdict(stale || disconnected ? blank : live ?? blank, target);

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">Guiding</div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          <span class={`status-dot status-${status.value}`} />
          {target.distance_cm} cm target
        </span>
      </div>

      <div class="screen-body">
        {(stale || disconnected) && (
          <div class="stale-banner">
            {disconnected ? 'Device disconnected' : 'No usable reading'} — showing no guidance rather
            than a stale one.
            {lastGoodAt.value && (
              <> Last good reading {Math.round((Date.now() - lastGoodAt.value) / 1000)}s ago.</>
            )}
          </div>
        )}

        <div style={{ opacity: stale || disconnected ? 0.4 : 1, transition: 'opacity .2s' }}>
          <TargetView
            verdict={v}
            distanceTolCm={target.distance_tol_cm}
            brightnessTol={target.brightness_tol}
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <div style={{
            fontSize: 24, fontWeight: 700,
            color: v.distance_state === 'in_band' && v.brightness_state !== 'over'
              && v.brightness_state !== 'under' ? 'var(--ok)' : 'var(--warn)',
          }}>
            {v.instruction}
          </div>
          {v.distance_delta_cm !== null && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              distance {v.distance_delta_cm > 0 ? '+' : ''}{v.distance_delta_cm} cm
              {v.brightness_delta !== null && (
                <> · light {v.brightness_delta > 0 ? '+' : ''}{v.brightness_delta}</>
              )}
            </div>
          )}
        </div>
      </div>

      <div class="screen-foot">
        <button class="btn btn-ghost" onClick={() => void stopGuiding()}>Done</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: live guidance screen"
```

---

### Task 9: Library screen

**Files:**
- Create: `src/ui/Library.tsx`

**Interfaces:**
- Consumes: `targetFromSetup` from `src/contract/types`, store signals and actions from `src/store/store`, `exportSetups`/`importSetups` from `src/backup/transfer`
- Produces: `<Library />`

- [ ] **Step 1: Implement**

`src/ui/Library.tsx`:

```tsx
import { targetFromSetup, type Setup } from '../contract/types';
import { exportSetups, importSetups } from '../backup/transfer';
import { persistSetup, removeSetup, screen, setups, startGuiding, status } from '../store/store';

function MiniTarget({ setup }: { setup: Setup }) {
  // Tolerance drives the inset: a tighter band draws a smaller box.
  const inset = Math.max(4, 18 - setup.distance_tol_cm);
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, border: '1px solid #374151', borderRadius: 4 }} />
      <div style={{
        position: 'absolute', inset, borderRadius: 3,
        border: `1.5px solid ${setup.brightness_above_ambient === null ? 'var(--info)' : 'var(--ok)'}`,
        background: setup.brightness_above_ambient === null
          ? 'rgba(96,165,250,.14)' : 'rgba(34,197,94,.14)',
      }} />
    </div>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Library() {
  const list = setups.value;

  async function onImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const merged = importSetups(await file.text(), list);
      for (const setup of merged) await persistSetup(setup);
    } catch (error) {
      alert((error as Error).message);
    }
    input.value = '';
  }

  return (
    <div class="screen">
      <div class="screen-top">
        <div>
          <div class="screen-title">Setups</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            <span class={`status-dot status-${status.value}`} />
            {list.length} saved · device {status.value}
          </div>
        </div>
      </div>

      <div class="screen-body">
        {list.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
            No setups yet. Use <strong>Quick guide</strong> to hit a distance right now, or save one
            here to come back to later.
          </p>
        )}

        {list.map((setup) => (
          <div
            key={setup.id}
            style={{
              display: 'flex', gap: 12, alignItems: 'center', padding: '11px 12px',
              background: 'var(--panel)', border: '1px solid var(--line)',
              borderRadius: 10, marginBottom: 8,
            }}
          >
            <MiniTarget setup={setup} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{setup.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {setup.distance_cm} cm ±{setup.distance_tol_cm}
                {setup.brightness_above_ambient === null
                  ? ' · distance only'
                  : ` · light ${setup.brightness_above_ambient.toFixed(2)}`}
              </div>
            </div>
            <button
              class="link-btn"
              onClick={() => void startGuiding(targetFromSetup(setup), setup.id)}
            >
              Guide
            </button>
            <button
              class="link-btn"
              style={{ color: 'var(--bad)' }}
              onClick={() => { if (confirm(`Delete "${setup.name}"?`)) void removeSetup(setup.id); }}
            >
              Delete
            </button>
          </div>
        ))}

        <div style={{ marginTop: 20, display: 'flex', gap: 14 }}>
          <button
            class="link-btn"
            onClick={() => download('lightguide-setups.json', exportSetups(list))}
          >
            Export
          </button>
          <label class="link-btn" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={onImport} />
          </label>
        </div>
      </div>

      <div class="screen-foot">
        <button class="btn" onClick={() => (screen.value = 'quick')}>Quick guide</button>
        <button class="btn btn-ghost" onClick={() => (screen.value = 'new')}>+ New setup</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: setup library screen"
```

---

### Task 10: New setup and light capture

**Files:**
- Create: `src/ui/CaptureLight.tsx`
- Create: `src/ui/NewSetup.tsx`

**Interfaces:**
- Consumes: `newSetup`, `DEFAULT_DISTANCE_TOL_CM` from `src/contract/types`, store signals from `src/store/store`
- Produces:
  - `<CaptureLight onCaptured={(aboveAmbient: number) => void} onCancel={() => void} />`
  - `<NewSetup />`

- [ ] **Step 1: Implement the two-step light capture**

`src/ui/CaptureLight.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { reading } from '../store/store';

interface Props {
  onCaptured: (aboveAmbient: number) => void;
  onCancel: () => void;
}

/**
 * Two steps, and the first one is the point: reading ambient with the light off is
 * what makes the reference still valid next week under different daylight.
 */
export function CaptureLight({ onCaptured, onCancel }: Props) {
  const [ambient, setAmbient] = useState<number | null>(null);
  const live = reading.value;
  const brightness = live?.brightness ?? null;

  if (ambient === null) {
    return (
      <div class="screen">
        <div class="screen-top">
          <div class="screen-title">Capture light</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>step 1 of 2</span>
        </div>
        <div class="screen-body" style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 34 }}>💡</div>
          <div style={{ fontSize: 17, fontWeight: 600, margin: '14px 0 10px' }}>
            Switch the light off
          </div>
          <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6 }}>
            Reading the room's ambient level first is what keeps this reference valid next week,
            under different daylight.
          </p>
          <div style={{
            marginTop: 24, background: '#131c2b', border: '1px solid #2a3444',
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>
              AMBIENT NOW
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
              {brightness === null ? '—' : brightness.toFixed(2)}
            </div>
          </div>
        </div>
        <div class="screen-foot">
          <button
            class="btn"
            disabled={brightness === null}
            onClick={() => setAmbient(brightness)}
          >
            Ambient captured — next
          </button>
          <button class="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const aboveAmbient = brightness === null ? null : Number((brightness - ambient).toFixed(3));

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">Capture light</div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>step 2 of 2</span>
      </div>
      <div class="screen-body" style={{ textAlign: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 34 }}>🔆</div>
        <div style={{ fontSize: 17, fontWeight: 600, margin: '14px 0 10px' }}>
          Switch the light on and set it how you want it
        </div>
        <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6 }}>
          We store the difference from ambient, not the raw level.
        </p>
        <div style={{
          marginTop: 24, background: '#131c2b', border: '1px solid #2a3444',
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>
            ABOVE AMBIENT
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
            {aboveAmbient === null ? '—' : aboveAmbient.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            ambient was {ambient.toFixed(2)}
          </div>
        </div>
      </div>
      <div class="screen-foot">
        <button
          class="btn"
          disabled={aboveAmbient === null || aboveAmbient <= 0}
          onClick={() => onCaptured(aboveAmbient!)}
        >
          Use this light level
        </button>
        <button class="btn btn-ghost" onClick={() => setAmbient(null)}>Back</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the create screen**

`src/ui/NewSetup.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { DEFAULT_DISTANCE_TOL_CM, newSetup } from '../contract/types';
import { persistSetup, reading, screen } from '../store/store';
import { CaptureLight } from './CaptureLight';

export function NewSetup() {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState('');
  const [tolerance, setTolerance] = useState(String(DEFAULT_DISTANCE_TOL_CM));
  const [light, setLight] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const liveDistance = reading.value?.distance_cm ?? null;
  const distanceValue = Number(distance);
  const valid = name.trim().length > 0 && Number.isFinite(distanceValue) && distanceValue > 0;

  if (capturing) {
    return (
      <CaptureLight
        onCaptured={(aboveAmbient) => { setLight(aboveAmbient); setCapturing(false); }}
        onCancel={() => setCapturing(false)}
      />
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await persistSetup(newSetup({
        name: name.trim(),
        distance_cm: distanceValue,
        distance_source: 'typed',
        distance_tol_cm: Number(tolerance) || DEFAULT_DISTANCE_TOL_CM,
        brightness_above_ambient: light,
      }));
      screen.value = 'library';
    } catch (caught) {
      // Save is confirmed by the device. If it failed, say so.
      setError((caught as Error).message || 'The device did not confirm the save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">New setup</div>
        <button class="link-btn" onClick={() => (screen.value = 'library')}>Cancel</button>
      </div>

      <div class="screen-body">
        <div class="field">
          <div class="field-label">Name</div>
          <input
            class="input"
            value={name}
            placeholder="Portrait key"
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <div class="field-label">Target distance (cm)</div>
          <input
            class="input"
            type="number"
            inputMode="decimal"
            value={distance}
            placeholder="50"
            onInput={(e) => setDistance((e.currentTarget as HTMLInputElement).value)}
          />
          {liveDistance !== null && (
            <button class="link-btn" onClick={() => setDistance(String(liveDistance))}>
              ↻ or use current reading — {liveDistance.toFixed(1)} cm
            </button>
          )}
        </div>

        <div class="field">
          <div class="field-label">Tolerance (± cm)</div>
          <input
            class="input"
            type="number"
            inputMode="decimal"
            value={tolerance}
            onInput={(e) => setTolerance((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <div class="field-label">Light reference</div>
          {light === null ? (
            <>
              <button class="btn btn-info" onClick={() => setCapturing(true)}>Capture light</button>
              <div class="hint">Optional — skip to guide on distance only.</div>
            </>
          ) : (
            <div style={{
              background: '#131c2b', border: '1px solid #2a3444',
              borderRadius: 9, padding: 12, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14 }}>{light.toFixed(2)} above ambient</span>
              <button class="link-btn" onClick={() => setLight(null)}>Clear</button>
            </div>
          )}
        </div>

        {error && <div class="stale-banner">{error}</div>}
      </div>

      <div class="screen-foot">
        <button class="btn" disabled={!valid || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save setup'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: new setup and ambient-first light capture"
```

---

### Task 11: Quick guide and app shell

**Files:**
- Create: `src/ui/QuickGuide.tsx`
- Modify: `src/app.tsx` (replace the Task 1 placeholder)

**Interfaces:**
- Consumes: everything above
- Produces: `<QuickGuide />`, working `<App />`

- [ ] **Step 1: Implement quick guide**

`src/ui/QuickGuide.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { DEFAULT_BRIGHTNESS_TOL, DEFAULT_DISTANCE_TOL_CM } from '../contract/types';
import { screen, startGuiding } from '../store/store';

/** Type a distance, get guided. Nothing named, nothing saved — the common case. */
export function QuickGuide() {
  const [distance, setDistance] = useState('');
  const value = Number(distance);
  const valid = Number.isFinite(value) && value > 0;

  return (
    <div class="screen">
      <div class="screen-top">
        <div class="screen-title">Quick guide</div>
        <button class="link-btn" onClick={() => (screen.value = 'library')}>Cancel</button>
      </div>

      <div class="screen-body">
        <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
          Where do you want the light? We'll walk you to it. Nothing is saved.
        </p>

        <div class="field">
          <div class="field-label">Target distance (cm)</div>
          <input
            class="input"
            type="number"
            inputMode="decimal"
            value={distance}
            placeholder="50"
            autofocus
            onInput={(e) => setDistance((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[30, 50, 80, 120].map((preset) => (
            <button
              key={preset}
              class="link-btn"
              style={{
                border: '1px solid var(--line)', borderRadius: 8,
                padding: '8px 14px', color: 'var(--text)',
              }}
              onClick={() => setDistance(String(preset))}
            >
              {preset} cm
            </button>
          ))}
        </div>
      </div>

      <div class="screen-foot">
        <button
          class="btn"
          disabled={!valid}
          onClick={() => void startGuiding({
            distance_cm: value,
            distance_tol_cm: DEFAULT_DISTANCE_TOL_CM,
            brightness_above_ambient: null,
            brightness_tol: DEFAULT_BRIGHTNESS_TOL,
          })}
        >
          Guide me
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the app shell**

`src/app.tsx`:

```tsx
import { useEffect } from 'preact/hooks';
import { HttpDeviceClient } from './device/http-client';
import { connect, screen } from './store/store';
import { Library } from './ui/Library';
import { LiveGuidance } from './ui/LiveGuidance';
import { NewSetup } from './ui/NewSetup';
import { QuickGuide } from './ui/QuickGuide';

export function App() {
  useEffect(() => {
    // Same origin: the ESP32 serves this bundle, and Vite proxies /api and /live in dev.
    const client = new HttpDeviceClient('');
    connect(client);
    return () => client.close();
  }, []);

  switch (screen.value) {
    case 'new': return <NewSetup />;
    case 'live': return <LiveGuidance />;
    case 'quick': return <QuickGuide />;
    default: return <Library />;
  }
}
```

- [ ] **Step 3: Run the whole thing**

Terminal 1: `npm run mock`
Terminal 2: `npm run dev`

Open the printed URL. Expected:
- Library shows "0 saved · device connected" with a green dot
- **Quick guide** → type `50` → **Guide me** → target renders, dot moves at 10 Hz off real trace data, instruction updates
- Stop the mock server → within ~2 s the stale banner appears, target dims, instruction stops updating
- Restart the mock → reconnects on its own, guidance resumes
- **+ New setup** → name, distance, **Capture light** two-step → save → appears in library
- **Export** downloads a JSON file; **Import** merges it back with no duplicates

- [ ] **Step 4: Run the full test suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Check the bundle budget**

Run: `npm run build`
Expected: build succeeds. Check the reported gzip size is under 50 KB — the ESP32 flash constraint. If it is over, that is a finding to report, not something to silently accept.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: quick guide and app shell"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 Quick guide | 11 |
| §2 Setup library | 9 |
| §3 Contract + two clients | 1, 4 |
| §3 Preact, bundle budget | 1, 11 (step 5) |
| §4 Data model, sync fields | 1 |
| §4 Ambient re-zero | 10 |
| §5 Cache, export/import | 5, 6 |
| §6 Four screens, target view | 7, 8, 9, 10, 11 |
| §7 Guidance, distance-first | 2 |
| §8 Error handling | 2 (nulls), 4 (reconnect), 8 (stale banner), 10 (save failure) |
| §9 Testing, conformance, real traces | 2, 3, 4 |

Not built, by design (spec §10): cloud sync, photos, on-device ML, firmware. The firmware is a separate plan written when hardware arrives — it implements the same contract and must pass the same conformance suite.

**Known gap, deliberately accepted:** the conformance suite runs against `InMemoryDeviceClient` in CI. Running it against `HttpDeviceClient` needs a live server, so it is exercised manually in Task 11 Step 3 and becomes automated when firmware exists.
