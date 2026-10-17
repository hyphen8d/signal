// Visualizer contact sheets: every effect, captured off the REAL tube in
// headless Chrome, under the four audio states a visitor actually meets.
// Written 2026-10-16 for the visualizer design pass, after a day in which the
// test harness called all 18 effects healthy -- every one drew, moved and
// used only glyphs in the font -- while the live tube showed AURORA's
// curtains as hard-edged rectangles and NEON HEART's wall as nothing at all.
// The text grid cannot see brightness, bloom, persistence or how a shade
// block actually rasters; a capture can. Judge effects from these, not from
// h.rows().
//
//   node tools/viz-sheet.mjs --url=http://127.0.0.1:8123/              # all
//   node tools/viz-sheet.mjs aurora frost --url=... --out=/tmp/sheets  # some
//
// Point --url at a dev server running the tree you want judged (defaults to
// the deployed site, like shoot.mjs). Writes <key>.png per effect -- a 2x2
// sheet, captions burned in -- plus all.png (the NO TAP tile of every effect)
// and index.json (per-effect frame rate and file names) into --out.
//
// The four states, and why each one:
//   NO TAP   syntheticAudio(): what every visitor who declines LINE IN sees,
//            which is most of them. The effect's resting picture.
//   MUTED    SILENT_AUDIO: must read as faint, never as broken or blank.
//   LOUD     a live tap at a steady loud level, between beats.
//   KICK     the same, one rendered frame after an onset -- set beside LOUD,
//            the pair shows whether the beat is visible at all.
// LOUD/KICK drive AUDIO_BUS directly (the app's own module instance, imported
// at the page's ?v= stamp -- see CLAUDE.md on module identity), because a
// headless Chrome cannot get a real tap (shoot.mjs's visualizer note).
//
// Two limits, both honest rather than fixable here. Swiftshader renders this
// app at ~3fps, so these are STILLS: motion, and how the beat feels at 60fps,
// still need a person and a real browser. And since persistence now fades by
// the clock (decayForFrame, 2026-10-16), the trails in a still are the trails
// a 60fps viewer sees, which they were not before that change.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { session, sleep } from './shoot.mjs'

const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const OUT = path.resolve(flag('out', path.join(tmpdir(), 'signal-viz-sheet')))
const wanted = args.filter((a) => !a.startsWith('--'))
mkdirSync(OUT, { recursive: true })

const magick = (a) => {
  const r = spawnSync('magick', a, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`magick failed: ${a.join(' ')}`)
}

// The page-side audio driver: one rAF loop that writes AUDIO_BUS every frame
// from window.__viz. 'none' and 'muted' leave the bus inactive, so the effect
// falls back exactly as it does for a real visitor; 'loud' is a steady bed
// with a spread spectrum; `kick` > 0 makes the next frames an onset.
const DRIVER = `(async () => {
  const { AUDIO_BUS } = await import('./audio/tap.js?v=' + globalThis.SIGNAL_BUILD)
  window.__viz = { mode: 'none', kick: 0, frames: 0 }
  const tick = () => {
    const v = window.__viz
    v.frames++
    if (v.mode === 'loud') {
      const k = v.kick > 0
      if (k) v.kick--
      AUDIO_BUS.active = true; AUDIO_BUS.gated = false; AUDIO_BUS.source = 'tab'
      AUDIO_BUS.level = k ? 0.95 : 0.7
      AUDIO_BUS.bass = k ? 1 : 0.45
      AUDIO_BUS.mid = 0.6; AUDIO_BUS.treble = 0.5
      for (let i = 0; i < AUDIO_BUS.bands9.length; i++) AUDIO_BUS.bands9[i] = (k && i < 3) ? 1 : 0.45 + 0.25 * Math.sin(i * 1.3)
      AUDIO_BUS.onset = k
      if (k) AUDIO_BUS.onsetAt = performance.now()
      AUDIO_BUS.pulse = k ? 1 : 0.15
      AUDIO_BUS.bpm = 120; AUDIO_BUS.bpmConf = 0.8
    } else {
      AUDIO_BUS.active = false; AUDIO_BUS.onset = false
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return true
})()`

const frames = (api) => api.ev('window.__viz.frames')
async function waitFrames(api, n) {
  const start = await frames(api)
  for (let i = 0; i < 600; i++) { if ((await frames(api)) - start >= n) return; await sleep(50) }
  throw new Error(`page rendered fewer than ${n} frames in 30s`)
}

