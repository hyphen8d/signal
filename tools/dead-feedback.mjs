#!/usr/bin/env node
// SIGNAL -- the dead-feedback sweep (2026-08-27).
//
// The rule it enforces, in two halves:
//
//   1. A key that CLICKS like a command has to change something. The click
//      (playKeyClick, gated by program.isMappedKey) is the keyboard's own
//      sound, not the radio's -- but it is still the app saying "that was a
//      key I own", and a key the app owns that changes nothing is a lie.
//   2. A control the SCREEN ADVERTISES -- the footer's two hint rows, the
//      Guide's controls grid, the visualizer's footer legend -- has to
//      answer even in the state where it cannot act. NO SIGNAL when Enter
//      finds nothing in range is the pattern; NO HISTORY, NO LINE IN and
//      the rest followed it.
//
// How it works, and why it works this way: for every (view, key) pair it
// boots the headless harness TWICE from the same seed -- once pressing the
// key, once pressing nothing -- and compares 24 frames of the text grid. A
// key whose frame sequence is identical to the do-nothing control changed
// nothing, in any row, at any point in ~2s. Pairing that with isMappedKey()
// separates "silent and correct" (an unmapped key, no click) from "clicked
// and lied".
//
// THE SEED IS LOAD-BEARING. Around 99 Math.random() sites animate this
// screen on their own -- border shimmer, VU meters, text resolves, the idle
// CRT tear -- so an unseeded before/after diff is pure noise and finds
// everything. Swapping in a deterministic PRNG makes the control run and
// the test run byte-identical except for the keypress. The tradeoff is a
// small false-POSITIVE rate: a key that draws a random number and then does
// nothing visible shifts every later draw and reads as a change. There are
// no false negatives, which is the direction that matters.
//
// BOTH BANDS, ONE PINNED STATION EACH (2026-09-13, audit L14). Every state
// runs once per band, booted through `station:` onto that band's lowest
// station. Until then the sweep swept whatever an unpinned harness boot
// landed on: the default band while the app's own first-visit fallback
// picked, and -- once the harness began drawing from both bands -- the same
// single station every time (the pick is the first draw after seed(), so
// every trial, control and pressed alike, got AFTER HOURS). Pairing is what
// the sweep cannot lose, and a random pick only kept it by accident; a pin
// keeps it by construction, and trial() now checks that the boot really
// landed on the band asked for and that every pressed run booted the same
// station as its control, throwing rather than reporting a mispaired diff.
// `--band=ym` (or zm) sweeps one.
//
// With no --band, each band runs in its OWN node process, in parallel, and
// the reports are printed one after the other. Not for speed: every
// harness boot imports a fresh module graph (unique ?v=, which is what
// keeps trials independent) and Node never unloads an ES module, so one
// process sweeping both bands ran out of heap at 2GB partway into the
// second. A child per band keeps each under the ceiling one band always
// fit in, and parallel children keep the wall time near a single band's.
//
// One standing exception in the output: [F] FULLSCREEN reports as clicking
// without changing anything in every powered-on state. It changes the whole
// browser window, which is real feedback the text grid cannot see.
//
// Run: node tools/dead-feedback.mjs   (npm run deadfeedback)
// Output is a report, not an assertion -- the findings that had a fix are
// guarded by real tests in tests/program.test.mjs instead. Read a `!` row as
// "clicks but changes nothing", i.e. something to explain or fix; a plain
// row is a key that is silent and inert, which is usually correct.

import { boot } from '../tests/harness.mjs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// No --band: fan out one child per band and stop here (see the header).
if (!process.argv.some((a) => a.startsWith('--band='))) {
  const { BANDS } = await import('../tuning.js?v=sweep')
  const passArgs = process.argv.slice(2)
  const runs = BANDS.map((b) => new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), `--band=${b.key}`, ...passArgs],
      { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.on('close', (code) => resolve({ band: b.key, out, code }))
  }))
  let total = 0
  let failed = false
  for (const r of await Promise.all(runs)) {
    process.stdout.write(r.out)
    const m = r.out.match(/^(\d+) key\(s\) click/m)
    if (r.code !== 0 || !m) { failed = true; console.log(`\n[${r.band}] sweep exited ${r.code} without a total -- its rows above are incomplete`) } else total += Number(m[1])
    console.log('')
  }
  console.log(`${total} key(s) click without changing anything across ${BANDS.length} bands.`)
  process.exit(failed ? 1 : 0)
}

let seedState = 1
const seed = () => { seedState = 0x2545F491 }
Math.random = () => {
  seedState ^= seedState << 13; seedState >>>= 0
  seedState ^= seedState >> 17
  seedState ^= seedState << 5; seedState >>>= 0
  return seedState / 4294967296
}

