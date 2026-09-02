// SIGNAL -- VECTOR SCAN, the hidden game. See game.js.
//
// What these are actually guarding, in rough order of how badly it would
// hurt to get wrong:
//
//   - The way IN stays invisible. The whole point of a hidden thing is that
//     nobody trips over it, so the code must not fire on a near miss, and
//     entering it must leave the radio exactly as it found it. The
//     volume-neutrality test is the one that pins the claim KONAMI_CODE's
//     comment makes -- if someone rebinds the arrows in the visualizer,
//     that test is what tells them the code is no longer silent.
//   - The way OUT is complete. The game exists only inside the visualizer
//     and there are four ways out of that; a missed one leaves frame()
//     painting a game over STANDBY.
//   - The simulation is frame-rate independent. This is the bug that would
//     never show up on the machine it was written on and would make the
//     game unplayable on a 120Hz display.

import assert from 'node:assert/strict'
import test from 'node:test'
import { boot } from './harness.mjs'

// The gate maths is pure, so it is imported the way helpers.test.mjs imports
// its subjects rather than reached through a booted program. Nothing in
// game.js touches the DOM at load.
globalThis.SIGNAL_BUILD ??= 'gametest'
globalThis.matchMedia ??= () => ({ matches: false })
const gameMod = await import(`../game.js?v=gametest`)
const { terrainAt, terrainAtGate, gateEase } = gameMod

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

/** Enter the code the way a person does: press and release, in order. */
function konami(h, seq = KONAMI) {
  for (const k of seq) h.tapKey(k)
}

/** Advance until the simulation has actually run `steps` fixed steps.
 *
 *  Counting steps rather than milliseconds, because milliseconds do not
 *  survive contact with drawGameFrame's accumulator: h.advance(16) runs
 *  ZERO steps (0.016 is a hair under STEP's 0.0167), and the first frame
 *  after the game opens runs zero too, since `lastT` starts null and that
 *  frame only seeds the clock. Three tests below were first written with a
 *  bare advance(16) and asserted against a simulation that had never run --
 *  the same silent pass CLAUDE.md warns about for a throttled probe, which
 *  is why this reads the step counter and not the clock. */
function tick(h, steps = 1) {
  const g = h.program._game
  const target = g.step + steps
  let guard = 0
  while (g.step < target && guard++ < 40 * steps + 40) h.advance(17)
  if (g.step < target) throw new Error(`tick: only ${g.step - target + steps}/${steps} steps ran`)
}

/** h.find() returns a ROW INDEX, or -1. `assert.ok(h.find(x))` is therefore
 *  true for -1 as well and asserts nothing; these two say what they mean. */
const onScreen = (h, text) => h.find(text) >= 0

/** Powered on, locked, visualizer up -- the only state the code is read in. */
async function inVisualizer(opts = {}) {
  const h = await boot(opts)
  h.powerOn()
  h.key('v')
  h.keyUp('v')
  assert.equal(h.program.visualizerActive, true, 'setup: visualizer is up')
  return h
}

test('the Konami code opens the game, and nothing else does', async () => {
  const h = await inVisualizer()
  try {
    assert.equal(h.program.gameOpen, false, 'not open on arrival')
    konami(h)
    assert.equal(h.program.gameOpen, true, 'the code opens it')
  } finally { h.shutdown() }
})

test('a near miss does not open the game', async () => {
  // Every one of these is a sequence someone could plausibly produce by
  // hand on the volume keys, which is exactly the population that must not
  // find this by accident.
  const misses = [
    ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'a', 'b'],
    ['ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
    ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
    ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'],
  ]
  for (const seq of misses) {
    const h = await inVisualizer()
    try {
      konami(h, seq)
      assert.equal(h.program.gameOpen, false, `must not open on ${seq.join(' ')}`)
    } finally { h.shutdown() }
  }
})

test('holding a key in the code does not break it', async () => {
  // Reported from real use, 2026-08-30, and the harness could never have
  // produced it: h.key() sends exactly ONE keydown, while a browser fires a
  // keydown every ~30ms for as long as a key is down. Press an arrow a
  // fraction too long and the buffer fills with duplicates, so the code
  // silently never matches and the final [A] falls through to the LINE
  // INPUT card instead -- which is exactly what it looks like from the
  // outside, and gives no clue that the press length was the problem.
  //
  // This is the trap CLAUDE.md's advert note describes, in miniature: the
  // fake was asked to confirm the assumption that built it.
  const h = await inVisualizer()
  try {
    for (const k of KONAMI) {
      h.key(k)
      // Held: the browser's auto-repeat, which sets `repeat` on every
      // keydown after the first.
      h.key(k, { repeat: true })
      h.key(k, { repeat: true })
      h.keyUp(k)
    }
    assert.equal(h.program.gameOpen, true, 'the code works even entered slowly')
  } finally { h.shutdown() }
})

test('an interrupted code has to be started again', async () => {
  const h = await inVisualizer()
  try {
    // Right prefix, one unrelated key, then the rest. The buffer is a
    // rolling window, so this is the case a naive "count how many matched
    // so far" implementation gets wrong.
    konami(h, KONAMI.slice(0, 6))
    h.tapKey('m')
    konami(h, KONAMI.slice(6))
    assert.equal(h.program.gameOpen, false, 'a key in the middle breaks it')
    konami(h)
    assert.equal(h.program.gameOpen, true, 'and entering it cleanly still works')
  } finally { h.shutdown() }
})