await session(async (api) => {
  // Power on and lock a preset. NOT shoot.mjs's tuneTo(): that waits for
  // PLAYING, and the visualizer needs only a lock -- headless playback
  // against a local server was the flaky part of the first run, and none of
  // these effects read the player (the audio states are driven below).
  await api.key('p')
  if (!await api.until('window.screen0.program.poweredOn === true', 60, 250)) throw new Error('never powered on')
  await sleep(1200)
  await api.key(2)
  if (!await api.until('!!window.screen0.program.lockedStation', 60, 250)) throw new Error('never locked a station')
  await sleep(2500) // the lock sequence's sweeps and text resolves
  await api.key('v')
  // Decline LINE IN: a capture prompt is not what these are of.
  if (await api.ev('window.screen0.program.tapConsentOpen')) {
    await api.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78, text: 'n' })
    await api.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78 })
  }
  if (!await api.until('window.screen0.program.visualizerActive === true', 20, 250)) throw new Error('visualizer did not open')
  await sleep(4000) // the '[A] = LINE IN' flash the decline leaves in the legend
  if (!await api.ev(DRIVER)) throw new Error('audio driver did not install')
  const keys = await api.ev(`import('./visuals/index.js?v=' + globalThis.SIGNAL_BUILD).then((m) => m.VISUAL_KEYS)`)
  const run = wanted.length ? wanted : keys
  for (const k of run) if (!keys.includes(k)) throw new Error(`unknown effect "${k}" (have: ${keys.join(', ')})`)

  const index = []
  const tmp = mkdtempSync(path.join(tmpdir(), 'signal-viz-'))
  try {
    for (const key of run) {
      process.stdout.write(`${key}... `)
      const set = (js) => api.ev(`(() => { const p = window.screen0.program; ${js} })()`)
      await set(`p.visualOverrides[p.lockedStation.id] = ${JSON.stringify(key)}; p.muted = false; window.__viz.mode = 'none'`)
      const t0 = Date.now(), f0 = await frames(api)
      await waitFrames(api, 14)
      const fps = ((await frames(api)) - f0) / ((Date.now() - t0) / 1000)
      const label = await set('return p.activeVisualKey()')
      if (label !== key) throw new Error(`asked for ${key}, tube shows ${label}`)
      const shot = async (name) => { const f = path.join(tmp, `${key}-${name}.png`); await api.png(f); return f }
      const none = await shot('none')
      await set(`p.muted = true; window.__viz.mode = 'muted'`)
      await waitFrames(api, 10)
      const muted = await shot('muted')
      await set(`p.muted = false; window.__viz.mode = 'loud'`)
      await waitFrames(api, 14)
      const loud = await shot('loud')
      await set(`window.__viz.kick = 1`)
      await waitFrames(api, 2)
      const kick = await shot('kick')
      await set(`window.__viz.mode = 'none'`)

      // Each tile: the tube only (the page's black margins carry nothing),
      // captioned, then 2x2.
      const tiles = [[none, 'NO TAP'], [muted, 'MUTED'], [loud, 'LOUD'], [kick, 'KICK']].map(([f, cap]) => {
        const o = f.replace('.png', '-t.png')
        magick([f, '-resize', '1273x952', '-gravity', 'north', '-background', '#222', '-splice', '0x34',
          '-fill', '#ddd', '-pointsize', '24', '-annotate', '+0+4', `${key.toUpperCase()} - ${cap}`, o])
        return o
      })
      const sheet = path.join(OUT, `${key}.png`)
      magick(['(', tiles[0], tiles[1], '+append', ')', '(', tiles[2], tiles[3], '+append', ')', '-append', '-resize', '1900x', sheet])
      index.push({ key, fps: +fps.toFixed(1), sheet, noTap: tiles[0] })
      console.log(`${fps.toFixed(1)}fps -> ${sheet}`)
    }
    // all.png: the NO TAP tile of every effect, six to a row -- the one
    // image that shows whether the set reads as one family.
    const rows = []
    for (let i = 0; i < index.length; i += 6) {
      const r = path.join(tmp, `row${i}.png`)
      magick([...index.slice(i, i + 6).map((e) => e.noTap), '+append', r])
      rows.push(r)
    }
    magick([...rows, '-append', '-resize', '2400x', path.join(OUT, 'all.png')])
    writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index.map(({ noTap, ...e }) => e), null, 2) + '\n')
    console.log(`all.png + index.json -> ${OUT}`)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
