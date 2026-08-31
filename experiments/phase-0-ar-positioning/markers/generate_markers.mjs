#!/usr/bin/env node
// Generates the Phase 0 printable AR markers.
//
// Deterministic (seeded) so a reprinted marker is byte-identical to the one
// compiled into the app's augmented-image database. Dependency-free: writes
// 8-bit greyscale PNGs using only Node's built-in zlib.
//
//   node generate_markers.mjs [outDir]
//
// Regenerate BOTH the printable copy in markers/ and the app asset copy in
// android/app/src/main/assets/markers/ whenever this file changes, otherwise
// the printed marker and the tracked template drift apart.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 4:3, deliberately NOT square. A square marker whose pattern has no dominant
// direction can be matched 90 degrees rotated with equal confidence - measured
// in the 2026-08-31 session, where roll sat bimodally at 0 and 90 degrees and
// flipped between consecutive frames. A non-square aspect ratio makes a
// 90-degree match geometrically impossible; the corner wedge breaks 180.
const WIDTH = 1024 // px - this is the dimension handed to ARCore
const HEIGHT = 768 // px
const QUIET = 40 // white quiet zone around the frame, px
const FRAME = 26 // black frame thickness, px

// ---------------------------------------------------------------- PRNG ----

// xorshift32. Any fixed seed works; the point is only reproducibility.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 0x100000000
  }
}

// ------------------------------------------------------------- canvas ----

function canvas(w, h) {
  const px = new Uint8Array(w * h).fill(255)
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    px[y * w + x] = v
  }
  return {
    px,
    w,
    h,
    set,
    rect(x0, y0, w, h, v) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, v)
    },
    disc(cx, cy, r, v) {
      const r2 = r * r
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy <= r2) set(x, y, v)
        }
      }
    },
    // Filled triangle via half-plane test.
    tri(ax, ay, bx, by, cx, cy, v) {
      const minX = Math.floor(Math.min(ax, bx, cx))
      const maxX = Math.ceil(Math.max(ax, bx, cx))
      const minY = Math.floor(Math.min(ay, by, cy))
      const maxY = Math.ceil(Math.max(ay, by, cy))
      const edge = (x1, y1, x2, y2, x, y) => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const e0 = edge(ax, ay, bx, by, x, y)
          const e1 = edge(bx, by, cx, cy, x, y)
          const e2 = edge(cx, cy, ax, ay, x, y)
          if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) set(x, y, v)
        }
      }
    },
  }
}

// --------------------------------------------------------------- font ----

// 5x7 bitmaps, only the glyphs the two marker labels need.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

function drawText(c, text, x0, y0, scale, v) {
  let x = x0
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch]
    if (!g) throw new Error(`no glyph for '${ch}' - add it to GLYPHS`)
    for (let row = 0; row < g.length; row++) {
      for (let col = 0; col < g[row].length; col++) {
        if (g[row][col] === '1') c.rect(x + col * scale, y0 + row * scale, scale, scale, v)
      }
    }
    x += 6 * scale
  }
}