test('entering the code leaves the volume exactly where it was', async () => {
  // KONAMI_CODE's comment claims the code is silent because up-up-down-down
  // nets to zero and the rest is unbound. This is that claim, asserted --
  // rebind an arrow in the visualizer and this is what goes red.
  const h = await inVisualizer()
  try {
    const before = h.program.volume
    const muted = h.program.muted
    konami(h)
    assert.equal(h.program.gameOpen, true)
    assert.equal(h.program.volume, before, 'volume returned to where it started')
    assert.equal(h.program.muted, muted, 'and nothing got muted on the way')
  } finally { h.shutdown() }
})

test('the last key of the code does not also open the LINE INPUT card', async () => {
  // [A] is the sequence's final key and the visualizer's own consent-card
  // key. The detector consumes it; if it ever stops doing so, the card
  // opens on top of the game that just started.
  //
  // The `tap` boot option is load-bearing and this test was DECORATIVE
  // without it: with no navigator.mediaDevices, tapPromptTier() is 'none',
  // canOpenTapConsent() is false and the card cannot open however the key
  // is routed -- so the assertion held just as well with the consumption
  // deliberately broken. Found by mutating program.js and watching nothing
  // go red, which is the check CLAUDE.md asks for. `saved.tapConsent`
  // stops the card opening on [V] entry (that path asks the stored answer),
  // while leaving [A] able to open it (that path asks capability only) --
  // which is precisely the state this needs.
  const h = await inVisualizer({ tap: 'mic', saved: { tapConsent: 'no' } })
  try {
    assert.equal(h.program.canOpenTapConsent(), true, 'the card COULD open here')
    assert.equal(h.program.tapConsentOpen, false, 'and is not already up')
    konami(h)
    assert.equal(h.program.gameOpen, true)
    assert.equal(h.program.tapConsentOpen, false, 'the card did not open under it')
  } finally { h.shutdown() }
})

test('the game is unreachable on the lite layout', async () => {
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    h.key('v')
    if (h.program.visualizerActive) konami(h)
    assert.equal(h.program.gameOpen, false, 'never opens on mobile')
    assert.equal(h.program.startGame(h.screen), false, 'and refuses when called directly')
  } finally { h.shutdown() }
})

test('[E] leaves the game before it leaves the visualizer', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(200)
    h.tapKey('e')
    assert.equal(h.program.gameOpen, false, 'first [E] closes the game')
    assert.equal(h.program.visualizerActive, true, 'and stays in the visualizer')
    h.tapKey('e')
    assert.equal(h.program.visualizerActive, false, 'second [E] leaves')
  } finally { h.shutdown() }
})

test('every exit from the visualizer also ends the game', async () => {
  for (const how of ['escape', 'power']) {
    const h = await inVisualizer()
    try {
      konami(h)
      h.advance(200)
      assert.equal(h.program.gameOpen, true)
      if (how === 'escape') {
        h.program.exitVisualizer(h.screen)
      } else {
        h.program.powerDown(h.screen)
        h.advance(2000)
      }
      assert.equal(h.program.gameOpen, false, `game ended via ${how}`)
      assert.equal(h.program._game, null, `state dropped via ${how}`)
    } finally { h.shutdown() }
  }
})

test('the game runs for a while without throwing, and paints the canvas', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    // Fly around a bit, so terrain collision, firing and wave spawning all
    // actually get exercised rather than the ship sitting still.
    h.key('ArrowRight'); h.key(' ')
    h.advance(1500)
    h.keyUp('ArrowRight'); h.key('ArrowDown')
    h.advance(1500)
    h.keyUp('ArrowDown'); h.key('ArrowUp')
    h.advance(2000)
    h.keyUp('ArrowUp'); h.keyUp(' ')
    h.advance(1000)

    // Something Braille is on the playfield: the game is actually drawing
    // through the dot canvas and not just running a simulation in the dark.
    let braille = 0
    for (let y = 2; y < 21; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const c = h.term.chars[y * h.term.cols + x]
        if (c >= 0x2800 && c <= 0x28ff) braille++
      }
    }
    assert.ok(braille > 40, `expected a drawn playfield, saw ${braille} dot cells`)
  } finally { h.shutdown() }
})

test('the power meter is on screen and names every slot', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(200)
    const row = h.row(21)
    for (const slot of ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION']) {
      assert.ok(row.includes(slot), `meter shows ${slot}: ${JSON.stringify(row)}`)
    }
  } finally { h.shutdown() }
})

test('held arrows move the ship and releasing them stops it', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    const x0 = g.ship.x
    h.key('ArrowRight')
    h.advance(600)
    const moved = g.ship.x
    assert.ok(moved > x0 + 2, `held [Right] flies right (${x0} -> ${moved})`)
    h.keyUp('ArrowRight')
    h.advance(600)
    assert.equal(g.ship.x, moved, 'and it stops dead on keyup')
  } finally { h.shutdown() }
})

test('a key still held when the window goes away does not stay held', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    h.key('ArrowRight')
    h.advance(300)
    h.program._heldKeys.clear() // what the blur listener does
    const x = g.ship.x
    h.advance(600)
    assert.equal(g.ship.x, x, 'ship stopped rather than flying on forever')
  } finally { h.shutdown() }
})

test('the simulation is frame-rate independent', async () => {
  // The bug this exists for is invisible on the machine it was written on:
  // stepping the sim off the frame delta means a 120Hz display plays at
  // double speed. A single frame carrying a huge delta must advance the
  // world by the step cap, not by the delta.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    const before = g.scroll
    // One frame, ten seconds of wall clock -- a backgrounded tab coming back.
    h.program.drawGameFrame(h.screen, g.lastT + 10)
    const jumped = g.scroll - before
    assert.ok(jumped > 0, 'the world did advance')
    assert.ok(jumped <= 6 * 0.9 + 1e-9, `capped catch-up, got ${jumped}`)
  } finally { h.shutdown() }
})

