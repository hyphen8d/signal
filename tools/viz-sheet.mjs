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
// ITERATE ON tools/viz-preview.mjs, CONFIRM HERE ONCE. The preview renders
// the same four states from the harness's real Term in a few seconds; this
// takes a minute or more per effect, because swiftshader renders the app at
// 1-3fps. Use this for the final look, which only the real tube can give.
//
//   node tools/viz-sheet.mjs --url=http://127.0.0.1:8123/              # all
//   node tools/viz-sheet.mjs aurora frost --url=... --out=/tmp/sheets  # some
//   node tools/viz-sheet.mjs frost --after=120,400   # + tiles 120/400ms after the kick
//   node tools/viz-sheet.mjs frost --clock=1         # the old unslowed capture
//   node tools/viz-sheet.mjs frost --station=cold-wave  # on another station
//
// Point --url at a dev server running the tree you want judged (defaults to
// the deployed site, like shoot.mjs). Writes <key>.png per effect -- a 2x2
// sheet, captions burned in -- plus all.png (the NO TAP tile of every effect)
// and index.json (per-effect frame rate, clock and kick age) into --out.
//
// Each effect is shown ON ITS OWN STATION (2026-10-20): the first cut drew
// every effect on preset 2 with the visual overridden, so FROST was judged
// on DISTORTION FIELD's CRT character, not NEON HEART's, and the two secret
// stations' forced tints never appeared. presetTune() takes the station
// object, so the secret ones are reached the same way.
//
// The four states, and why each one:
//   NO TAP   syntheticAudio(): what every visitor who declines LINE IN sees,
//            which is most of them. The effect's resting picture.
//   MUTED    SILENT_AUDIO: must read as faint, never as broken or blank.
//   LOUD     a live tap at a steady loud level, between beats.
//   KICK     the same, just after an onset -- set beside LOUD, the pair shows
//            whether the beat is visible at all.
// LOUD/KICK drive AUDIO_BUS directly (the app's own module instance, imported
// at the page's ?v= stamp -- see CLAUDE.md on module identity), because a
// headless Chrome cannot get a real tap (shoot.mjs's visualizer note).
//
// THE KICK TILE, and the slowed clock (2026-10-20). On 2026-10-18, with four
// agents capturing at once, swiftshader ran at 0.2-0.8fps; "two frames after
// the onset" was then seconds of app time, the beat had long decayed, and
// KICK was a second copy of LOUD for EVERY effect. Two agents wrote private
// copies of this file to fix it. What it does now:
//   - The page clock (tools/lib/capture.mjs, record-demo's trick) runs at
//     full speed while an effect warms up -- warm-up is app time -- and is
//     slowed by `--clock` for the frames each tile captures. The default,
//     'auto', picks clock = 60 / measured fps, so the tube renders ~60 frames
//     per APP second: what a 60fps viewer sees, persistence trails included.
//   - Every wait is on rendered frames AND app time, never wall time.
//   - The kick is timed from the frame the driver delivered it on: the app
//     draws it one frame later, and Page.captureScreenshot shows the frame
//     BEFORE the latest one (found by the 2026-10-18 RIPPLE agent), so KICK
//     waits for delivery + 2 frames (`--lag` sets the +2). index.json and the
//     console carry the kick's real age in app ms at capture.
//   - The driver's pulse decays like the real tap's (TAP_PULSE_TAU), and bass
//     and the low bands ride it, instead of snapping back the next frame.
//
// Two limits, both honest rather than fixable here. These are STILLS: motion,
// and how the beat feels, still need a person and a real browser. And the
// global downbeat bloom (pulseBloom in visualizer.js) is CRT state, so it
// shows here and never in viz-preview.

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { session, sleep } from './shoot.mjs'
import { makeRunDir } from './lib/capture.mjs'

const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const OUT = path.resolve(flag('out', path.join(tmpdir(), 'signal-viz-sheet')))
const CLOCK = flag('clock', 'auto')            // 'auto' = 60 / measured fps
const LAG = +flag('lag', 2)                    // frames between delivering the kick and capturing it
const TAIL = +flag('tail', 12)                 // slowed frames rendered before each capture
const AFTER = (flag('after', '') || '').split(',').filter(Boolean).map(Number)
const STATION = flag('station', null)
const wanted = args.filter((a) => !a.startsWith('--'))
mkdirSync(OUT, { recursive: true })

const magick = (a) => {
  const r = spawnSync('magick', a, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`magick failed: ${a.join(' ')}`)
}

