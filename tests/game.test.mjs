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

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

/** Enter the code the way a person does: press and release, in order. */
function konami(h, seq = KONAMI) {
  for (const k of seq) h.tapKey(k)
}

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
