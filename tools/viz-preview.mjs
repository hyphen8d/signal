// Fast visualizer previews: an effect rendered through the test harness's
// REAL Term -- the same beam-intensity framebuffer the CRT is fed -- in the
// same four states as tools/viz-sheet.mjs, written to a PNG in seconds.
//
//   node tools/viz-preview.mjs frost                    # one effect
//   node tools/viz-preview.mjs frost ripple --after=120,400
//   node tools/viz-preview.mjs all --out=/tmp/prev      # every effect
//   node tools/viz-preview.mjs frost --phosphor=vt320 --station=nin --scale=2
//
// ITERATE HERE, CONFIRM ON viz-sheet ONCE AT THE END. This cannot show what
// the tube adds: bloom, glow, the aperture mask, phosphor persistence and
// trails, the downbeat bloom (pulseBloom) and any other crt.params change.
// It shows exactly what the effect DRAWS -- which cells, which attributes,
// which putGlyph() bitmaps -- tinted by the phosphor, on the effect's own
// station (its CRT brightness and any forced tint included). viz-sheet takes
// a minute or more per effect against a 1-3fps swiftshader Chrome; this
// takes a second or two, and runs no Chrome at all, so it needs no lock.
//
// Written 2026-10-20. On 2026-10-18, three of the four agents redesigning
// one effect each wrote a private version of this (harness boot, draw, dump
// term.fb as PGM, magick to PNG) because waiting ~90s on viz-sheet for every
// tweak was most of their day. This is that script, shared: no ImageMagick,
// no dependencies (the PNG encoder is tools/lib/png.mjs, node:zlib only).
//
// What it drives: the real program, booted by tests/harness.mjs on a fake
// clock, powered on, tuned to the effect's station (presetTune(), so the two
// secret stations work too) and put into the visualizer -- so the effect is
// reached through drawVisualizerFrame() exactly as live, not by calling its
// draw() by hand. AUDIO_BUS is written before every 16ms frame by the same
// driver viz-sheet uses (steady LOUD bed; an onset whose pulse decays like
// the real tap's), on the booted program's own tap.js instance.
//
// The states (see viz-sheet's header for why each one): NO TAP after 4s,
// MUTED after 1.5s, LOUD after 1.5s, KICK 32ms (two frames) after the onset
// -- about where viz-sheet's KICK lands -- and `--after` tiles at those ms
// after the onset.

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { canvas, encodePNG } from './lib/png.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const STEP = 16

/** Tint a Term framebuffer into an RGB image, stretched vertically to the
 *  tube's 4:3 face (nearest row) and scaled by `scale`. */
export function tintFramebuffer(term, tint, { brightness = 1, scale = 1, aspect = 4 / 3 } = {}) {
  const sw = term.w, sh = term.h
  const w = Math.round(sw * scale), h = Math.round((sw / aspect) * scale)
  const img = canvas(w, h)
  const lut = [0, 1, 2].map((c) => Uint8Array.from({ length: 256 }, (_, v) => Math.min(255, Math.round(v * tint[c] * brightness))))
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.floor((y / h) * sh))
    for (let x = 0; x < w; x++) {
      const v = term.fb[sy * sw + Math.min(sw - 1, Math.floor(x / scale))]
      const o = (y * w + x) * 3
      img.px[o] = lut[0][v]; img.px[o + 1] = lut[1][v]; img.px[o + 2] = lut[2][v]
    }
  }
  return img
}

/** A caption strip drawn in the app's own BDF font (no ImageMagick here). */
async function caption(term, text, w, scale) {
  const { Term } = await import('../src/term.js')
  const cols = Math.max(1, Math.floor((w / scale - 12) / term.advance))
  const t = new Term(term.font, cols, 1, 6, 3)
  t.showCursor = false // a fresh Term stamps a cursor block over cell 0
  t.text(0, 0, text.slice(0, cols))
  t.raster()
  return tintFramebuffer(t, [0.85, 0.85, 0.85], { scale, aspect: t.w / t.h })
}