// ---------------------------------------------------------------- PNG ----

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodeGreyPng(px, w, h) {
  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((w + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0
    Buffer.from(px.subarray(y * w, (y + 1) * w)).copy(raw, y * (w + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // colour type: greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// -------------------------------------------------------------- marker ----

// ARCore augmented images track best on high-contrast, non-repeating, evenly
// spread detail. Multi-scale random shapes give that, but random detail alone
// is statistically isotropic - it carries no dominant direction, which is what
// let a 90-degree-rotated match win on the earlier square markers. The 4:3
// frame rules that out geometrically, and the solid corner wedge gives the
// matcher one large unambiguous "this way up" feature.
function buildMarker({ seed, label, cornerBlocks }) {
  const c = canvas(WIDTH, HEIGHT)
  const rand = rng(seed)

  const innerX0 = QUIET + FRAME
  const innerY0 = QUIET + FRAME
  const innerX1 = WIDTH - QUIET - FRAME
  const innerY1 = HEIGHT - QUIET - FRAME
  const innerW = innerX1 - innerX0
  const innerH = innerY1 - innerY0

  // Black frame with a white quiet zone outside it.
  c.rect(QUIET, QUIET, WIDTH - 2 * QUIET, FRAME, 0)
  c.rect(QUIET, HEIGHT - QUIET - FRAME, WIDTH - 2 * QUIET, FRAME, 0)
  c.rect(QUIET, QUIET, FRAME, HEIGHT - 2 * QUIET, 0)
  c.rect(WIDTH - QUIET - FRAME, QUIET, FRAME, HEIGHT - 2 * QUIET, 0)

  const shade = () => (rand() < 0.55 ? 0 : Math.floor(rand() * 90)) // dark
  const light = () => 200 + Math.floor(rand() * 56)

  // Coarse -> fine passes keep detail at every viewing distance.
  const passes = [
    { n: 26, min: 0.10, max: 0.22 },
    { n: 70, min: 0.05, max: 0.11 },
    { n: 190, min: 0.02, max: 0.055 },
    { n: 420, min: 0.008, max: 0.024 },
  ]

  for (const p of passes) {
    for (let i = 0; i < p.n; i++) {
      const s = (p.min + rand() * (p.max - p.min)) * innerH
      const x = innerX0 + rand() * (innerW - s)
      const y = innerY0 + rand() * (innerH - s)
      const v = rand() < 0.72 ? shade() : light()
      const kind = rand()
      if (kind < 0.42) {
        c.rect(Math.round(x), Math.round(y), Math.round(s), Math.round(s * (0.35 + rand())), v)
      } else if (kind < 0.72) {
        c.disc(Math.round(x + s / 2), Math.round(y + s / 2), Math.round(s / 2), v)
      } else {
        c.tri(x, y + s, x + s / 2, y, x + s, y + s * (0.4 + rand() * 0.6), v)
      }
    }
  }

  // Solid wedge filling the top-left inner corner. Large, high-contrast and
  // present in exactly one corner, so it anchors the orientation even at the
  // oblique angles and distances where the fine detail stops resolving. This
  // is the feature that breaks the 180-degree case the aspect ratio cannot.
  const wedge = Math.round(innerH * 0.34)
  c.tri(innerX0, innerY0, innerX0 + wedge, innerY0, innerX0, innerY0 + wedge, 0)

  // Asymmetric corner code: makes the two markers distinguishable to a human.
  const bs = Math.round(innerH * 0.045)
  for (let i = 0; i < cornerBlocks.length; i++) {
    const row = cornerBlocks[i]
    for (let j = 0; j < row.length; j++) {
      if (row[j] === '1') {
        c.rect(innerX1 - 12 - (row.length - j) * bs, innerY0 + 12 + i * bs, bs - 3, bs - 3, 0)
      }
    }
  }

  // Registration ticks at the four image corners. The width handed to ARCore is
  // the width of the whole PNG, including the white quiet zone, which is
  // invisible on white paper - these give something to put a ruler against.
  const tickLen = Math.round(HEIGHT * 0.03)
  const tickThick = Math.max(2, Math.round(HEIGHT * 0.004))
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x0 = cx === 0 ? 0 : WIDTH - tickLen
    const y0 = cy === 0 ? 0 : HEIGHT - tickThick
    c.rect(x0, y0, tickLen, tickThick, 0) // horizontal arm
    const vx = cx === 0 ? 0 : WIDTH - tickThick
    const vy = cy === 0 ? 0 : HEIGHT - tickLen
    c.rect(vx, vy, tickThick, tickLen, 0) // vertical arm
  }

  // Human-readable label on a white plate along the bottom inner edge.
  const scale = Math.round(innerH * 0.012)
  const textW = label.length * 6 * scale
  const plateX = innerX0 + Math.round((innerW - textW) / 2) - 3 * scale
  const plateY = innerY1 - 11 * scale
  c.rect(plateX, plateY, textW + 6 * scale, 10 * scale, 255)
  drawText(c, label, plateX + 3 * scale, plateY + Math.round(1.5 * scale), scale, 0)

  return encodeGreyPng(c.px, WIDTH, HEIGHT)
}

// ---------------------------------------------------------------- main ----

// name must match MarkerRole.imageName in the Android app.
const MARKERS = [
  {
    name: 'stand_marker',
    label: 'STAND',
    seed: 0x5a17c0de,
    cornerBlocks: ['1111', '1001', '1011', '1111'],
  },
  {
    name: 'reference_marker',
    label: 'REF',
    seed: 0x2b9f31a7,
    cornerBlocks: ['1111', '1101', '1001', '1111'],
  },
]

const here = dirname(fileURLToPath(import.meta.url))
const outDirs = process.argv[2]
  ? [resolve(process.argv[2])]
  : [here, resolve(here, '..', 'android', 'app', 'src', 'main', 'assets', 'markers')]

for (const dir of outDirs) mkdirSync(dir, { recursive: true })

for (const m of MARKERS) {
  const png = buildMarker(m)
  for (const dir of outDirs) {
    const out = join(dir, `${m.name}.png`)
    writeFileSync(out, png)
    console.log(`wrote ${out} (${png.length} bytes)`)
  }
}