test('a cleared formation drops a capsule and a leaked one does not', async () => {
  // The rule that makes the meter worth playing for. See gameFormationKill.
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program
    const g = p._game

    g.caps.length = 0
    p.gameSpawnWave()
    let fid = g.fid
    let n = g.forms.get(fid).total
    for (let i = 0; i < n; i++) p.gameFormationKill(fid, 40, 20, 'killed')
    assert.equal(g.caps.length, 1, 'clearing the whole formation drops one')

    g.caps.length = 0
    p.gameSpawnWave()
    fid = g.fid
    n = g.forms.get(fid).total
    p.gameFormationKill(fid, 40, 20, 'escaped')
    for (let i = 0; i < n - 1; i++) p.gameFormationKill(fid, 40, 20, 'killed')
    assert.equal(g.caps.length, 0, 'one that got away means no capsule')
    assert.equal(g.forms.has(fid), false, 'and the formation is forgotten either way')
  } finally { h.shutdown() }
})

test('a capsule stays in the channel and stays catchable', async () => {
  // First-playtest finding: capsules fell to the floor, which put the reward
  // for clearing a formation on the one surface that kills you, and gave you
  // about two seconds to get there. They now hang and drift.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.caps.length = 0
    const y0 = g.ship.y - 10
    g.caps.push({ x: g.w - 12, y: y0, vx: 0.28 })
    const startX = g.caps[0].x
    // Long enough that the old 0.35-a-step fall would have put it on the
    // floor several times over.
    h.advance(2500)
    const c = g.caps[0]
    assert.ok(c, 'still on the field after 2.5s')
    assert.ok(Math.abs(c.y - y0) < 12, `stayed near its drop height (${y0} -> ${c.y})`)
    // Never inside the terrain, which is what "catchable" actually means.
    const { terrainAt } = await import(`../game.js?v=${h.tag}`)
    const [top, bot] = terrainAt(Math.round(g.scroll + c.x), g.h)
    assert.ok(c.y > top && c.y < g.h - bot, `outside the rock (${c.y}, gap ${top}..${g.h - bot})`)
    assert.ok(c.x < startX, 'and it is drifting toward the ship')
  } finally { h.shutdown() }
})

test('flying into a capsule collects it', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    g.caps.length = 0
    g.meter = 0
    // Put one just ahead of the ship at its own height and fly into it.
    g.caps.push({ x: g.ship.x + 30, y: g.ship.y, vx: 0.28 })
    h.key('ArrowRight')
    h.advance(2000)
    h.keyUp('ArrowRight')
    assert.equal(g.caps.length, 0, 'picked up')
    assert.equal(g.meter, 1, 'and the meter cursor stepped to SPEED')
  } finally { h.shutdown() }
})

test('the meter spends, and a refused spend keeps the capsule', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program
    const g = p._game

    g.meter = 1 // SPEED
    p.gameSpendMeter()
    assert.equal(g.spd, 1, 'SPEED took')
    assert.equal(g.meter, 0, 'and the meter reset')

    g.spd = 4 // maxed
    g.meter = 1
    p.gameSpendMeter()
    assert.equal(g.spd, 4, 'no sixth speed level')
    assert.equal(g.meter, 1, 'and the capsule was NOT eaten')

    // DOUBLE and LASER are exclusive both ways round.
    g.meter = 3
    p.gameSpendMeter()
    assert.equal(g.double, true)
    g.meter = 4
    p.gameSpendMeter()
    assert.equal(g.laser, true)
    assert.equal(g.double, false, 'LASER drops DOUBLE')
  } finally { h.shutdown() }
})

test('[ENTER] with an empty meter does nothing at all', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const g = h.program._game
    g.meter = 0
    h.tapKey('Enter')
    assert.equal(g.spd, 0)
    assert.equal(g.meter, 0)
    assert.equal(h.program.gameOpen, true, 'and certainly does not exit')
  } finally { h.shutdown() }
})

test('options trail the path the ship actually flew', async () => {
  // Not "follow the ship" -- follow its HISTORY. An option should sit where
  // the ship was, which after a turn is somewhere the ship no longer is.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.opts = 1
    h.key('ArrowRight')
    h.advance(800)
    const [opt] = p.gameOptions()
    assert.ok(opt, 'there is an option')
    assert.ok(opt.x < g.ship.x, 'it trails behind the ship flying right')
    h.keyUp('ArrowRight')
    h.key('ArrowUp')
    h.advance(500)
    const [after] = p.gameOptions()
    assert.ok(after.y > g.ship.y, 'and it is still below after the ship climbs')
  } finally { h.shutdown() }
})

test('death costs the whole armament', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program
    const g = p._game
    g.spd = 3; g.missile = true; g.double = true; g.opts = 2; g.meter = 4
    const lives = g.lives
    g.invuln = 0
    p.gameLoseLife()
    assert.equal(g.lives, lives - 1)
    assert.deepEqual(
      { spd: g.spd, missile: g.missile, double: g.double, opts: g.opts, meter: g.meter },
      { spd: 0, missile: false, double: false, opts: 0, meter: 0 },
      'everything goes, the way the arcade does it',
    )
  } finally { h.shutdown() }
})

test('the shield eats a hit instead of a life', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program
    const g = p._game
    g.shield = 2
    g.spd = 2
    const lives = g.lives
    g.invuln = 0
    p.gameLoseLife()
    assert.equal(g.lives, lives, 'no life lost')
    assert.equal(g.shield, 1, 'the shield took it')
    assert.equal(g.spd, 2, 'and the armament survived')
  } finally { h.shutdown() }
})