globalThis.SIGNAL_BUILD ??= 'sweep'
globalThis.matchMedia ??= () => ({ matches: false })
const EMPTY_PRESET_DIGITS = await (async () => {
  const { STATIONS } = await import('../stations.js?v=sweep')
  const { BANDS } = await import('../tuning.js?v=sweep')
  const firstEmpty = BANDS.map((b) => STATIONS.filter((s) => s.band === b.key).length + 1)
  return [...new Set(firstEmpty.filter((n) => n <= 9).map(String))]
})()
// One station per band to boot every trial on: the lowest frequency on it.
// `wide` is the station with the widest gap ABOVE it on that band, which
// the scanning row boots instead -- see SCAN_FROM_WIDE below.
const SWEEP_BANDS = await (async () => {
  const { STATIONS } = await import('../stations.js?v=sweep')
  const { BANDS } = await import('../tuning.js?v=sweep')
  return BANDS.map((b) => {
    const on = STATIONS.filter((s) => s.band === b.key).sort((x, y) => x.freq - y.freq)
    if (!on.length) return null
    const wide = on.slice(0, -1).reduce((best, s, i) => (on[i + 1].freq - s.freq > best.gap
      ? { id: s.id, gap: on[i + 1].freq - s.freq } : best), { id: on[0].id, gap: -1 })
    return { key: b.key, station: on[0].id, wide: wide.id }
  }).filter(Boolean)
})()

// Every key any view treats as a command, plus a few the app must NOT claim
// ('x' and ' ' stand in for the Cmd+Tab keydowns that reach the window).
const KEYS = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape',
  's', 'n', 'm', 'p', 'b', 'g', 'c', 'C+shift', 'v', 'a', 'f', 'l', 'e', 't', 'y',
  // 2026-09-02 -- 'w' and 'k' were in MAPPED_KEYS and had never been pressed
  // here. Same hole the two-finger band swipe fell through and the same
  // reason: this list is hand-maintained, so a key the app learns is not
  // reported as unswept, it is simply absent from a report that still looks
  // complete. [W] is the weather card, [K] is TAG (the share line; the
  // sleep timer is [T], swept above) -- both real controls the guide
  // advertises. The digits stay a deliberate SAMPLE (1, 5, 0 for a preset,
  // an off-band preset and the retired zero); the presets are one code path
  // and nine rows of it would be noise.
  'w', 'k',
  '1', '5', '0',
  // 2026-09-12 (audit, L1/L16) -- plus the first digit PAST each band's
  // station count, derived from the roster rather than typed. isMappedKey
  // answers true for every digit 1-9, so a digit with no station behind it
  // was the one preset shape that clicked and did nothing -- and a sample
  // of 1/5/0 could never see it. Each band is swept on its own rows (see the
  // header), so on a band's row the digit past THAT band's count is the one
  // that matters; the digit past the other band's count usually lands on a
  // station there and reads as a change.
  ...EMPTY_PRESET_DIGITS,
  ')', 'x', ' ',
]

/** Arrow off whatever the boot locked onto, into plain SEEKING. */
const offStation = (h) => {
  for (let i = 0; i < 20 && h.program.mode !== 'seeking'; i++) { h.key('ArrowRight'); h.advance(120) }
  h.advance(1200)
}

