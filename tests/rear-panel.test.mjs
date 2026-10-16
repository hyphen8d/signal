// The REAR PANEL ([R], 2026-10-15): hum, static, voice and screen.
//
// Three layers, tested at each: settings.js's pure rules (defaults, the
// reduced-motion default, per-key restore, the stops), the card as drawn and
// driven through the real key() path, and the four sinks the settings reach
// -- read back from the module instances the booted program is actually
// using (`?v=${h.tag}`, see harness.mjs), since that is the only way to see
// the WebAudio side from Node.

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'
import { installFakeAudio } from './fake-audio.mjs'
import { SECRET_STATIONS, STATIONS } from '../stations.js'

const S = await import('../settings.js')

const openPanel = (h) => { h.powerOn(); h.advance(2000); h.key('r'); h.advance(100) }
const snapshot = (h, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) out.push(h.row(y)); return out }
const savedPanel = (h) => JSON.parse(globalThis.localStorage.getItem('signal:state:v1')).panel
/** Select a row by key from wherever the cursor is, through the real keys. */
const selectRow = (h, key) => {
  const want = S.PANEL_ROWS.findIndex((r) => r.key === key)
  while (h.program._panelRow !== want) h.key('ArrowDown')
}

// --- settings.js ------------------------------------------------------------

test('defaults are the set as built, except SCREEN under reduced motion', () => {
  assert.deepEqual(S.defaultPanel(), { hum: 'normal', static: 'normal', voice: 'on', screen: 'full' })
  assert.equal(S.defaultPanel({ reducedMotion: true }).screen, 'calm')
  // Every default is one of its own row's options -- a typo here would make
  // stepOption's indexOf miss and the card draw no position at all.
  for (const row of S.PANEL_ROWS) assert.ok(row.options.includes(row.def), `${row.key} default is an option`)
})

test('a saved panel is read back per key: one bad value costs one row', () => {
  const out = S.normalizePanel({ hum: 'low', static: 'LOUD', voice: 'off', screen: 42 })
  assert.deepEqual(out, { hum: 'low', static: 'normal', voice: 'off', screen: 'full' })
  assert.deepEqual(S.normalizePanel(null), S.defaultPanel())
  assert.deepEqual(S.normalizePanel('junk'), S.defaultPanel())
})

test('a saved SCREEN choice beats the reduced-motion default, both ways', () => {
  assert.equal(S.normalizePanel({ screen: 'full' }, { reducedMotion: true }).screen, 'full')
  assert.equal(S.normalizePanel({ screen: 'calm' }, { reducedMotion: false }).screen, 'calm')
  assert.equal(S.normalizePanel({}, { reducedMotion: true }).screen, 'calm')
})

test('settings stop at their ends rather than wrapping', () => {
  const hum = S.PANEL_ROWS.find((r) => r.key === 'hum')
  assert.equal(S.stepOption(hum, 'normal', 1), 'normal', '[->] at NORMAL stays NORMAL, never wraps to OFF')
  assert.equal(S.stepOption(hum, 'off', -1), 'off')
  assert.equal(S.stepOption(hum, 'normal', -1), 'low')
  assert.equal(S.stepOption(hum, 'bogus', -1), 'low', 'an unknown value steps from the default')
})

test('every option has a label, every row a note, and the trims cover the levels', () => {
  for (const row of S.PANEL_ROWS) {
    assert.ok(S.ROW_NOTES[row.key], `${row.key} has a note`)
    for (const o of row.options) assert.ok(S.OPTION_LABELS[o], `${o} has a label`)
  }
  for (const k of ['off', 'low', 'normal']) assert.ok(Number.isFinite(S.LEVEL_TRIM[k]))
  assert.equal(S.LEVEL_TRIM.off, 0)
  assert.equal(S.LEVEL_TRIM.normal, 1)
})

// --- the card ----------------------------------------------------------------