test('running out of ships ends the game and returns to the effect', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program
    const g = p._game
    g.lives = 0
    g.invuln = 0
    p.gameLoseLife()
    g.invuln = 0
    p.gameLoseLife()
    assert.equal(g.over, true, 'game over')
    h.advance(400)
    assert.ok(h.find('GAME OVER'), 'and says so')
    // It hands the screen back on its own rather than sitting there.
    h.advance(6000)
    assert.equal(h.program.gameOpen, false, 'returned to the effect canvas')
    assert.equal(h.program.visualizerActive, true, 'still in the visualizer')
  } finally { h.shutdown() }
})

// --- difficulty pass, 2026-08-30 ---------------------------------------
// Three reports from real players: you can just hold fire, enemies are easy
// to kill, and there is no sign of how a level ends. They were one problem
// wearing three hats -- the only threat in the game was collision -- and
// these guard the three answers.

test('holding fire is capped by shots on screen, not just by the cooldown', async () => {
  // The complaint was that holding fire is strictly dominant. A cooldown
  // alone cannot fix that; the cap is what makes range and timing matter.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    // Face open sky so nothing is close enough to recycle a slot quickly.
    g.bullets.length = 0
    h.key(' ')
    h.advance(3000)
    h.keyUp(' ')
    const forward = g.bullets.filter((b) => b.kind !== 'm').length
    assert.ok(forward > 0, 'it does fire')
    assert.ok(forward <= 4, `capped at 4 with no options, saw ${forward}`)
  } finally { h.shutdown() }
})

test('options widen the shot cap', async () => {
  // Otherwise the cap would make Options a downgrade, which is the exact
  // opposite of what the meter is teaching you to save for.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.bullets.length = 0
    assert.equal(p.gameCanFire(), true)
    for (let i = 0; i < 4; i++) g.bullets.push({ x: 100, y: 30, vx: 3.4, vy: 0, kind: 'b' })
    assert.equal(p.gameCanFire(), false, 'four is the cap with no options')
    g.opts = 2
    assert.equal(p.gameCanFire(), true, 'two options make room for more')
  } finally { h.shutdown() }
})

test('a full missile pool does not block the forward gun', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.missile = true
    g.bullets.length = 0
    for (let i = 0; i < 6; i++) g.bullets.push({ x: 100, y: 30, vx: 1.7, vy: 0, kind: 'm' })
    assert.equal(p.gameCanFire(), true, 'missiles are a separate pool')
  } finally { h.shutdown() }
})

test('forward shots do not crowd out missiles either', async () => {
  // The pool has to be separate in BOTH directions. If forward fire counted
  // against the missile cap, MISSILE would quietly stop working whenever
  // you were shooting -- which is most of the time.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.missile = true
    g.bullets.length = 0
    for (let i = 0; i < 8; i++) g.bullets.push({ x: 100, y: 30, vx: 3.4, vy: 0, kind: 'b' })
    p.gameFire(g.ship.x + 4, g.ship.y)
    const missiles = g.bullets.filter((b) => b.kind === 'm').length
    assert.ok(missiles > 0, 'a missile still launched with the gun busy')
  } finally { h.shutdown() }
})

test('enemies shoot back, and telegraph it first', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.ebullets.length = 0
    g.enemies.length = 0
    // One enemy, far enough ahead to be allowed to fire (see
    // MIN_FIRE_RANGE), wound up and about to. `shooter` is explicit because
    // only a fraction of a real formation is armed -- this literal silently
    // became fodder when that landed, and the suite caught it.
    g.enemies.push({
      x: g.ship.x + 60, baseY: g.ship.y, y: g.ship.y, amp: 0, phase: 0, vx: 0, fid: 999,
      shooter: true, shootIn: 3, tel: 0, aimX: 0, aimY: 0,
    })
    g.forms.set(999, { total: 1, killed: 0, escaped: 0 })
    h.advance(120)
    const en = g.enemies[0]
    assert.ok(en && en.tel > 0, 'winds up before firing')
    assert.equal(g.ebullets.length, 0, 'and has not fired during the wind-up')
    h.advance(400)
    assert.ok(g.ebullets.length > 0, 'then a shot exists')
  } finally { h.shutdown() }
})

test('nothing fires from point blank', async () => {
  // The single most important fairness rule in the game, and it was found
  // only by measuring: mean enemy shots on screen was 0.11 with a maximum
  // of 1, yet those shots were killing a dodging bot every 8 seconds. There
  // was no wall of bullets -- nearly every shot fired was simply
  // unavoidable, because nothing stopped an enemy firing from three dots
  // away. Two earlier tuning passes chased the wrong number entirely.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    g.ebullets.length = 0
    g.enemies.length = 0
    // Right on top of the ship, armed, and due to fire immediately.
    g.enemies.push({
      x: g.ship.x + 8, baseY: g.ship.y, y: g.ship.y, amp: 0, phase: 0, vx: 0, fid: 998,
      shooter: true, shootIn: 1, tel: 0, aimX: 0, aimY: 0,
    })
    g.forms.set(998, { total: 1, killed: 0, escaped: 0 })
    const en = g.enemies[0]
    // Polled rather than sampled once at the end. A shot fired at a
    // stationary ship reaches it, kills it, and gameLoseLife clears the
    // array -- so a single late look sees an empty list and reads a shot
    // that WAS fired as one that never was.
    let everFired = false
    const watch = (ms) => {
      for (let i = 0; i < ms; i += 50) {
        h.advance(50)
        if (g.ebullets.length > 0) everFired = true
      }
    }
    watch(1500)
    assert.equal(everFired, false, 'held its fire at point blank')
    // And it is a hold, not a reset: back off, and it shoots.
    en.x = g.ship.x + 60
    watch(1500)
    assert.equal(everFired, true, 'fires once there is room to answer')
  } finally { h.shutdown() }
})