const STATES = {
  standby:    (h) => { h.advance(1200) },
  locked:     (h) => { h.powerOn(); h.key('3'); h.advance(3000) },
  seeking:    (h) => { h.powerOn(); h.advance(800); offStation(h) },
  scanning:   (h) => { h.powerOn(); h.key('s'); h.advance(200) },
  muted:      (h) => { h.powerOn(); h.key('3'); h.advance(2500); h.key('m'); h.advance(1500) },
  volMax:     (h) => { h.powerOn(); h.key('3'); h.advance(2500); for (let i = 0; i < 12; i++) { h.key('ArrowUp'); h.advance(60) } h.advance(1500) },
  volMin:     (h) => { h.powerOn(); h.key('3'); h.advance(2500); for (let i = 0; i < 12; i++) { h.key('ArrowDown'); h.advance(60) } h.advance(1500) },
  guide1:     (h) => { h.powerOn(); h.advance(500); h.key('g'); h.advance(300) },
  guideIndex: (h) => { h.powerOn(); h.advance(500); h.key('g'); h.advance(200); h.key('ArrowRight'); h.advance(300) },
  guideLast:  (h) => {
    h.powerOn(); h.advance(500); h.key('g'); h.advance(200)
    for (let i = h.program.guidePage; i < h.program.guideTotalPages(); i++) { h.key('ArrowRight'); h.advance(60) }
    h.advance(300)
  },
  visualizer: (h) => { h.powerOn(); h.key('3'); h.advance(3000); h.key('v'); h.advance(1600) },
  // 2026-08-27 -- the two states that need the harness's fake player. Every
  // state above runs with none, which is honest (it is the app's own
  // player-not-ready path) but leaves the whole playback half switched off:
  // loadTrack() returns on its first line. lockedPlaying is the same locked
  // screen with a track actually running under it; lyricsView is [L], which
  // no test could reach at all before the player existed, and which is where
  // the dead-feedback pattern was first found.
  lockedPlaying: async (h) => { h.powerOn(); h.key('3'); h.advance(3000); await h.flush(); h.advance(300) },
  lyricsView: async (h) => {
    h.powerOn(); h.key('3'); h.advance(3000)
    await h.flush()            // let the LRCLIB chain resolve
    h.advance(100); h.key('v'); h.advance(1600)
    h.key('l'); h.advance(400)
    if (!h.program.lyricsViewOpen) throw new Error('sweep setup: the lyrics view did not open')
  },
  // The one state that needs a capture-capable browser to reach at all.
  consentCard: (h) => { h.powerOn(); h.advance(800); h.key('a'); h.advance(600) },
  // VECTOR SCAN (2026-08-29) -- the hidden game, which is a view keys get
  // pressed in like any other and so belongs in the sweep.
  //
  // Read its row differently from every other one here. The game
  // deliberately does not click (isMappedKey returns false for the whole of
  // it -- see its case in program.js), so nothing in this row can EVER be a
  // `!`, and the row is not asking the "clicked and lied" question at all.
  // What it is watching for is the other half: a key the game advertises in
  // its own on-screen furniture -- the six power-meter slots, the [E] EXIT
  // in the HUD -- going quiet. Expect the arrows, space, Z, Enter and E to
  // be absent from the no-change list; a key appearing there that the
  // screen names is the finding.
  //
  // The game also animates on its own, so unlike the static screens above
  // it relies entirely on the seeded PRNG making the control and pressed
  // runs identical but for the press. That is the seeding the header calls
  // load-bearing, being leaned on harder than anywhere else in this file.
  // 2026-09-02 -- the weather card had no row here at all, which made it the
  // last view in the app nothing swept. It earns one twice over: [W] and [K]
  // were both unswept keys until this pass, and the card is the ONE overlay
  // that deliberately does not clear the grid (weather is an aside -- the
  // dial and meters stay lit under it), so it cannot rely on the "nothing
  // else may paint" contract the guide and the LINE INPUT card get. That
  // trade is why `weatherOpen` has to be repeated in every paint guard, and
  // why CLAUDE.md calls out missing one as the way the track title draws
  // through the card.
  //
  // Consent is given in setup rather than swept from the prompt: the prompt
  // is the tap-consent card's shape, already covered by consentCard, and the
  // interesting surface is the card with a READING on it.
  weatherCard: async (h) => {
    h.powerOn(); h.key('3'); h.advance(2500)
    h.key('w')                       // opens the card on the consent prompt
    h.key('y')                       // ...and [Y] answers it in-gesture
    await h.flush()
    h.advance(1200)                  // the fetch lands and the card repaints
    if (!h.program.weatherOpen) throw new Error('sweep setup: the weather card did not open')
  },
  vectorScan: (h) => {
    h.powerOn(); h.key('3'); h.advance(3000); h.key('v'); h.advance(1600)
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                     'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
      h.key(k)
      h.keyUp(k)
    }
    h.advance(600)
    if (!h.program.gameOpen) throw new Error('sweep setup: the game did not open')
  },
}
// 2026-09-13 -- the scanning row presses its keys 200ms into a scan, so it
// only asks its question if the scan is STILL RUNNING across the 24 frames
// that follow. From a band's lowest station it often is not: THE CRYPT sits
// 23 below MIRRORBALL, the scan locks it by the first captured frame, and
// the row came out as six keys that "click and change nothing" -- every one
// of them answering, and every answer painted over by the lock landing in
// both runs alike. So that row boots the station with the widest gap above
// it, and trial() records whether the control's scan survived the window;
// a row where it did not is marked rather than trusted.
const SCAN_FROM_WIDE = new Set(['scanning'])
const BOOT_OPTS = {
  consentCard: { tap: 'tab' },
  weatherCard: { weather: true },
  lockedPlaying: { player: true },
  lyricsView: { player: true, lyrics: true },
}

