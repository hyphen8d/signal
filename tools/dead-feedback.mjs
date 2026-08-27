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

let seedState = 1
const seed = () => { seedState = 0x2545F491 }
Math.random = () => {
  seedState ^= seedState << 13; seedState >>>= 0
  seedState ^= seedState >> 17
  seedState ^= seedState << 5; seedState >>>= 0
  return seedState / 4294967296
}

// Every key any view treats as a command, plus a few the app must NOT claim
// ('x' and ' ' stand in for the Cmd+Tab keydowns that reach the window).
const KEYS = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape',
  's', 'n', 'm', 'p', 'b', 'g', 'c', 'C+shift', 'v', 'a', 'f', 'l', 'e', 't', 'y',
  '1', '5', '0', ')', 'x', ' ',
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
}
const BOOT_OPTS = {
  consentCard: { tap: 'tab' },
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
  // Two-finger tap (the tint cycle, mobile's [C]) has no harness helper, and
  // needs the real shape of the event: fingers never lift in sync, so
  // touchend fires once per finger and onTouchEnd only resolves on the
  // second -- see its own BUG FIXED note in ui/mobile.js.
  'two-finger tap': (h) => {
    const ev = (touches, changed) => ({ touches, changedTouches: changed, target: null, preventDefault() {} })
    h.program.onTouchStart(h.screen, ev([{ clientX: 10, clientY: 10 }, { clientX: 40, clientY: 10 }], []))
    h.program.onTouchEnd(h.screen, ev([{ clientX: 40, clientY: 10 }], [{ clientX: 10, clientY: 10 }]))
    h.program.onTouchEnd(h.screen, ev([], [{ clientX: 40, clientY: 10 }]))
  },
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

const trial = async (setup, act, bootOpts = {}) => {
  await settle()
  seed()
  const h = await boot(bootOpts)
  await setup(h)
  // Captured HERE, not after the frames: half these states are mid-sweep and
  // would report where the dial ended up rather than where the key landed.
  const label = `${h.program.poweredOn ? 'on' : 'off'}/${h.program.mode}` +
    `${h.program.visualizerActive ? '/viz' : ''}${h.program.tapConsentOpen ? '/card' : ''}${h.program.guideOpen ? '/guide' : ''}`
  const clicks = act ? act.clicks(h) : null
  if (act) act.press(h)
  const frames = []
  for (let i = 0; i < FRAMES; i++) { h.advance(FRAME_MS); frames.push(h.rows().join('\n')) }
  h.shutdown()
  return { frames, clicks, label }
}
const same = (a, b) => a.frames.every((f, i) => f === b.frames[i])

// `--state=visualizer` re-checks one row on its own -- the first thing to
// reach for when a result looks wrong rather than interesting.
const only = (process.argv.find((a) => a.startsWith('--state=')) || '').slice(8)
const wanted = (name) => !only || name === only

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

const sweepState = async (setup, bootOpts, canary = true) => {
  const control = await trial(setup, null, bootOpts)
  const press = (key) => {
    const bare = key.replace('+shift', '')
    const shiftKey = key.endsWith('+shift')
    return trial(setup, {
      clicks: (h) => h.program.isMappedKey({ key: bare, shiftKey }),
      press: (h) => h.key(bare, { shiftKey }),
    }, bootOpts)
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

let lies = 0
console.log('SIGNAL dead-feedback sweep -- `!` = clicked but changed nothing\n')
for (const [name, setup] of Object.entries(STATES).filter(([n]) => wanted(n))) {
  const bootOpts = BOOT_OPTS[name] ?? {}
  const canary = !NO_CANARY.has(name)
  let r = await sweepState(setup, bootOpts, canary)
  if (!r.stable) r = await sweepState(setup, bootOpts, canary)
  if (!r.stable) { console.log(`${name.padEnd(13)} [${r.control.label}]  UNSTABLE -- re-run this state alone: --state=${name}`); continue }
  lies += r.inert.filter((i) => i.clicks).length
  const shown = r.inert.map((i) => `${i.clicks ? '!' : ' '}${i.key}`)
  console.log(`${name.padEnd(13)} [${r.control.label}]  no change: ${shown.join(' ') || '(none)'}`)
}

const mobileRows = Object.entries(MOBILE_STATES).filter(([n]) => wanted(`mobile-${n}`))
if (mobileRows.length) console.log('\n-- mobile lite (no key click exists; a dead gesture is wholly silent) --')
for (const [name, setup] of mobileRows) {
  const control = await trial(setup, null, { mobile: true })
  const inert = []
  for (const [g, run] of Object.entries(GESTURES)) {
    const t = await trial(setup, { clicks: () => false, press: run }, { mobile: true })
    if (same(t, control)) inert.push(g)
  }
  console.log(`${name.padEnd(13)} [${control.label}]  no change: ${inert.join(' | ') || '(none)'}`)
}

console.log(`\n${lies} key(s) click without changing anything.`)
// [F] is the standing exception: fullscreen changes the whole window, which
// is real feedback the text grid cannot see. Everything else should be zero.