test('an enemy shot kills the ship', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.invuln = 0
    const lives = g.lives
    g.ebullets.length = 0
    g.ebullets.push({ x: g.ship.x + 6, y: g.ship.y, vx: -2, vy: 0 })
    h.advance(200)
    assert.equal(g.lives, lives - 1, 'incoming fire is lethal')
    assert.equal(g.ebullets.length, 0, 'and the screen is cleared on respawn')
  } finally { h.shutdown() }
})

test('an aimed shot commits to where the ship was, so it can be dodged', async () => {
  // A shot that re-aims at the moment of firing is unavoidable by moving,
  // which would make the telegraph a lie.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.ebullets.length = 0
    // The remembered point has to sit on the OPPOSITE side of the muzzle
    // from the ship, or both behaviours produce the same signs and the
    // assertion proves nothing. That is exactly how the first version of
    // this test passed with the commitment deliberately removed: the ship
    // and the aim point were both down-left of the muzzle.
    g.ship.x = 30
    g.ship.y = 70            // ship low
    p.gameEnemyFire(100, 40, 1.5, 30, 6)   // remembered point high
    const b = g.ebullets[0]
    assert.ok(b, 'fired')
    assert.ok(b.vx < 0, 'travelling leftward')
    assert.ok(b.vy < 0, 'and UP toward where the ship was, not down to where it is')
  } finally { h.shutdown() }
})

test('turrets sit on the terrain surface and ride the scroll', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    const { terrainAt } = await import(`../game.js?v=${h.tag}`)
    g.turrets.length = 0
    p.gameSpawnTurret()
    const t = g.turrets[0]
    assert.ok(t, 'spawned')
    const a = p.gameTurretPos(t)
    const [top, bot] = terrainAt(t.col, g.h)
    const onSurface = t.floor
      ? Math.abs(a.y - (g.h - 1 - bot - 2)) < 0.001
      : Math.abs(a.y - (top + 2)) < 0.001
    assert.ok(onSurface, 'sits on the ground, not floating')
    const x0 = a.x
    h.advance(600)
    assert.ok(p.gameTurretPos(t).x < x0, 'and scrolls with the terrain')
  } finally { h.shutdown() }
})

test('a missile can kill a turret, which is the point of the slot', async () => {
  // Before turrets there was nothing on the ground to shoot, so MISSILE was
  // a trap choice on the meter -- a hole in the economy, not just a
  // difficulty problem.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    g.turrets.length = 0
    g.bullets.length = 0
    p.gameSpawnTurret()
    const t = g.turrets[0]
    const pos = p.gameTurretPos(t)
    const score = g.score
    g.bullets.push({ x: pos.x, y: pos.y, vx: 0, vy: 0, kind: 'm' })
    h.advance(60)
    assert.equal(g.turrets.length, 0, 'destroyed')
    assert.ok(g.score > score, 'and scored')
  } finally { h.shutdown() }
})

test('the stage advances on distance and says so', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    assert.equal(g.stage, 1)
    assert.ok(h.row(1).includes('STAGE 1'), `HUD names the stage: ${JSON.stringify(h.row(1))}`)
    // Just short of the rollover, then over it.
    g.stageIn = 20
    h.advance(600)
    assert.equal(g.stage, 2, 'rolled over')
    assert.ok(h.row(1).includes('STAGE 2'), 'and the readout followed')
  } finally { h.shutdown() }
})

test('the stage bar fills as the stage is travelled', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const filled = (row) => (row.match(/█/g) || []).length
    const early = filled(h.row(1))
    // Flown, not assigned. Setting stageIn by hand would only prove the bar
    // renders whatever it is given -- it would stay green with the stage
    // clock stopped dead, which is the bug that matters.
    h.advance(9000)
    const late = filled(h.row(1))
    assert.ok(late > early, `bar fills as you travel (${early} -> ${late})`)
  } finally { h.shutdown() }
})

test('enemies fire more often in later stages', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const p = h.program
    const g = p._game
    // Sample the interval rather than trusting one draw -- it is randomised.
    const sample = () => {
      let n = 0
      for (let i = 0; i < 200; i++) n += p.gameFireInterval()
      return n / 200
    }
    g.stage = 1
    const early = sample()
    g.stage = 5
    const late = sample()
    assert.ok(late < early * 0.85, `pressure ramps (${early.toFixed(0)} -> ${late.toFixed(0)})`)
  } finally { h.shutdown() }
})

test('vertical movement is not artificially slower than horizontal', async () => {
  // The original factor came from a wrong claim about Braille dot shape --
  // that a dot is twice as tall as it is wide. Measured, a dot in ter-u16n
  // is 4.5px across and 4px down, so climbing was ~45% slower than it
  // looked. Now derived from the canvas's own measurement.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(100)
    const g = h.program._game
    assert.ok(g.vAspect > 1.0 && g.vAspect < 1.3, `aspect from the font, got ${g.vAspect}`)

    g.ship.x = 60; g.ship.y = 40
    const y0 = g.ship.y
    h.key('ArrowUp'); h.advance(500); h.keyUp('ArrowUp')
    const dy = y0 - g.ship.y

    g.ship.x = 60; g.ship.y = 40
    const x0 = g.ship.x
    h.key('ArrowRight'); h.advance(500); h.keyUp('ArrowRight')
    const dx = g.ship.x - x0

    assert.ok(dy >= dx, `vertical keeps up with horizontal in dots (${dy} vs ${dx})`)
  } finally { h.shutdown() }
})