// Touch has no key click at all, so on mobile a dead gesture is silent in
// both halves -- which makes the visible answer the only one there is.
const GESTURES = {
  'tap': (h) => h.tap(),
  'swipe right': (h) => h.swipe(1),
  'swipe left': (h) => h.swipe(-1),
  'swipe up (skip)': (h) => h.touch(100, 200, 100, 60),
  // 2026-09-02 -- both two-finger gestures now come from the HARNESS
  // (h.touch2tap / h.swipe2) instead of being re-spelled here. This file
  // used to hand-roll the tap's event sequence because no helper existed;
  // the B1 work added both, and leaving the copy would have been two
  // spellings of one gesture -- the duplication CLAUDE.md's design-record
  // note says to make assert instead. A copy here cannot fail loudly: it
  // would go on driving the OLD event shape and reporting a clean sweep of
  // a gesture the app no longer has.
  'two-finger tap': (h) => h.touch2tap(),
  // 2026-09-02 -- the band swipe (B1) had NO sweep coverage at all until
  // now: it shipped the same day this list was last read, and a gesture
  // absent from GESTURES is not reported as untested, it is simply not
  // reported -- the sweep still printed a complete-looking mobile section.
  // Same silent-pass shape as a rate-limited audition run or a measurement
  // taken against a covered window, which is why it is called out rather
  // than quietly added. Direction is not swept: onTouchEnd routes both
  // signs to the same cycleBand(), so left and right are one code path
  // today.
  'two-finger swipe (band)': (h) => h.swipe2(1),
}
const MOBILE_STATES = {
  standby: (h) => { h.advance(1200) },
  locked:  (h) => { h.powerOn(); h.advance(3000) },
  seeking: (h) => { h.powerOn(); h.advance(1000); h.program.enterSeeking(h.screen); h.advance(1200) },
}

const FRAMES = 24
const FRAME_MS = 80

/** Let every stray async continuation from the PREVIOUS trial land before
 *  this one seeds. It matters more than it looks: the PRNG below is one
 *  generator shared by every boot, so a rejected fetch or a permissions
 *  query resolving from a dead program instance mid-trial pulls a number out
 *  from under the live one and desynchronises it from its own control run.
 *  That showed up as whole states reporting "everything changed" on a long
 *  run while behaving correctly in isolation. Real timers are back by here
 *  (shutdown() restored them), so this genuinely drains rather than queueing
 *  onto a fake clock nobody is advancing. */
const settle = () => new Promise((r) => setTimeout(r, 0))

const trial = async (setup, act, bootOpts = {}, band = null) => {
  await settle()
  seed()
  const h = await boot(band ? { ...bootOpts, station: band.station } : bootOpts)
  const booted = h.program.lockedStation?.id ?? null
  if (band && (h.program.band !== band.key || booted !== band.station)) {
    h.shutdown()
    throw new Error(`sweep setup: asked for ${band.station} on ${band.key}, booted ${booted} on ${h.program.band}`)
  }
  await setup(h)
  // Captured HERE, not after the frames: half these states are mid-sweep and
  // would report where the dial ended up rather than where the key landed.
  const label = `${band ? band.key + ' ' : ''}${h.program.poweredOn ? 'on' : 'off'}/${h.program.mode}` +
    `${h.program.visualizerActive ? '/viz' : ''}${h.program.tapConsentOpen ? '/card' : ''}` +
    `${h.program.weatherOpen ? '/wx' : ''}${h.program.guideOpen ? '/guide' : ''}`
  const clicks = act ? act.clicks(h) : null
  if (act) act.press(h)
  const frames = []
  for (let i = 0; i < FRAMES; i++) { h.advance(FRAME_MS); frames.push(h.rows().join('\n')) }
  const endScanning = !!h.program.scanning
  h.shutdown()
  return { frames, clicks, label, booted, endScanning }
}
/** A pressed run is only comparable to a control that booted the same
 *  station. Pinned boots make that true by construction; this is the check
 *  that it stayed true, so a mispaired diff throws instead of reading as
 *  "everything changed" (or, worse, "nothing did"). */
const paired = (t, control) => {
  if (t.booted !== control.booted) {
    throw new Error(`sweep pairing: control booted ${control.booted}, pressed run booted ${t.booted}`)
  }
  return t
}
const same = (a, b) => a.frames.every((f, i) => f === b.frames[i])

