// The dashboard's control room (2026-11-02): tools/lib/control-room.mjs's
// rules, and the server's reading of a health batch it did not start.
//
// The page itself is not booted here -- the parts of it with a rule in them
// are in the lib so they can be held without a browser. The one that
// matters most is the transmitter key: a hold that fires on a tap ships to
// production, and nothing about how the page LOOKS would say so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  TX_HOLD_MS, createHoldKey, lineRate, vuTarget, vuStep, vuSegments,
  createSuiteCounter, suiteReadout, onAirCaption, txLamps,
} from '../tools/lib/control-room.mjs'

test('the TX key fires only on a full hold, once, and a tap cancels', () => {
  const k = createHoldKey()
  assert.equal(k.release(0), null, 'releasing nothing is nothing')

  // A tap -- what a click, a stray Enter or a double-click produces.
  k.press(1000)
  assert.equal(k.tick(1000 + 200), false)
  assert.equal(k.release(1000 + 200), 'cancelled')
  assert.equal(k.fired, false)
  assert.equal(k.progress(1300), 0, 'a released key shows no fill')

  // Released one frame short is still a cancel.
  k.press(2000)
  assert.equal(k.release(2000 + TX_HOLD_MS - 1), 'cancelled')

  // A full hold fires on the tick that completes it -- not on release.
  k.press(5000)
  assert.ok(Math.abs(k.progress(5000 + TX_HOLD_MS / 2) - 0.5) < 1e-9)
  assert.equal(k.tick(5000 + TX_HOLD_MS - 1), false)
  assert.equal(k.tick(5000 + TX_HOLD_MS), true, 'fires the moment the hold completes')
  assert.equal(k.tick(5000 + TX_HOLD_MS + 16), false, 'and exactly once')
  assert.equal(k.release(5000 + TX_HOLD_MS + 300), null, 'the release after a fire is not a second event')

  // One hold, one transmission: a fired key ignores presses until reset.
  assert.equal(k.press(9000), false)
  assert.equal(k.tick(9000 + TX_HOLD_MS * 2), false)
  k.reset()
  assert.equal(k.press(9000), true)
})

test('the TX key ignores keydown auto-repeat, and a starved frame loop cannot turn a full hold into a cancel', () => {
  const k = createHoldKey()
  assert.equal(k.press(0), true)
  // keydown repeats every ~30ms while Space is held; each is a press().
  for (let t = 30; t < 600; t += 30) assert.equal(k.press(t), false)
  assert.ok(k.progress(600) < 0.6, 'a repeat must not restart or advance the hold')
  // No tick ran at all (a background tab) -- the release still fires.
  assert.equal(k.release(TX_HOLD_MS + 50), 'fired')
  assert.equal(k.fired, true)
})

test('the programme meter: rate from real arrivals, log scale, fast attack, slow release', () => {
  assert.equal(lineRate([], 1000), 0)
  assert.equal(lineRate([600, 700, 800, 900, 1000], 1000, 500), 10)
  assert.equal(lineRate([100, 200], 1000, 500), 0, 'old lines have left the window')

  assert.equal(vuTarget(0), 0)
  assert.equal(vuTarget(NaN), 0)
  assert.ok(vuTarget(10) > 0.35, 'a slow tool still visibly moves the needle')
  assert.ok(vuTarget(10) < vuTarget(100))
  assert.equal(vuTarget(1e6), 1, 'pinned, never past full')

  const up = vuStep(0, 1, 45)
  const down = 1 - vuStep(1, 0, 45)
  assert.ok(up > 0.6, `attack reaches most of the way in one time-constant (${up})`)
  assert.ok(down < 0.1, `release falls slowly (${down})`)
  assert.equal(vuStep(0.5, 0.5, 16), 0.5)
  // Frame-rate independent: two 8ms steps land where one 16ms step does.
  assert.ok(Math.abs(vuStep(vuStep(0, 1, 8), 1, 8) - vuStep(0, 1, 16)) < 1e-12)

  const s = vuSegments(0.5, 24)
  assert.equal(s.lit, 12)
  assert.equal(s.zone(0), 'g'); assert.equal(s.zone(20), 'a'); assert.equal(s.zone(23), 'r')
})