test('the terrain always leaves a gap the ship can fit through', async () => {
  // A pure function, so this can sweep far more of the level than anyone
  // could fly. The failure it guards is not "hard": a channel narrower than
  // the ship is a wall across the screen with no way past, which ends the
  // run rather than testing it -- and it would appear tens of thousands of
  // dots in, where no play session would ever find it.
  const { terrainAt } = await import(`../game.js?v=terrain${Date.now()}`)
  const h = 76 // the desktop playfield, 19 rows of 4 dots
  let tightest = Infinity
  for (let c = 0; c < 200_000; c += 7) {
    const [top, bot] = terrainAt(c, h)
    assert.ok(top >= 1 && bot >= 1, `terrain has thickness at ${c}: ${top}/${bot}`)
    assert.ok(Number.isFinite(top) && Number.isFinite(bot), `finite at ${c}`)
    tightest = Math.min(tightest, h - top - bot)
  }
  // The ship is 5 dots tall and needs room to react, not just to fit.
  assert.ok(tightest >= 20, `tightest channel was ${tightest} dots`)
})

test('game over clears the field instead of freezing it', async () => {
  // Reported from real play: "at game over some artifacts of enemies freeze
  // on screen". The scroll keeps running past the game-over return, so
  // anything left in the entity lists hung motionless over moving ground --
  // which reads as a crash, not an ending.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(200)
    const p = h.program
    const g = p._game
    p.gameSpawnWave()
    p.gameSpawnTurret()
    g.ebullets.push({ x: 80, y: 30, vx: -1, vy: 0 })
    g.caps.push({ x: 90, y: 30, vx: 0.28 })
    assert.ok(g.enemies.length > 0 && g.turrets.length > 0, 'field is populated')

    g.lives = 0
    g.invuln = 0
    p.gameLoseLife()
    g.invuln = 0
    p.gameLoseLife()
    assert.equal(g.over, true, 'game over')

    for (const [what, list] of [['enemies', g.enemies], ['enemy shots', g.ebullets],
                                ['turrets', g.turrets], ['capsules', g.caps]]) {
      assert.equal(list.length, 0, `${what} cleared rather than frozen`)
    }
    // Debris is the exception -- the last explosion has to finish.
    const before = g.parts.length
    assert.ok(before > 0, 'the explosion exists')
    h.advance(600)
    assert.ok(g.parts.length < before, 'and it plays out rather than hanging')
  } finally { h.shutdown() }
})

test('the visualizer never opens on its own any more', async () => {
  // Retired 2026-08-30 at the owner's request. It was right when the
  // visualizer was purely a screensaver and wrong once it became a place
  // with state -- taking the screen unasked covers a weather card, drops a
  // lyrics view, and re-arms every effect clock under someone who never
  // asked to go anywhere. Nothing failed when the call was removed, which
  // is why this exists.
  const h = await boot({ player: true })
  try {
    h.powerOn()
    h.key('3')
    h.advance(3000)
    await h.flush()
    assert.equal(h.program.visualizerActive, false, 'not up to start with')
    // Well past the old VISUALIZER_IDLE_MS (4m20s), with no input at all.
    h.advance(6 * 60 * 1000, 64)
    assert.equal(h.program.visualizerActive, false, 'still has not let itself in')
    // And [V] still works, so this removed the timer and not the feature.
    h.key('v')
    assert.equal(h.program.visualizerActive, true, '[V] still opens it')
  } finally { h.shutdown() }
})

test('the game does not click', async () => {
  // The dead-feedback rule runs both ways. A key that clicks must change
  // something; the game changes plenty and must NOT click, because a click
  // on every shot and every step of held movement would be the loudest
  // thing on screen. Silent-and-changing is the correct half of the pair.
  const h = await inVisualizer()
  try {
    konami(h)
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'z', 'Enter']) {
      assert.equal(
        h.program.isMappedKey({ key: k }), false,
        `[${k}] must not click while the game is up`,
      )
    }
  } finally { h.shutdown() }
})

test('the radio is still a radio underneath the game', async () => {
  // Keys the game does not claim keep working. The track playing under the
  // game is the station's, so mute in particular has to still reach it.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(200)
    const muted = h.program.muted
    h.tapKey('m')
    assert.equal(h.program.muted, !muted, '[M] still mutes')
    assert.equal(h.program.gameOpen, true, 'and did not disturb the game')
  } finally { h.shutdown() }
})

// --- the stage break (2026-08-30) ----------------------------------------
//
// What these are guarding, worst-first:
//
//   - The gate reaching the COLLISION test and not only the drawing. Open
//     sky you cannot fly through is the single worst thing this feature
//     could ship as, it would look completely correct in a screenshot, and
//     it is one forgotten call site away at all times.
//   - The break actually being a breath. If the suppressed spawn timers ran
//     down anyway, everything they held back would arrive in one wave on
//     the far side, which is worse than no break at all.

test('the gate only ever opens the passage, never closes it', () => {
  // terrainAt's own min-gap guarantee must survive being gated. The gate
  // eases toward a 1-dot crust, so every column it touches gets wider --
  // if this ever inverts, the break becomes a wall across the screen.
  const h = 76
  let worst = Infinity, tightest = Infinity
  for (let c = 0; c < 6000; c++) {
    const [t0, b0] = terrainAt(c, h)
    const [t1, b1] = terrainAtGate(c, h, 3000)
    assert.ok(t1 >= 1 && b1 >= 1, `crust must survive at column ${c}`)
    worst = Math.min(worst, (h - t1 - b1) - (h - t0 - b0))
    tightest = Math.min(tightest, h - t1 - b1)
  }
  assert.ok(worst >= 0, `gating narrowed the passage by ${-worst} dots somewhere`)
  assert.ok(tightest >= 20, `gated terrain closed to ${tightest} dots`)
})

