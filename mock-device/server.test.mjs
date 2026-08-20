// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTraceText, loadTraces, createMockDevice } from './server.mjs';

/**
 * The mock's unit conversions, tested directly. A silent mm/cm slip or an
 * ADC-scale error here would not look like a bug — it would look like
 * plausible sensor data, all the way through guidance and into the numbers a
 * photographer trusts to place a light.
 *
 * The HTTP + WebSocket surface is covered by src/device/conformance.http.test.ts,
 * which runs the whole conformance suite against this server over the wire,
 * so it is not duplicated here.
 */

const HEADER = 't_ms,dist_mm,d_dist_mm,ldr,d_ldr,missed,label,session';
const row = (dist, ldr, missed = 0) => `96,${dist},5,${ldr},-18,${missed},0,1`;
const csv = (...rows) => [HEADER, ...rows].join('\n');

describe('parseTraceText units', () => {
  it('converts millimetres to centimetres', () => {
    const { rows } = parseTraceText(csv(row(1308, 2476)));
    expect(rows).toHaveLength(1);
    expect(rows[0].distance_cm).toBe(130.8);
  });

  it('converts a 12-bit ADC count to a 0..1 fraction', () => {
    const { rows } = parseTraceText(csv(row(1000, 2476)));
    expect(rows[0].brightness).toBeCloseTo(2476 / 4095, 10);
  });

  it('maps the ADC endpoints to exactly 0 and 1', () => {
    const { rows } = parseTraceText(csv(row(1000, 0), row(1000, 4095)));
    expect(rows[0].brightness).toBe(0);
    expect(rows[1].brightness).toBe(1);
  });

  it('keeps a fractional millimetre reading rather than rounding it away', () => {
    const { rows } = parseTraceText(csv(row(1305, 2476)));
    expect(rows[0].distance_cm).toBe(130.5);
  });
});

describe('parseTraceText dropouts', () => {
  it('maps missed=1 to a null distance, never 0', () => {
    const { rows } = parseTraceText(csv(row(1308, 2476, 1)));
    expect(rows[0].distance_cm).toBeNull();
    expect(rows[0].distance_cm).not.toBe(0);
  });

  it('keeps the light reading on a distance dropout — one axis missing is not both', () => {
    const { rows } = parseTraceText(csv(row(1308, 2476, 1)));
    expect(rows[0].brightness).toBeCloseTo(2476 / 4095, 10);
  });

  it('keeps a missed row whose distance cell is blank or garbage', () => {
    // The dist_mm cell is meaningless on a genuine dropout, so it is not
    // corruption — the row is still a usable null-distance reading.
    const { rows, skipped } = parseTraceText(csv(row('', 2476, 1), row('xxx', 2476, 1)));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.distance_cm === null)).toBe(true);
    expect(skipped).toBe(0);
  });
});