test('[R] opens the card inside its box, and every line fits the interior', async () => {
  const h = await boot()
  try {
    openPanel(h)
    assert.equal(h.program.panelOpen, true)
    assert.ok(h.row(8).includes(' REAR PANEL '), `title on the top border: ${h.row(8)}`)
    for (const row of S.PANEL_ROWS) assert.ok(h.find(row.label) >= 10 && h.find(row.label) <= 13, `${row.label} drawn on the card`)
    // The borders survive every row -- a line that overran would have
    // written through column 65 (CARD_X1) or 14 (CARD_X0).
    for (let y = 9; y <= 15; y++) {
      assert.equal(h.row(y)[14], '│', `left border intact on row ${y}`)
      assert.equal(h.row(y)[65], '│', `right border intact on row ${y}`)
    }
    // Every row's note, not only the one on screen: they are drawn one at a
    // time, so a long one would only show up when someone selected that row.
    for (const row of S.PANEL_ROWS) {
      selectRow(h, row.key)
      assert.ok(h.row(14).includes(S.ROW_NOTES[row.key]), `${row.key} note drawn whole`)
      assert.equal(h.row(14)[65], '│')
    }
    assert.ok(h.row(15).includes('[R] CLOSE'))
  } finally { h.shutdown() }
})

test('[R] closes it and puts back exactly what it covered', async () => {
  const h = await boot()
  try {
    h.powerOn(); h.advance(2000)
    const before = snapshot(h, 8, 16)
    h.key('r'); h.advance(100)
    assert.notDeepEqual(snapshot(h, 8, 16), before, 'the card is actually drawn')
    h.key('r'); h.advance(700)
    assert.equal(h.program.panelOpen, false)
    assert.deepEqual(snapshot(h, 8, 16), before)
    // Escape closes too.
    h.key('r'); h.key('Escape'); h.advance(100)
    assert.equal(h.program.panelOpen, false)
  } finally { h.shutdown() }
})

test('the arrows set and select; the change saves at once', async () => {
  const h = await boot()
  try {
    openPanel(h)
    h.key('ArrowLeft')
    assert.equal(h.program.panel.hum, 'low')
    assert.equal(savedPanel(h).hum, 'low', 'persisted without closing the card')
    h.key('ArrowLeft')
    assert.equal(h.program.panel.hum, 'off')
    h.key('ArrowDown'); h.key('ArrowLeft')
    assert.equal(h.program.panel.static, 'low')
    // Up from the first row wraps to the last -- selection always moves.
    h.key('ArrowUp'); h.key('ArrowUp')
    assert.equal(S.PANEL_ROWS[h.program._panelRow].key, 'screen')
    // The selected position is the one drawn inverse: read the attribute
    // plane, since the characters alone cannot show which position is in.
    const y = 10 + S.PANEL_ROWS.findIndex((r) => r.key === 'hum')
    const x = h.row(y).indexOf(' OFF ')
    assert.ok(x > 0)
    assert.ok(h.term.inverse[y * h.term.cols + x + 1], 'OFF is lit on the HUM row')
  } finally { h.shutdown() }
})

test('an arrow against a stop neither clicks nor moves; one that moves does both', async () => {
  const h = await boot()
  try {
    openPanel(h)
    // From the defaults HUM is at NORMAL, its right-hand stop.
    assert.equal(h.program.isMappedKey({ key: 'ArrowRight' }), false, '[->] at the stop is not a command')
    assert.equal(h.program.isMappedKey({ key: 'ArrowLeft' }), true)
    assert.equal(h.program.isMappedKey({ key: 'ArrowUp' }), true)
    assert.equal(h.program.isMappedKey({ key: 'r' }), true)
    assert.equal(h.program.isMappedKey({ key: 'n' }), false, 'every other key is swallowed silently')
    const before = h.rows().join('\n')
    h.key('ArrowRight'); h.advance(50)
    assert.equal(h.program.panel.hum, 'normal')
    assert.equal(h.rows().slice(8, 17).join('\n'), before.split('\n').slice(8, 17).join('\n'))
  } finally { h.shutdown() }
})