test('the gate is a no-op with no break running, and local to the one it cuts', () => {
  const h = 76
  for (const c of [0, 137, 4001]) {
    assert.deepEqual(terrainAtGate(c, h, null), terrainAt(c, h), `null gate changed column ${c}`)
  }
  // Far from the gate, nothing moves; at its centre, the cave is fully open.
  assert.deepEqual(terrainAtGate(9999, h, 3000), terrainAt(9999, h), 'gate reached across the level')
  assert.deepEqual(terrainAtGate(3000, h, 3000), [1, 1], 'gate centre is not open sky')
  assert.equal(gateEase(3000, 3000), 1)
  assert.equal(gateEase(9999, 3000), 0)
})

test('the gate reaches the collision test, not just the picture', async () => {
  // The invisible-wall guard. Put the ship inside rock that the UNGATED
  // terrain would kill it for, and prove the gate saves it -- then prove
  // the same position without a gate still kills, so this cannot pass by
  // the collision having quietly stopped working altogether.
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program, g = p._game
    // A column with a real ceiling to be buried in.
    let col = 0
    for (let c = 100; c < 8000; c++) { if (terrainAt(c, g.h)[0] >= 8) { col = c; break } }
    assert.ok(col > 0, 'setup: found no ceiling thick enough to test against')

    const place = (gateAt) => {
      g.scroll = col - g.ship.x
      g.gateAt = gateAt
      g.ship.y = 5          // inside the ungated ceiling, clear of the gated one
      g.invuln = 0
      g.lives = 3
      tick(h)
      return g.lives
    }
    assert.equal(place(null), 2, 'setup: ungated rock at this spot must kill')
    assert.equal(place(col), 3, 'the gate opened the picture but not the rock')
  } finally { h.shutdown() }
})

test('the gate reaches the bullets too, not just the ship (2026-09-02 audit, L2)', async () => {
  // Same shape as the ship test above, for the other things that consult
  // terrain: a shot fired through the opened corridor must survive where
  // the UNGATED rock would have eaten it -- otherwise the break shows the
  // player clear sky their bullets silently die in.
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program, g = p._game
    let col = 0
    for (let c = 100; c < 8000; c++) { if (terrainAt(c, g.h)[0] >= 8) { col = c; break } }
    assert.ok(col > 0, 'setup: found no ceiling thick enough to test against')
    const place = (gateAt) => {
      g.scroll = col - 10
      g.gateAt = gateAt
      g.enemies = []; g.turrets = []; g.capsules = []
      g.bullets = [{ x: 10, y: 4, vx: 0, vy: 0, kind: 'b' }] // inside the ungated ceiling
      p.gameStepBullets()
      return g.bullets.length
    }
    assert.equal(place(null), 0, 'setup: ungated rock at this spot must stop a shot')
    assert.equal(place(col + 10), 1, 'the gate opened the picture but the shot still died in it')
  } finally { h.shutdown() }
})

test('a stage rollover opens a break ahead of the ship, and holds the spawns', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program, g = p._game
    g.enemies = []; g.turrets = []
    g.stageIn = 0.5
    tick(h)
    assert.equal(g.stage, 2, 'the stage rolled over')
    assert.ok(g.stageBreak > 0, 'the break started')
    // Cut ahead of the right-hand edge, so the corridor arrives rather than
    // being discovered already around you.
    assert.ok(g.gateAt > g.scroll + g.w, `gate at ${g.gateAt} is not ahead of the screen edge ${g.scroll + g.w}`)

    // Nothing spawns for the length of the break, and the timers that would
    // have spawned are HELD, not run down against a suppressed spawn.
    //
    // Baselined here rather than before the rollover: the wave block sits
    // ABOVE the rollover in gameStep, so the step that starts the break
    // legitimately decrements once on its way past. The claim under test is
    // that the timers do not move THROUGH the break.
    // Stepped directly rather than through tick(): one advance() can run
    // two fixed steps, so a tick()-driven loop overshoots the end of the
    // break by one and that step -- correctly -- decrements the timer
    // again. The claim is about the break's own duration, so the loop has
    // to be able to stop exactly at its end.
    const waveBefore = g.waveIn, turretBefore = g.turretIn
    let guard = 0
    while (g.stageBreak > 0 && guard++ < 500) p.gameStep(h.screen)
    assert.equal(g.enemies.length, 0, 'a wave spawned during the break')
    assert.equal(g.turrets.length, 0, 'a turret spawned during the break')
    assert.equal(g.waveIn, waveBefore, 'the wave timer ran down through the break')
    assert.equal(g.turretIn, turretBefore, 'the turret timer ran down through the break')
  } finally { h.shutdown() }
})

test('the break announces itself and gets out of the way before the rock returns', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const g = h.program._game
    g.stageIn = 0.5
    tick(h)
    assert.ok(onScreen(h, 'STAGE 2'), 'the break does not say which stage it is')
    assert.ok(onScreen(h, 'CLEAR SKY'), 'the break has no second line')
    // Run to the last few steps of the break: the words must already be gone.
    while (g.stageBreak > 2) tick(h)
    assert.equal(h.find('CLEAR SKY'), -1, 'the banner was still up as the stage started')
  } finally { h.shutdown() }
})

// --- the meter wipe -------------------------------------------------------

/** Attribute at the first character of each meter label. The wipe changes
 *  ONLY attributes -- the labels never move -- so a test that reads the
 *  characters back cannot see this feature at all. Found the hard way. */