// The page-side audio driver: one rAF loop that writes AUDIO_BUS every frame
// from window.__viz. 'none' and 'muted' leave the bus inactive, so the effect
// falls back exactly as it does for a real visitor; 'loud' is a steady bed
// with a spread spectrum; `kick` > 0 makes the next frame an onset, recorded
// in kickFrame/kickAt so the capture can be timed from it.
const DRIVER = `(async () => {
  const { AUDIO_BUS, TAP_PULSE_TAU } = await import('./audio/tap.js?v=' + globalThis.SIGNAL_BUILD)
  const TAU = TAP_PULSE_TAU || 0.12
  window.__viz = { mode: 'none', kick: 0, frames: 0, kickFrame: -1, kickAt: 0, pulse: 0.15, last: performance.now() }
  const tick = () => {
    const v = window.__viz
    const now = performance.now(), dt = Math.max(0, (now - v.last) / 1000)
    v.last = now
    v.frames++
    if (v.mode === 'loud') {
      const k = v.kick > 0
      if (k) { v.kick--; v.kickFrame = v.frames; v.kickAt = now; v.pulse = 1 }
      else v.pulse = Math.max(0.15, v.pulse * Math.exp(-dt / TAU))
      const env = (v.pulse - 0.15) / 0.85   // 1 on the onset, decaying to 0
      AUDIO_BUS.active = true; AUDIO_BUS.gated = false; AUDIO_BUS.source = 'tab'
      AUDIO_BUS.level = 0.7 + 0.25 * env
      AUDIO_BUS.bass = 0.45 + 0.55 * env
      AUDIO_BUS.mid = 0.6; AUDIO_BUS.treble = 0.5
      for (let i = 0; i < AUDIO_BUS.bands9.length; i++) {
        const base = 0.45 + 0.25 * Math.sin(i * 1.3)
        AUDIO_BUS.bands9[i] = i < 3 ? base + (1 - base) * env : base
      }
      AUDIO_BUS.onset = k
      if (k) AUDIO_BUS.onsetAt = now
      AUDIO_BUS.pulse = v.pulse
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
/** Wait for `n` more rendered frames AND `appMs` of app time. Patient about
 *  wall time (10s a frame) because 0.2fps has happened. */
async function waitFor(api, { n = 0, appMs = 0 }) {
  const f0 = await frames(api), t0 = await api.ev('performance.now()')
  const deadline = Date.now() + 30_000 + n * 10_000 + appMs * (await api.ev('window.__signalClock')) * 3
  for (;;) {
    const [f, t] = await api.ev('[window.__viz.frames, performance.now()]')
    if (f - f0 >= n && t - t0 >= appMs) return
    if (Date.now() > deadline) throw new Error(`page rendered ${f - f0}/${n} frames, ${Math.round(t - t0)}/${appMs} app ms before the deadline`)
    await sleep(50)
  }
}
const setClock = (api, n) => api.ev(`window.__signalClock = ${n}`)

const t0All = Date.now()
await session(async (api) => {
  await api.key('p')
  if (!await api.until('window.screen0.program.poweredOn === true', 240, 250)) throw new Error('never powered on')
  await api.appSleep(1200)
  if (!await api.ev(DRIVER)) throw new Error('audio driver did not install')
  const keys = await api.ev(`import('./visuals/index.js?v=' + globalThis.SIGNAL_BUILD).then((m) => m.VISUAL_KEYS)`)
  const run = wanted.length ? wanted : keys
  for (const k of run) if (!keys.includes(k)) throw new Error(`unknown effect "${k}" (have: ${keys.join(', ')})`)
  // Stations by effect, secret ones included (presetTune takes the object).
  await api.ev(`import('./stations.js?v=' + globalThis.SIGNAL_BUILD).then((m) => {
    window.__vizStations = [...m.STATIONS, ...m.SECRET_STATIONS]; return true })`)

  const index = []
  const scratch = makeRunDir('viz-sheet-tiles')
  let clock = CLOCK === 'auto' ? null : Math.max(1, +CLOCK || 1)
  for (const key of run) {
    process.stdout.write(`${key}... `)
    const tEffect = Date.now()
    const set = (js) => api.ev(`(() => { const s = window.screen0, p = s.program; ${js} })()`)
    await setClock(api, 1)
    // Tune to the effect's own station (or --station) and open the
    // visualizer on it. enterVisualizer() directly, as ?game=1 does: the
    // LINE INPUT card is a capture prompt, not what these are of.
    const stId = await set(`
      const all = window.__vizStations
      const st = ${STATION ? `all.find((x) => x.id === ${JSON.stringify(STATION)})` : `all.find((x) => x.visual === ${JSON.stringify(key)}) || p.lockedStation`}
      if (!st) return null
      if (p.visualizerActive) p.exitVisualizer(s)
      if (p.lockedStation !== st) p.presetTune(s, st)
      return st.id`)
    if (!stId) throw new Error(`no station for ${key}${STATION ? ` (--station=${STATION})` : ''}`)
    if (!await api.until(`window.screen0.program.mode === 'locked' && window.screen0.program.lockedStation?.id === ${JSON.stringify(stId)}`, 240, 250)) throw new Error(`never locked ${stId}`)
    await api.appSleep(2500) // the lock sequence's sweeps and text resolves
    await set(`p.muted = false; window.__viz.mode = 'none'
      if (p.lockedStation.visual !== ${JSON.stringify(key)}) p.visualOverrides[p.lockedStation.id] = ${JSON.stringify(key)}
      else delete p.visualOverrides[p.lockedStation.id]
      p.enterVisualizer(s)`)
    if (!await api.until('window.screen0.program.visualizerActive === true', 40, 250)) throw new Error('visualizer did not open')
    const label = await set('return p.activeVisualKey()')
    if (label !== key) throw new Error(`asked for ${key}, tube shows ${label}`)

    // Warm up at full speed, measuring the frame rate as it goes.
    const w0 = Date.now(), f0 = await frames(api)
    await waitFor(api, { n: 6, appMs: 4000 })
    const fps = ((await frames(api)) - f0) / ((Date.now() - w0) / 1000)
    if (clock == null) clock = Math.max(1, Math.min(120, Math.round(60 / Math.max(0.2, fps))))

    // Each tile: slow the clock, render TAIL frames so the persistence buffer
    // holds what a 60fps tube would, capture, and speed back up to settle the
    // next state.
    const shot = async (name) => { const f = path.join(scratch.work, `${key}-${name}.png`); await api.png(f); return f }
    const tile = async (name) => { await setClock(api, clock); await waitFor(api, { n: TAIL }); const f = await shot(name); await setClock(api, 1); return f }
    const none = await tile('none')
    await set(`p.muted = true; window.__viz.mode = 'muted'`)
    await waitFor(api, { n: 3, appMs: 1500 })
    const muted = await tile('muted')
    await set(`p.muted = false; window.__viz.mode = 'loud'`)
    await waitFor(api, { n: 3, appMs: 1500 })
    // LOUD and KICK are one slowed run: LOUD captured, then the onset
    // delivered, then KICK timed from the frame it landed on.
    await setClock(api, clock)
    await waitFor(api, { n: TAIL })
    const loud = await shot('loud')
    await waitFor(api, { n: 2 }) // clear of whatever the LOUD capture overlapped
    await set(`window.__viz.kickFrame = -1; window.__viz.kick = 1`)
    for (let i = 0; ; i++) {
      const [kf, f] = await api.ev('[window.__viz.kickFrame, window.__viz.frames]')
      if (kf >= 0 && f >= kf + LAG) break
      if (i > 4000) throw new Error('the kick was never delivered')
      await sleep(25)
    }
    const kickAge = Math.round(await api.ev('performance.now() - window.__viz.kickAt'))
    const kick = await shot('kick')
    const afters = []
    for (const ms of AFTER) {
      for (let i = 0; ; i++) {
        if ((await api.ev('performance.now() - window.__viz.kickAt')) >= ms) break
        if (i > 20000) throw new Error(`never reached kick+${ms}ms`)
        await sleep(25)
      }
      afters.push([await shot(`after${ms}`), `KICK +${ms}ms`])
    }
    await setClock(api, 1)
    await set(`window.__viz.mode = 'none'`)

    // Each tile: the tube only (the page's black margins carry nothing),
    // captioned, then 2x2 (plus a row of after-kick tiles if asked).
    const cap = (f, c) => {
      const o = f.replace('.png', '-t.png')
      magick([f, '-resize', '1273x952', '-gravity', 'north', '-background', '#222', '-splice', '0x34',
        '-fill', '#ddd', '-pointsize', '24', '-annotate', '+0+4', `${key.toUpperCase()} on ${stId} - ${c}`, o])
      return o
    }
    const tiles = [[none, 'NO TAP'], [muted, 'MUTED'], [loud, 'LOUD'], [kick, `KICK (+${kickAge}ms)`]].map(([f, c]) => cap(f, c))
    const rows = [['(', tiles[0], tiles[1], '+append', ')'], ['(', tiles[2], tiles[3], '+append', ')']]
    for (let i = 0; i < afters.length; i += 2) rows.push(['(', ...afters.slice(i, i + 2).map(([f, c]) => cap(f, c)), '+append', ')'])
    const sheet = path.join(OUT, `${key}.png`)
    magick([...rows.flat(), '-background', '#000', '-append', '-resize', '1900x', sheet])
    const secs = Math.round((Date.now() - tEffect) / 1000)
    index.push({ key, station: stId, fps: +fps.toFixed(1), clock, kickAgeMs: kickAge, seconds: secs, sheet, noTap: tiles[0] })
    console.log(`${fps.toFixed(1)}fps, clock ${clock}x, kick captured at +${kickAge}ms app, ${secs}s -> ${sheet}`)
  }
  // all.png: the NO TAP tile of every effect, six to a row -- the one
  // image that shows whether the set reads as one family.
  const rows = []
  for (let i = 0; i < index.length; i += 6) {
    const r = path.join(scratch.work, `row${i}.png`)
    magick([...index.slice(i, i + 6).map((e) => e.noTap), '+append', r])
    rows.push(r)
  }
  magick([...rows, '-append', '-resize', '2400x', path.join(OUT, 'all.png')])
  writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index.map(({ noTap, ...e }) => e), null, 2) + '\n')
  console.log(`all.png + index.json -> ${OUT} (${Math.round((Date.now() - t0All) / 1000)}s)`)
  scratch.remove()
}, { kind: 'viz-sheet' })