test('the suite readout counts finished tests the way node --test prints them, once each', () => {
  const c = createSuiteCounter()
  const lines = [
    '$ node --test tests/a.test.mjs',
    '✔ one (1.2ms)',
    '✖ two (0.3ms)',
    '  Error: x',             // detail under a failure is indented: not a result
    '  ✔ a subtest (0.1ms)',   // nested: the parent's line is what counts
    '✔ three (2ms)',
    '﹣ four (0.1ms) # SKIP',
    'ℹ tests 4',
    'ℹ pass 2',
    '',
    '✖ failing tests:',        // the summary re-prints failures...
    '✖ two (0.3ms)',           // ...which must not count twice
  ]
  for (const l of lines) c.feed(l)
  assert.equal(c.done, 4)
  assert.equal(c.failed, 1)
  assert.equal(c.total, 4, 'the finished count is the next run\'s reference')

  const killed = createSuiteCounter()
  killed.feed('✔ one (1ms)')
  assert.equal(killed.total, null, 'a run that never reached its summary is no reference')
})

test('the suite readout says "~" against a previous run, and invents nothing without one', () => {
  assert.deepEqual(suiteReadout(12, 0, null), { frac: null, text: '12 done' })
  const mid = suiteReadout(300, 0, 600)
  assert.equal(mid.frac, 0.5)
  assert.match(mid.text, /^~300\/600$/)
  assert.equal(suiteReadout(700, 0, 600).frac, 0.99, 'past the old total is still not finished')
  assert.match(suiteReadout(300, 2, 600).text, /2 FAIL/)
  assert.deepEqual(suiteReadout(610, 0, 600, true), { frac: 1, text: '610 tests' })
})

test('the ON AIR caption names the holder', () => {
  assert.equal(onAirCaption(null), 'off air')
  assert.equal(onAirCaption({ onAir: false, busy: null, healthBatch: null }), 'off air')
  assert.equal(onAirCaption({ onAir: true, busy: 'SHIP' }), 'SHIP')
  assert.equal(onAirCaption({ onAir: true, busy: 'task "lint"' }), 'task lint')
  assert.equal(onAirCaption({ onAir: true, busy: 'a track save' }), 'track save')
  assert.equal(onAirCaption({ onAir: true, busy: null, healthBatch: 4242 }), 'health batch · pid 4242')
})

test('the transmitter lamps are the steps SHIP streams, in its order', async () => {
  // Read off the server's own pipeline rather than restated: a step renamed
  // there would otherwise leave a lamp that never lights.
  const src = (await import('node:fs')).readFileSync(new URL('../tools/admin-server.mjs', import.meta.url), 'utf8')
  const ship = src.slice(src.indexOf('async function ship('))
  const order = [...ship.matchAll(/\[\s*'(stamp|stations|lint|test|verify|staging|committing|pushing)'/g)].map((m) => m[1])
  assert.deepEqual(txLamps(true).map(([k]) => k), order)
  assert.deepEqual(txLamps(false).map(([k]) => k), order.filter((k) => k !== 'verify'))
})

process.env.SIGNAL_ADMIN_IMPORT = '1'
const admin = await import('../tools/admin-server.mjs')

test('healthLockHolder(): a live batch holds the air, a dead one does not', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'signal-onair-'))
  try {
    const lock = path.join(dir, '.roster-health.json.lock')
    assert.equal(admin.healthLockHolder(lock), null, 'no lock file, nothing on air')
    writeFileSync(lock, String(process.pid))
    assert.equal(admin.healthLockHolder(lock), process.pid, 'a living owner is on air')
    // A pid that has certainly exited: a child we already waited for.
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout
    writeFileSync(lock, dead)
    assert.equal(admin.healthLockHolder(lock), null, 'a stale lock (owner gone) is not on air')
    writeFileSync(lock, 'garbage')
    assert.equal(admin.healthLockHolder(lock), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