test('the card owns the keys while it is up: no seek, no volume, no track skip', async () => {
  const h = await boot()
  try {
    openPanel(h)
    const { freq, volume, currentTrack } = h.program
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'n', 's', '5']) h.key(k)
    h.advance(500)
    assert.equal(h.program.freq, freq)
    assert.equal(h.program.volume, volume)
    assert.equal(h.program.currentTrack, currentTrack)
    assert.equal(h.program.panelOpen, true)
  } finally { h.shutdown() }
})

test('a track ending under the card leaves the card untouched', async () => {
  const h = await boot({ player: true })
  try {
    openPanel(h)
    const before = snapshot(h, 8, 16)
    h.player.endTrack(); h.advance(1200)
    assert.deepEqual(snapshot(h, 8, 16), before)
    h.key('r'); h.advance(700)
    assert.ok(h.row(14).includes('PLAYING'), `playback row back after close: ${h.row(14)}`)
  } finally { h.shutdown() }
})

test('the sleep timer running out takes the card down with the set', async () => {
  const h = await boot()
  try {
    h.powerOn(); h.advance(2000)
    h.key('t'); h.advance(100)
    h.key('r'); h.advance(100)
    assert.equal(h.program.panelOpen, true)
    h.program._sleepUntil = Date.now() + 500
    h.advance(3000)
    assert.equal(h.program.poweredOn, false)
    assert.equal(h.program.panelOpen, false, 'not stranded open through STANDBY')
    h.advance(1000)
    h.key('p'); h.advance(h.bootMs + 1100)
    assert.equal(h.program.poweredOn, true, 'the set still answers [P] afterwards')
  } finally { h.shutdown() }
})

test('the card is announced: opening it, moving between rows, and every change', async () => {
  const h = await boot()
  try {
    openPanel(h)
    assert.ok(h.announced.at(-1).startsWith('Rear panel. hum: normal, static: normal, voice: on, screen: full.'), h.announced.at(-1))
    h.key('ArrowDown')
    assert.equal(h.announced.at(-1), 'static: normal')
    h.key('ArrowLeft')
    assert.equal(h.announced.at(-1), 'static: low')
    // A second opening of an unchanged panel is still said.
    h.key('r'); h.advance(700); h.key('r')
    assert.ok(h.announced.at(-1).startsWith('Rear panel.'))
  } finally { h.shutdown() }
})

// --- what the settings reach ------------------------------------------------

test('a saved panel is applied at boot: trims set, screen calm from STANDBY on', async () => {
  const h = await boot({ saved: { panel: { hum: 'off', static: 'low', voice: 'off', screen: 'calm' } } })
  try {
    const sfx = await import(`../audio/sfx.js?v=${h.tag}`)
    assert.equal(sfx.humTrim, 0)
    assert.equal(sfx.staticTrim, S.LEVEL_TRIM.low)
    assert.equal(h.crt.params.flicker, 0, 'no flicker on the STANDBY screen')
    assert.equal(h.crt.params.roll, 0)
    h.powerOn(); h.advance(2000)
    assert.equal(h.crt.params.flicker, 0, 'and none after power-on, whatever the station sets')
    assert.equal(h.crt.params.roll, 0)
  } finally { h.shutdown() }
})

test('reduced motion boots CALM; a saved FULL overrides it', async () => {
  let h = await boot({ reducedMotion: true })
  try {
    assert.equal(h.program.panel.screen, 'calm')
    assert.equal(h.crt.params.flicker, 0)
  } finally { h.shutdown() }
  h = await boot({ reducedMotion: true, saved: { panel: { screen: 'full' } } })
  try {
    assert.equal(h.program.panel.screen, 'full')
    assert.ok(h.crt.params.flicker > 0)
  } finally { h.shutdown() }
})