function meterAttrs(h) {
  const { METER_Y, POWERS } = gameMod
  const term = h.screen.term
  const row = h.row(METER_Y)
  return POWERS.map((name) => {
    const c = row.indexOf(name)
    return c < 0 ? null : term.attrs[METER_Y * term.cols + c]
  })
}

test('death empties the meter box by box, left to right', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const { BRIGHT, BOLD, FAINT, NORMAL } = await import('../src/term.js')
    const p = h.program, g = p._game
    h.advance(16)
    // Own the first three and OPTION; leave LASER and '?' unearned.
    g.spd = 2; g.missile = true; g.double = true; g.opts = 1; g.lives = 2
    h.advance(16)
    p.gameLoseLife()
    assert.ok(g.wipe > 0, 'the wipe did not arm')

    const flared = [false, false, false, false, false, false]
    let lastGone = -1
    while (g.wipe > 0) {
      const attrs = meterAttrs(h)
      attrs.forEach((a, i) => { if (a === (BRIGHT | BOLD)) flared[i] = true })
      // Once a box has gone out it stays out: the cascade only travels one way.
      const gone = attrs.lastIndexOf(FAINT)
      if (attrs[0] === FAINT) assert.ok(gone >= lastGone, 'the wipe went backwards')
      lastGone = Math.max(lastGone, 0)
      h.advance(16)
    }
    assert.deepEqual(
      flared, [true, true, true, false, true, false],
      'every OWNED box should flare on its way out, and no unowned one should',
    )
    // And when it is done, the meter really is empty.
    assert.deepEqual(meterAttrs(h), Array(6).fill(FAINT), 'the meter did not end empty')
  } finally { h.shutdown() }
})

test('dying with nothing to lose does not run the wipe', async () => {
  // The wipe means "this is what it cost". With an empty meter it would
  // mean "you died", which the explosion already said.
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program, g = p._game
    h.advance(16)
    g.spd = 0; g.missile = false; g.double = false; g.laser = false
    g.opts = 0; g.shield = 0; g.lives = 2
    p.gameLoseLife()
    assert.equal(g.wipe, 0, 'the wipe armed with an empty meter')
  } finally { h.shutdown() }
})

// --- the high score -------------------------------------------------------

test('the high score survives the run, both ways out', async () => {
  for (const how of ['game over', 'walked out with [E]']) {
    const h = await inVisualizer()
    try {
      konami(h)
      const p = h.program, g = p._game
      h.advance(16)
      g.score = 4242
      if (how === 'game over') { g.lives = 0; p.gameLoseLife() } else { h.tapKey('e') }
      assert.equal(p.gameHiScore, 4242, `the score was lost on: ${how}`)
    } finally { h.shutdown() }
  }
})

test('a worse run does not overwrite a better record', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program
    p.gameHiScore = 9000
    p._game.hiAtStart = 9000
    p._game.score = 12
    h.tapKey('e')
    assert.equal(p.gameHiScore, 9000, 'a losing run stamped over the record')
  } finally { h.shutdown() }
})

test('the record is written where a reload will find it', async () => {
  // End to end through the real state.js, not just the in-memory field --
  // a high score that never reaches localStorage is the one thing this
  // feature exists to prevent.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(16)
    h.program._game.score = 777
    h.tapKey('e')
    const { STORAGE_KEY } = await import('../state.js?v=gametest')
    const saved = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) || '{}')
    assert.equal(saved.gameHiScore, 777, 'the record never reached storage')
  } finally { h.shutdown() }
})

test('powering off mid-game commits a record run (2026-09-02 audit, B3)', async () => {
  // The third door out of a run, after game over and [E]: powerDown()'s
  // hand-copied teardown dropped gameRecordScore(), so a record ended by
  // [P] -- or the sleep timer, whose whole audience is someone walking
  // away -- was silently discarded. gameRecordScore's own note says the
  // design exists to keep the good runs; this held only for two of the
  // three exits.
  const h = await inVisualizer()
  try {
    konami(h)
    h.advance(16)
    h.program._game.score = 4242
    // powerDown() is called directly: [P] is deliberately not mapped inside
    // the visualizer (you exit first), so the LIVE route here is the sleep
    // timer expiring mid-game -- and walking the fake clock through a
    // 15-minute timer plus the fade at 16ms steps would cost the suite more
    // than the wiring is worth. The timer -> powerDown chain has its own
    // coverage; this test owns powerDown's teardown.
    h.program.powerDown(h.screen)
    h.advance(2000)
    assert.equal(h.program.poweredOn, false, 'the set went down')
    assert.equal(h.program.gameHiScore, 4242, 'the record survived the power-off')
    const { STORAGE_KEY } = await import('../state.js?v=gametest')
    const saved = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) || '{}')
    assert.equal(saved.gameHiScore, 4242, 'and reached storage')
  } finally { h.shutdown() }
})

test('GAME OVER reports the record, and says so when it was beaten', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program, g = p._game
    h.advance(16)
    g.hiAtStart = 100
    g.score = 5000
    g.lives = 0
    p.gameLoseLife()
    h.advance(200)
    assert.ok(onScreen(h, 'NEW RECORD'), 'beating the record went unremarked')
  } finally { h.shutdown() }
})

test('GAME OVER shows the standing record when it was not beaten', async () => {
  const h = await inVisualizer()
  try {
    konami(h)
    const p = h.program, g = p._game
    h.advance(16)
    g.hiAtStart = 999999
    g.score = 10
    g.lives = 0
    p.gameLoseLife()
    h.advance(200)
    assert.equal(h.find('NEW RECORD'), -1, 'a losing run claimed a record')
    assert.ok(onScreen(h, 'HI 0999999'), 'the standing record is not shown')
  } finally { h.shutdown() }
})