/** Render one effect's states. Returns { key, station, tiles: [{label, img}] }. */
export async function previewEffect(key, { station = null, phosphor = null, after = [], scale = 1 } = {}) {
  const { boot } = await import(pathToFileURL(path.join(root, 'tests', 'harness.mjs')).href)
  const { STATIONS, SECRET_STATIONS } = await import(pathToFileURL(path.join(root, 'stations.js')).href)
  const all = [...STATIONS, ...SECRET_STATIONS]
  const st = station ? all.find((s) => s.id === station) : all.find((s) => s.visual === key)
  if (!st) throw new Error(station ? `no station "${station}"` : `no station carries "${key}" (pass --station)`)
  // A secret station cannot be booted onto by id; boot on a public one and
  // tune it by object, as its key does.
  const h = await boot({ station: st.secret ? STATIONS[0].id : st.id })
  try {
    const p = h.program, s = h.screen
    h.powerOn()
    if (p.lockedStation?.id !== st.id) {
      // The booted program compares stations by identity, so hand it its own
      // module instance's object, not the one imported above.
      const own = await import(`../stations.js?v=${h.tag}`)
      const obj = [...own.STATIONS, ...own.SECRET_STATIONS].find((x) => x.id === st.id)
      p.presetTune(s, obj)
      h.advance(3000)
    }
    if (p.lockedStation?.id !== st.id) throw new Error(`never locked ${st.id} (on ${p.lockedStation?.id})`)
    const { VISUALS } = await import(`../visuals/index.js?v=${h.tag}`)
    if (!VISUALS[key]) throw new Error(`unknown effect "${key}" (have: ${Object.keys(VISUALS).join(', ')})`)
    if (p.lockedStation.visual !== key) p.visualOverrides[p.lockedStation.id] = key
    p.enterVisualizer(s)
    if (p.activeVisualKey() !== key) throw new Error(`asked for ${key}, visualizer shows ${p.activeVisualKey()}`)
    const tint = phosphor ? h.config.PHOSPHORS[phosphor] : h.crt.phosphor
    if (!tint) throw new Error(`unknown phosphor "${phosphor}" (have: ${Object.keys(h.config.PHOSPHORS).join(', ')})`)

    const { AUDIO_BUS, TAP_PULSE_TAU } = await import(`../audio/tap.js?v=${h.tag}`)
    const TAU = TAP_PULSE_TAU || 0.12
    const v = { mode: 'none', pulse: 0.15, kick: false }
    const drive = () => {
      if (v.mode !== 'loud') { AUDIO_BUS.active = false; AUDIO_BUS.onset = false; return }
      const k = v.kick
      v.kick = false
      v.pulse = k ? 1 : Math.max(0.15, v.pulse * Math.exp(-STEP / 1000 / TAU))
      const env = (v.pulse - 0.15) / 0.85
      AUDIO_BUS.active = true; AUDIO_BUS.gated = false; AUDIO_BUS.source = 'tab'
      AUDIO_BUS.level = 0.7 + 0.25 * env
      AUDIO_BUS.bass = 0.45 + 0.55 * env
      AUDIO_BUS.mid = 0.6; AUDIO_BUS.treble = 0.5
      for (let i = 0; i < AUDIO_BUS.bands9.length; i++) {
        const base = 0.45 + 0.25 * Math.sin(i * 1.3)
        AUDIO_BUS.bands9[i] = i < 3 ? base + (1 - base) * env : base
      }
      AUDIO_BUS.onset = k
      if (k) AUDIO_BUS.onsetAt = performance.now()
      AUDIO_BUS.pulse = v.pulse
      AUDIO_BUS.bpm = 120; AUDIO_BUS.bpmConf = 0.8
    }
    const run = (ms) => { for (let t = 0; t < ms; t += STEP) { drive(); h.advance(STEP) } }
    const tiles = []
    const snap = (label) => {
      h.term.markAll?.(); h.term.raster()
      tiles.push({ label, img: tintFramebuffer(h.term, tint, { brightness: h.crt.params.brightness || 1, scale }) })
    }
    p.muted = false; v.mode = 'none'; run(4000); snap('NO TAP')
    p.muted = true; v.mode = 'muted'; run(1500); snap('MUTED')
    p.muted = false; v.mode = 'loud'; run(1500); snap('LOUD')
    v.kick = true; run(2 * STEP); snap('KICK +32ms')
    let at = 2 * STEP
    for (const ms of [...after].sort((a, b) => a - b)) { if (ms > at) { run(ms - at); at = ms } snap(`KICK +${ms}ms`) }
    for (const t of tiles) t.cap = await caption(h.term, `${key.toUpperCase()} on ${st.id} - ${t.label}`, t.img.w, scale)
    return { key, station: st.id, tiles }
  } finally { h.shutdown() }
}

/** Lay tiles out two to a row, captions above, on black. */
export function sheet(tiles) {
  const tw = tiles[0].img.w, th = tiles[0].img.h, ch = tiles[0].cap ? tiles[0].cap.h : 0, gap = 6
  const rows = Math.ceil(tiles.length / 2)
  const img = canvas(tw * 2 + gap, rows * (th + ch + gap) - gap, [12, 12, 12])
  tiles.forEach((t, i) => {
    const x = (i % 2) * (tw + gap), y = Math.floor(i / 2) * (th + ch + gap)
    if (t.cap) img.blit(t.cap, x, y)
    img.blit(t.img, x, y + ch)
  })
  return img
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (n, d) => { const f = args.find((a) => a.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : d }
  const out = path.resolve(flag('out', path.join(os.homedir(), '.cache', 'signal', 'viz-preview')))
  const after = (flag('after', '') || '').split(',').filter(Boolean).map(Number)
  const opts = { station: flag('station', null), phosphor: flag('phosphor', null), after, scale: +flag('scale', 1) || 1 }
  let keys = args.filter((a) => !a.startsWith('--'))
  if (!keys.length) { console.error('usage: node tools/viz-preview.mjs <effect...|all> [--after=ms,ms] [--station=id] [--phosphor=name] [--scale=n] [--out=dir]'); process.exit(2) }
  // 'all' = every effect: visuals/<key>.js, one per effect (the module graph
  // under visuals/index.js needs a booted ?v= stamp to import, so read the dir).
  if (keys.includes('all')) keys = readdirSync(path.join(root, 'visuals')).filter((f) => f.endsWith('.js') && !['index.js', 'shared.js'].includes(f)).map((f) => f.slice(0, -3)).sort()
  mkdirSync(out, { recursive: true })
  for (const key of keys) {
    const t0 = Date.now()
    const r = await previewEffect(key, opts)
    const img = sheet(r.tiles)
    const file = path.join(out, `${key}.png`)
    writeFileSync(file, encodePNG(img.w, img.h, img.px))
    console.log(`${key} on ${r.station}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${file}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