test('SCREEN switches live, both ways, without stranding the station\'s own picture', async () => {
  const h = await boot()
  try {
    openPanel(h)
    const hooks = await import(`../crt-hooks.js?v=${h.tag}`)
    const fullFlicker = h.crt.params.flicker
    const fullBloom = h.crt.params.bloomAmt
    assert.ok(fullFlicker > 0)
    selectRow(h, 'screen')
    h.key('ArrowLeft')
    assert.equal(h.program.panel.screen, 'calm')
    assert.equal(hooks.isCalmScreen(), true)
    assert.equal(h.crt.params.flicker, 0)
    assert.equal(h.crt.params.roll, 0)
    assert.equal(h.crt.params.bloomAmt, fullBloom, 'calm touches motion, not the tube\'s character')
    h.key('ArrowRight')
    assert.equal(h.crt.params.flicker, fullFlicker, 'FULL puts the station\'s own flicker back')
  } finally { h.shutdown() }
})

// Pinned into the widest gap on YM (2026-10-16). Forty seeks right from a
// random station failed about one run in four: the seek WRAPS at the band
// edge, so where forty presses land depends on where you started, and
// often it was within reach of another station (secret ones count -- they
// are signals on the dial) and the fringe assertion failed. Now: start on
// the station above the widest gap between adjacent signals and step left
// to its middle. Derived from the roster rather than named, so a roster
// change keeps it working, and the setup assertion below says so if a new
// station ever closes the gap.
const ymSignals = [...STATIONS, ...SECRET_STATIONS].filter((st) => st.band === 'ym').sort((a, b) => a.freq - b.freq)
const widest = ymSignals.slice(1)
  .map((b, i) => ({ a: ymSignals[i], b }))
  .filter(({ b }) => !b.secret)
  .sort((x, y) => (y.b.freq - y.a.freq) - (x.b.freq - x.a.freq))[0]
test('CALM: no idle roll or tear, no glitch flash, and off-station the bar never rolls', async () => {
  const h = await boot({ station: widest.b.id, saved: { panel: { screen: 'calm' } } })
  try {
    h.powerOn(); h.advance(2000)
    const p = h.crt.params
    const before = { roll: p.roll, chroma: p.chroma, snow: p.snow }
    h.program.crtIdleEvent(h.screen, 'roll'); h.advance(400)
    h.program.crtIdleEvent(h.screen, 'tear'); h.advance(20)
    assert.deepEqual({ roll: p.roll, chroma: p.chroma, snow: p.snow }, before, 'idle events are skipped')
    const hooks = await import(`../crt-hooks.js?v=${h.tag}`)
    hooks.flashCrtGlitch(h.screen); h.advance(20)
    assert.equal(p.chroma, before.chroma, 'no glitch spike')
    // Seek well off any station: the fringe still says "no signal", the
    // bar does not roll and the snow stays near its floor.
    const { NEAR_THRESHOLD, SEEK_STEP, nearestSignal } = await import(`../tuning.js?v=${h.tag}`)
    const presses = Math.round((widest.b.freq - widest.a.freq) / 2 / SEEK_STEP)
    for (let i = 0; i < presses; i++) h.key('ArrowLeft')
    h.advance(200)
    assert.equal(h.program.mode, 'seeking')
    const near = nearestSignal(h.program.freq, h.program.band)
    assert.ok(!near || near.dist > NEAR_THRESHOLD, `test setup: really off-station (${h.program.freq}, ${near?.dist})`)
    assert.equal(p.roll, 0)
    assert.ok(p.snow <= 0.004 + 1e-9, `snow stays low off-station: ${p.snow}`)
    assert.ok(p.chroma > before.chroma, 'the off-station fringe is kept')
  } finally { h.shutdown() }
})

test('FULL is untouched: the idle roll still rolls (the gate is not always on)', async () => {
  // The mutation check for the test above -- if crtIdleEvent's calm gate
  // were inverted or always true, this is the one that goes red.
  const h = await boot()
  try {
    h.powerOn(); h.advance(2000)
    const base = h.crt.params.roll
    h.program.crtIdleEvent(h.screen, 'roll'); h.advance(200)
    assert.ok(h.crt.params.roll > base, 'roll ramps toward 0.45')
  } finally { h.shutdown() }
})