// `--state=visualizer` re-checks one row on its own -- the first thing to
// reach for when a result looks wrong rather than interesting.
const only = (process.argv.find((a) => a.startsWith('--state=')) || '').slice(8)
const wanted = (name) => !only || name === only
const onlyBand = (process.argv.find((a) => a.startsWith('--band=')) || '').slice(7)
const bands = SWEEP_BANDS.filter((b) => !onlyBand || b.key === onlyBand)
if (!bands.length) throw new Error(`--band=${onlyBand}: no such band (have ${SWEEP_BANDS.map((b) => b.key).join(', ')})`)

// 'F13' is the canary: no view has a case for it and no key set contains it,
// so it MUST come out identical to the control. When it doesn't, this run's
// PRNG stream got pulled out from under it (see settle() above -- draining
// helps but does not prove), every later comparison in that state is
// meaningless, and the state is re-run rather than reported. Cheaper and far
// more honest than trusting a sweep that has silently desynchronised: the
// failure mode it catches reads as "every key does something", which is
// exactly the reassuring direction.
const CANARY = 'F13'
// ...except in the guide, where "[any other key] CLOSE" is the contract
// printed on every page, so there is no inert key to canary WITH -- F13
// closes it like everything else does. Those three states are checked
// without one; their expected answer ("no key is inert here") is also what
// a desynchronised run would print, so nothing is hidden by dropping it.
const NO_CANARY = new Set(['guide1', 'guideIndex', 'guideLast'])

const sweepState = async (setup, bootOpts, canary = true, band = null) => {
  const control = await trial(setup, null, bootOpts, band)
  const press = (key) => {
    const bare = key.replace('+shift', '')
    const shiftKey = key.endsWith('+shift')
    return trial(setup, {
      clicks: (h) => h.program.isMappedKey({ key: bare, shiftKey }),
      press: (h) => h.key(bare, { shiftKey }),
    }, bootOpts, band).then((t) => paired(t, control))
  }
  const before = canary ? await press(CANARY) : null
  const inert = []
  for (const key of KEYS) {
    const t = await press(key)
    if (same(t, control)) inert.push({ key, clicks: t.clicks })
  }
  const after = canary ? await press(CANARY) : null
  const stable = !canary || (same(before, control) && same(after, control))
  return { control, inert, stable }
}

const lies = Object.fromEntries(bands.map((b) => [b.key, 0]))
console.log(`SIGNAL dead-feedback sweep [${bands.map((b) => `${b.key} on ${b.station}`).join(', ')}] -- \`!\` = clicked but changed nothing\n`)
for (const band of bands) {
  for (const [name, setup] of Object.entries(STATES).filter(([n]) => wanted(n))) {
    const bootOpts = BOOT_OPTS[name] ?? {}
    const canary = !NO_CANARY.has(name)
    const pin = SCAN_FROM_WIDE.has(name) ? { ...band, station: band.wide } : band
    let r = await sweepState(setup, bootOpts, canary, pin)
    if (!r.stable) r = await sweepState(setup, bootOpts, canary, pin)
    if (!r.stable) { console.log(`${name.padEnd(13)} [${band.key}]  UNSTABLE -- re-run this state alone: --state=${name} --band=${band.key}`); continue }
    lies[band.key] += r.inert.filter((i) => i.clicks).length
    const shown = r.inert.map((i) => `${i.clicks ? '!' : ' '}${i.key}`)
    const lockedEarly = SCAN_FROM_WIDE.has(name) && !r.control.endScanning
      ? `  (scan locked inside the window from ${pin.station} -- row unreliable)` : ''
    console.log(`${name.padEnd(13)} [${r.control.label}]  no change: ${shown.join(' ') || '(none)'}${lockedEarly}`)
  }
}

const mobileRows = Object.entries(MOBILE_STATES).filter(([n]) => wanted(`mobile-${n}`))
if (mobileRows.length) console.log('\n-- mobile lite (no key click exists; a dead gesture is wholly silent) --')
for (const band of bands) {
  for (const [name, setup] of mobileRows) {
    const control = await trial(setup, null, { mobile: true }, band)
    const inert = []
    for (const [g, run] of Object.entries(GESTURES)) {
      const t = paired(await trial(setup, { clicks: () => false, press: run }, { mobile: true }, band), control)
      if (same(t, control)) inert.push(g)
    }
    console.log(`${name.padEnd(13)} [${control.label}]  no change: ${inert.join(' | ') || '(none)'}`)
  }
}

const total = Object.values(lies).reduce((a, n) => a + n, 0)
console.log(`\n${total} key(s) click without changing anything` +
  ` (${Object.entries(lies).map(([b, n]) => `${b} ${n}`).join(', ')}).`)
// [F] is the standing exception: fullscreen changes the whole window, which
// is real feedback the text grid cannot see. Everything else should be zero.