describe('parseTraceText malformed input', () => {
  it('skips a blank ldr instead of reading it as a real 0', () => {
    // Number('') is 0. Accepting it would publish "pitch black" as a genuine
    // measurement.
    const { rows, skipped } = parseTraceText(csv(row(1308, '')));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('skips a non-numeric ldr', () => {
    const { rows, skipped } = parseTraceText(csv(row(1308, 'n/a')));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('skips a blank distance on a row that claims not to have missed', () => {
    const { rows, skipped } = parseTraceText(csv(row('', 2476, 0)));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('skips and counts a truncated row', () => {
    const { rows, skipped } = parseTraceText([HEADER, '96,1308,5'].join('\n'));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('keeps parsing after a bad row', () => {
    const { rows, skipped } = parseTraceText(csv(row(1308, ''), row(1200, 2000)));
    expect(rows).toHaveLength(1);
    expect(rows[0].distance_cm).toBe(120);
    expect(skipped).toBe(1);
  });

  it('ignores comment lines', () => {
    const text = ['# session=1 label=0 ref_mm=1308', HEADER, row(1308, 2476)].join('\n');
    expect(parseTraceText(text).rows).toHaveLength(1);
  });

  it('names the missing column when a required one is absent', () => {
    expect(() => parseTraceText('t_ms,ldr,missed\n96,2476,0', 'bad.csv'))
      .toThrow(/bad\.csv: missing required column "dist_mm"/);
    expect(() => parseTraceText('t_ms,dist_mm,missed\n96,1308,0', 'bad.csv'))
      .toThrow(/missing required column "ldr"/);
    expect(() => parseTraceText('t_ms,dist_mm,ldr\n96,1308,2476', 'bad.csv'))
      .toThrow(/missing required column "missed"/);
  });

  it('returns nothing rather than throwing on an empty file', () => {
    expect(parseTraceText('')).toEqual({ rows: [], skipped: 0 });
  });
});

describe('the vendored v1 traces', () => {
  const { rows, skipped } = loadTraces();

  it('parse without dropping rows', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(skipped).toBe(0);
  });

  it('produce brightness inside the sensor range', () => {
    expect(rows.every((r) => r.brightness >= 0 && r.brightness <= 1)).toBe(true);
  });

  it('produce distances in a plausible centimetre range, or null', () => {
    // Sanity check on the mm -> cm conversion: v1 recorded a stand between
    // roughly 5 cm and 4 m. A missing /10 would put every row over 1000.
    expect(rows.every((r) => r.distance_cm === null || (r.distance_cm > 1 && r.distance_cm < 400)))
      .toBe(true);
  });

  it('contain no dropouts — the documented reason MOCK_DROPOUT_PCT exists', () => {
    expect(rows.some((r) => r.distance_cm === null)).toBe(false);
  });
});

describe('the setup store', () => {
  const setup = {
    id: 'kept-1',
    name: 'Kept',
    distance_cm: 50,
    distance_source: 'typed',
    distance_tol_cm: 5,
    brightness_above_ambient: null,
    brightness_tol: 0.08,
    brightness_captured_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted: false,
  };

  it('keeps a tombstone across a restart, so a later export still carries the deletion', async () => {
    const storePath = join(tmpdir(), `lightguide-mock-${process.pid}-${Date.now()}.json`);
    const put = (url, body) =>
      fetch(`${url}/api/setups/${setup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const first = await createMockDevice({ port: 0, storePath, live: false });
    try {
      await put(first.url, setup);
      await fetch(`${first.url}/api/setups/${setup.id}`, { method: 'DELETE' });
    } finally {
      await first.close();
    }

    const second = await createMockDevice({ port: 0, storePath, live: false });
    try {
      const all = await (await fetch(`${second.url}/api/setups?include_deleted=1`)).json();
      expect(all).toHaveLength(1);
      expect(all[0].deleted).toBe(true);
      // A tombstone is a record, not a row: it must not come back on screen.
      expect(await (await fetch(`${second.url}/api/setups`)).json()).toEqual([]);
    } finally {
      await second.close();
      rmSync(storePath, { force: true });
    }
  });

  it('stamps updated_at on delete but never on a save', async () => {
    const device = await createMockDevice({ port: 0, storePath: null, live: false });
    try {
      await fetch(`${device.url}/api/setups/${setup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup),
      });
      const [saved] = await (await fetch(`${device.url}/api/setups`)).json();
      // Last-write-wins is the writer's call: re-stamping here would make
      // every imported file look newer than what is already saved.
      expect(saved.updated_at).toBe('2026-01-01T00:00:00.000Z');

      await fetch(`${device.url}/api/setups/${setup.id}`, { method: 'DELETE' });
      const [tombstone] = await (await fetch(`${device.url}/api/setups?include_deleted=1`)).json();
      // The delete has no body to take a timestamp from, so the device
      // supplies one — and it must be newer, or the tombstone can never win.
      expect(tombstone.updated_at > saved.updated_at).toBe(true);
    } finally {
      await device.close();
    }
  });
});