test('VOICE: silences the presenters but not the broadcast, and releases a duck', async () => {
  const h = await boot()
  try {
    const voice = await import(`../audio/voice.js?v=${h.tag}`)
    openPanel(h)
    assert.equal(voice.voiceSilenced(h.program), false)
    h.program.duckFor(8000)
    assert.ok(h.program._duckUntil > Date.now())
    selectRow(h, 'voice')
    h.key('ArrowLeft')
    assert.equal(h.program.panel.voice, 'off')
    assert.equal(voice.voiceSilenced(h.program), true)
    assert.equal(h.program.muted, false, 'VOICE is not mute')
    assert.equal(h.program._duckUntil, 0, 'the duck is released, to ramp back up on its own timer')
    h.advance(2000)
    assert.equal(h.program._duck, 1, 'and it got back to full')
  } finally { h.shutdown() }
})

// --- the audio graph ---------------------------------------------------------
// A recording fake: just enough to see WHERE each sound is connected and what
// gain each trim node carries. fake-audio.mjs is a sink and cannot answer
// either question.

function routingAudio() {
  const nodes = []
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x) { this.value = x }, linearRampToValueAtTime(x) { this.value = x },
    exponentialRampToValueAtTime(x) { this.value = x }, cancelScheduledValues() {},
  })
  const mk = (kind) => {
    const n = { kind, out: [], gain: param(1), frequency: param(), Q: param(), type: '',
      connect(x) { n.out.push(x); return x }, start() {}, stop() {} }
    nodes.push(n)
    return n
  }
  class Ctx {
    constructor() { this.sampleRate = 8000; this.currentTime = 0; this.state = 'running'; this.destination = { kind: 'destination' } }
    resume() { return Promise.resolve() }
    createGain() { return mk('gain') }
    createOscillator() { return mk('osc') }
    createBiquadFilter() { return mk('filter') }
    createBufferSource() { return mk('source') }
    createBuffer(_c, n) { return { getChannelData: () => new Float32Array(n) } }
  }
  const prev = globalThis.AudioContext
  globalThis.AudioContext = Ctx
  return { nodes, restore() { globalThis.AudioContext = prev } }
}
let routeCount = 0

test('the hum goes through its trim to the destination, never the speaker bus', async () => {
  globalThis.window = globalThis
  const audio = routingAudio()
  try {
    const sfx = await import(`../audio/sfx.js?v=route${++routeCount}`)
    sfx.setHumTrim(0.4)
    sfx.startTubeHum()
    const humMaster = audio.nodes.find((n) => n.out.some((o) => o.kind === 'gain' && o.gain.value === 0.4))
    assert.ok(humMaster, 'the hum feeds a node carrying the trim')
    const trim = humMaster.out[0]
    assert.deepEqual(trim.out.map((o) => o.kind), ['destination'], 'trim -> destination directly (the chassis carve-out)')
    // Live: a change reaches the running hum.
    sfx.setHumTrim(0)
    assert.equal(trim.gain.value, 0)
  } finally { audio.restore() }
})

test('the static bed and seek hiss go through their trim and then the speaker bus', async () => {
  globalThis.window = globalThis
  const audio = routingAudio()
  try {
    const sfx = await import(`../audio/sfx.js?v=route${++routeCount}`)
    sfx.setStaticTrim(0)
    sfx.startStaticNoise(5)
    sfx.playSeekStatic()
    const trims = new Set()
    for (const n of audio.nodes) for (const o of n.out) if (o.kind === 'gain' && o.out.includes(sfx.speakerBusNode) && o !== n) trims.add(o)
    // One trim node, shared by both sounds, sitting in front of the bus --
    // so mute and volume still apply on top of it.
    const feeders = audio.nodes.filter((n) => n.out.some((o) => trims.has(o)))
    assert.equal(trims.size, 1)
    assert.equal(feeders.length, 2, 'bed and hiss both route through it')
    assert.equal([...trims][0].gain.value, 0)
  } finally { audio.restore() }
})
