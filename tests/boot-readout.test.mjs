// The POST readout's copy (2026-10-16). What each line claims is read off
// real state, so these assert the claim against that state rather than
// against a copy of the string -- see the copy-pass note on bootLines in
// program.js for why each line is there.
import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

// Power on and stop with every readout line landed, inside the hold before
// the reveal clears it -- read off the real pacing, not a copy of it.
async function readout(opts = {}) {
  const h = await boot(opts)
  const { BOOT_REVEAL_MS, BOOT_HOLD_MS } = await import(`../constants.js?v=${h.tag}`)
  h.advance(600)
  h.key('p')
  h.advance(BOOT_REVEAL_MS - BOOT_HOLD_MS + 100)
  assert.equal(h.program.poweredOn, false, 'test setup: still mid-readout')
  return h
}
const line = (h, label) => (h.rows().find((r) => r.trimStart().startsWith(label)) || '').trim()

test('the station count names the band AND the whole set', async () => {
  // "PRESETS : 8 STATIONS LOADED" was true of the band and read by everyone
  // as the whole radio, which had 16.
  const h = await readout()
  try {
    const { STATIONS } = await import(`../stations.js?v=${h.tag}`)
    const { BANDS, bandFor } = await import(`../tuning.js?v=${h.tag}`)
    const label = bandFor(h.program.band).label
    const onBand = h.program.bandPresets().length
    assert.ok(STATIONS.length > onBand, 'test setup: the set has more stations than one band')
    assert.ok(line(h, 'STATIONS').includes(`${onBand} ON ${label}, ${STATIONS.length} ACROSS ${BANDS.length} BANDS`), line(h, 'STATIONS'))
  } finally { h.shutdown() }
})

test('the readout is one block: every line after the banner shares a left edge', async () => {
  // Each line used to be centred on its own string, so the colons and the
  // [ OK ]s wandered a column or two on every row.
  for (const mobile of [false, true]) {
    const h = await readout({ mobile })
    try {
      const rows = h.rows()
      const top = rows.findIndex((r) => r.includes('SG-1  SIGNAL RECEIVER'))
      assert.ok(top >= 0, 'banner drawn')
      const body = rows.slice(top + 1).filter((r) => r.trim())
      assert.equal(body.length, 9, `nine probe lines (${mobile ? 'lite' : 'desktop'})`)
      const edges = new Set(body.map((r) => r.length - r.trimStart().length))
      assert.equal(edges.size, 1, `one left edge on ${mobile ? 'lite' : 'desktop'}: ${[...edges]}`)
      const colons = new Set(body.filter((r) => r.includes(' : ')).map((r) => r.indexOf(' : ')))
      assert.equal(colons.size, 1, 'the colons line up')
      for (const r of body) assert.ok(r.trimEnd().length <= h.term.cols, 'fits the grid')
    } finally { h.shutdown() }
  }
})

test('DIAL names the station the set is coming up on', async () => {
  const h = await readout()
  try {
    const st = h.program.lockedStation
    assert.ok(st, 'test setup: a station to come up on')
    assert.ok(line(h, 'DIAL').includes(`${st.freq.toFixed(1)}  ${st.callsign}`), line(h, 'DIAL'))
  } finally { h.shutdown() }
})

test('DIAL never names a secret station ahead of its reveal', async () => {
  const h = await readout({ station: 'nin' })
  try {
    assert.ok(h.program.lockedStation?.secret, 'test setup: booting onto a secret station')
    assert.ok(line(h, 'DIAL').includes('UNLISTED'), line(h, 'DIAL'))
    assert.equal(h.find(h.program.lockedStation.callsign), -1, 'callsign nowhere on the readout')
  } finally { h.shutdown() }
})

test('REAR PANEL says FACTORY untouched, and lists only what is turned down', async () => {
  const a = await readout()
  try {
    assert.ok(line(a, 'REAR PANEL').endsWith(': FACTORY'), line(a, 'REAR PANEL'))
  } finally { a.shutdown() }
  const b = await readout({ saved: { panel: { hum: 'low', static: 'normal', voice: 'on', screen: 'calm' } } })
  try {
    assert.ok(line(b, 'REAR PANEL').endsWith(': HUM LOW  SCREEN CALM'), line(b, 'REAR PANEL'))
  } finally { b.shutdown() }
})

test('REAR PANEL collapses to a count on the lite grid rather than overrunning it', async () => {
  const panel = { hum: 'off', static: 'off', voice: 'off', screen: 'calm' }
  const d = await readout({ saved: { panel } })
  try {
    assert.ok(line(d, 'REAR PANEL').endsWith(': HUM OFF  STATIC OFF  VOICE OFF  SCREEN CALM'), 'desktop has room for the list')
  } finally { d.shutdown() }
  const m = await readout({ mobile: true, saved: { panel } })
  try {
    assert.ok(line(m, 'REAR PANEL').endsWith(': 4 TURNED DOWN'), line(m, 'REAR PANEL'))
  } finally { m.shutdown() }
})

test('each [ OK ] is drawn BOLD over its DIM line (2026-10-16)', async () => {
  // Read off the attribute plane: a character-reading test cannot see this
  // change at all, since the letters are identical either way.
  const h = await readout()
  try {
    const { BOLD, DIM } = await import('../src/cellgrid.js')
    const rows = h.rows()
    const oks = rows.map((r, y) => [r, y]).filter(([r]) => r.trimStart().startsWith('[ OK ]'))
    assert.equal(oks.length, 5, 'five confirms')
    const at = (x, y) => h.term.attrs[y * h.term.cols + x]
    for (const [r, y] of oks) {
      const x = r.indexOf('[ OK ]')
      for (let i = 0; i < 6; i++) assert.equal(at(x + i, y), BOLD, `"${r.trim()}" col ${i} of [ OK ] is BOLD`)
      assert.equal(at(x + 7, y), DIM, `"${r.trim()}" text after it stays DIM`)
    }
    const band = rows.findIndex((r) => r.trimStart().startsWith('BAND'))
    assert.equal(at(rows[band].indexOf('BAND'), band), DIM, 'the probe lines stay DIM')
  } finally { h.shutdown() }
})

test('the readout holds long enough to read: the reveal lands at BOOT_REVEAL_MS', async () => {
  const h = await boot()
  try {
    const { BOOT_REVEAL_MS } = await import(`../constants.js?v=${h.tag}`)
    assert.equal(BOOT_REVEAL_MS, 5000, 'five seconds, on purpose (2026-10-16) -- change this with the pacing')
    h.advance(600)
    h.key('p')
    h.advance(BOOT_REVEAL_MS - 100)
    assert.equal(h.program.poweredOn, false, 'still reading out just before')
    h.advance(200)
    assert.equal(h.program.poweredOn, true, 'up just after')
  } finally { h.shutdown() }
})
