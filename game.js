// SIGNAL -- VECTOR SCAN, the hidden game (2026-08-29).
//
// A Gradius. Reached only by entering the Konami code inside the
// visualizer; nothing on screen ever mentions it, and it is in no legend,
// no guide page and no README.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js. The
// two `src/` imports are plain, like every other app module's engine
// imports: the engine is vendored at the same commit as the app.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from './src/term.js'
import { DotCanvas } from './src/vector.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { playGameCapsule, playGameHit, playGamePowerUp, playGameShot } = await import(`./audio/sfx.js?v=${V}`)
const { VIZ_BOT, centerX } = await import(`./layout.js?v=${V}`)
// The visualizer effects' own 2D hash, reused rather than reinvented -- see
// gameDrawTerrain for what it is doing here and what the first attempt got
// wrong.
const { hash2 } = await import(`./visuals/shared.js?v=${V}`)

// --- why this is drawn in Braille ---------------------------------------
// src/vector.js has been in the engine, unused by the app, since it was
// vendored: U+2800..28FF is every combination of a 2x4 dot matrix, so the
// character grid doubles as a 160x76 monochrome framebuffer, rasterised
// through the same path as text and synthesised by bdf.js for a face that
// carries no Braille of its own (Terminus carries none).
//
// It is used HERE and nowhere else on purpose. Every visualizer effect is
// built out of characters because a character grid is what SIGNAL is; a
// shooter is the one thing on the roster that genuinely cannot be, because
// a ship that moves in whole-cell steps reads as teleporting rather than
// flying. Sub-cell motion is the entire difference between this feeling
// like a game and feeling like a screensaver with a cursor on it.
//
// The cost, and it is a real one: blit() writes one attribute per CELL, so
// brightness is quantised to the character grid even though position is
// not. That is why the three layers below are separate canvases blitted in
// order rather than one -- terrain dim, hazards normal, the player bright.
// A cell holding two layers keeps the brighter one whole and loses the
// dimmer one's dots in that cell, which is the right way round: the player
// is never occluded by scenery.

/** The playfield's rows: below the HUD line, above the power meter. Both of
 *  those are TEXT on the same grid, which is the whole trick -- the arcade
 *  original's power meter is a row of labelled boxes, and a row of labelled
 *  boxes is the one thing a terminal draws better than a framebuffer. */
export const GAME_TOP = 2
export const GAME_ROWS = VIZ_BOT - 3
export const HUD_Y = 1
export const METER_Y = VIZ_BOT - 1

/** Fixed simulation step. The sim MUST NOT run off the frame delta: this
 *  draws from a rAF loop, so a 120Hz display would otherwise play the game
 *  at double speed and a 30Hz one at half. Accumulate real time, step at a
 *  constant rate, and cap the catch-up so returning from a backgrounded tab
 *  (or the covered-window 0fps case in CLAUDE.md) resumes rather than
 *  fast-forwards through the terrain. */
export const STEP = 1 / 60
const MAX_STEPS = 6
const MAX_DT = 0.25

// The power meter, in the arcade's own order. The capsule cursor walks it
// left to right and wraps; [ENTER] spends whatever it is sitting on.
export const POWERS = ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?']

const SPEEDS = [0.62, 0.86, 1.12, 1.42, 1.75]
const MAX_OPTIONS = 2
const START_LIVES = 3

// --- on-screen shot cap (2026-08-30) ------------------------------------
// The first version had none, and playtesters found the obvious dominant
// strategy immediately: hold fire forever, because there is no cost to it.
// A cooldown alone cannot fix that -- it caps the RATE but leaves holding
// strictly better than not holding, so the fire button stops being a
// decision.
//
// The arcade's answer is a limit on shots ON SCREEN, and it is a much
// better mechanic than it sounds. Spray from across the map and your slots
// are all in flight, so you cannot shoot the thing that just appeared in
// front of you; fire at something close and the slots recycle immediately.
// It makes range and timing matter without making the gun weaker.
//
// Options widen the cap, so they still read as a straight upgrade. DOUBLE's
// diagonal counts against it, which is the honest trade: more coverage for
// less forward throughput.
const SHOT_CAP = 4, SHOT_CAP_PER_OPT = 3
// The laser is long, fast and pierces, so it gets a much tighter cap --
// otherwise it is simply the best option in every situation rather than a
// trade against DOUBLE.
const LASER_CAP = 2, LASER_CAP_PER_OPT = 1
// Missiles have their own pool. Sharing the forward cap would mean taking
// MISSILE actively reduced your forward fire, which is a punishing thing
// for a power-up to do.
const MISSILE_CAP = 2, MISSILE_CAP_PER_OPT = 1

// --- how the difficulty of incoming fire was actually found -------------
// Worth writing down, because three of the four things tried here were
// wrong and the reasoning is not recoverable from the constants.
//
// Symptom: with enemy fire added, a bot that flies the terrain perfectly
// died every 8 seconds. Attributing deaths by cause said 88% were enemy
// bullets. Two rounds of tuning followed from that number -- fewer
// shooters, wider intervals, slower shots, a longer telegraph, a cap on
// shots in flight -- and the proportion did not move at all.
//
// It could not move. The bot never dies to terrain, so "% of deaths from
// bullets" is pinned near 100 however gentle the bullets are. It was a
// property of the measurement, not of the game, and two passes were spent
// tuning against it.
//
// Measuring ABSOLUTES instead found the real shape immediately: mean
// enemy shots on screen 0.11, maximum 1. There was no wall of bullets and
// the cap never once bound. One shot every nine seconds was killing the
// bot every eight -- meaning very nearly every shot fired was
// unavoidable, because nothing stopped an enemy firing from point blank.
// A shot from three dots away has a two-step flight time; no telegraph
// rescues that.
//
// So the fix is a minimum range, below. The cap stays as cheap insurance
// for later stages, where the rate does climb -- but it is a backstop that
// does not fire today, and this comment says so rather than implying it
// solved something.
const EBULLET_CAP = 4, EBULLET_CAP_PER_STAGE = 1
/** How far ahead of the ship a gun has to be before it may fire.
 *
 *  At the shot's 1.25 dots a step this is ~0.45s of flight on top of the
 *  wind-up, against a ship that covers ~19 dots in the same time. That is
 *  the difference between a shot you answer and a shot that has already
 *  hit you. Anything closer holds fire and keeps its interval, so an enemy
 *  that drifts past you does not get a free point-blank shot on the way. */
const MIN_FIRE_RANGE = 34

// --- stages (2026-08-30) ------------------------------------------------
// Distance, not time, so the stage is a place you travel through rather
// than a clock you wait out. ~100s at the current scroll rate.
export const STAGE_DOTS = 5400
// Options trail the ship along the path it actually flew, which is the
// mechanic they are famous for: the trail is a ring buffer of past ship
// positions and option i simply reads it (i+1)*OPTION_LAG steps back. No
// pathfinding, no follow logic -- the history IS the path.
const OPTION_LAG = 13
const TRAIL_LEN = OPTION_LAG * (MAX_OPTIONS + 1) + 4

// Sprites as [dx, dy] dot offsets from the entity's centre.
const SHIP = [
  [0, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1],
  [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  [0, 2],
]
// Widened from a 3x3 after a real frame showed enemies reading as single
// specks: at this dot pitch a 3-wide sprite lands inside one or two cells
// and loses its shape entirely to the character grid.
const ENEMY = [
  [-1, -1], [0, -1], [1, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-1, 1], [0, 1], [1, 1],
]
const OPTION = [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]
// The capsule got its own pass after the first playtest -- "knowing they are
// capsules seemed hard to distinguish at first". The original was a hollow
// 3x3 box, which at this dot pitch lands inside one or two cells and is
// simply a small smudge, indistinguishable from an enemy or a bit of debris.
//
// Three cues now, because one was not enough and they are all free:
//   - SIZE and SHAPE: a 7x5 hollow shell, the only outlined thing on screen.
//     Everything else -- ship, enemies, options -- is solid.
//   - BRIGHTNESS: drawn in the player layer, not the hazard layer, so it is
//     the same tier as your own ship and a tier above the enemies. The one
//     thing on the field you WANT to touch reads as friendly.
//   - MOTION: the core blinks inside the shell. Nothing else on the field
//     blinks except a ship that is already dead, so it draws the eye.
const CAPSULE_SHELL = [
  [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  [-3, -1], [3, -1],
  [-3, 0], [3, 0],
  [-3, 1], [3, 1],
  [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2],
]
const CAPSULE_CORE = [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]
// A surface gun: a squat dome on a base, drawn mirrored for the ceiling.
// Wider than it is tall so it reads as bolted down rather than flying.
const TURRET = [
  [-1, -2], [0, -2], [1, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
]

/** Terrain profile at absolute dot column `c`, as [top, bottom] thicknesses.
 *
 *  Computed from the column index rather than kept in a buffer, the same
 *  trick OUTRUN's roadside uses: scrolling is then just an offset and there
 *  is no buffer to shift, seed or get out of step with the scroll position.
 *  Two incommensurable sines per side so the cave never visibly repeats. */
export function terrainAt(c, h) {
  // Base and amplitudes were raised after looking at a real rendered frame:
  // the first set (base 5, amps 7 and 5) left a two-row crust top and bottom
  // and thirteen empty rows between them, which is a border rather than a
  // cave. There is nothing to fly THROUGH in a corridor you cannot touch.
  let top = 11 + 9 * Math.sin(c * 0.019) + 7 * Math.sin(c * 0.0071 + 1.3)
  let bot = 11 + 9 * Math.sin(c * 0.015 + 2.4) + 7 * Math.sin(c * 0.0053 + 0.4)
  top = Math.max(1, top)
  bot = Math.max(1, bot)
  // Swept over two million columns, this pair of sines runs from a 74-dot
  // open sky down to a 23-dot squeeze -- a real passage for a 5-dot ship,
  // which is what makes the terrain something you fly rather than something
  // you stay away from.
  //
  // So the clamp below never fires TODAY, and is a backstop rather than
  // working code: a gap the ship cannot fit through is not difficulty, it
  // is a wall across the screen with no way past, and it would appear tens
  // of thousands of dots into a level where no play session would find it.
  // Anyone retuning the three constants above gets caught here rather than
  // in a bug report. Kept honest by the terrain test, which asserts the
  // guarantee over 200k columns and does not care which of the two
  // mechanisms provides it.
  const minGap = 20
  const gap = h - top - bot
  if (gap < minGap) {
    const cut = (minGap - gap) / 2
    top = Math.max(1, top - cut)
    bot = Math.max(1, bot - cut)
  }
  return [Math.round(top), Math.round(bot)]
}

export default {

  /** True while the game is up. Only ever true with visualizerActive also
   *  true -- it is a third view INSIDE the visualizer, alongside the effect
   *  canvas and the [L] lyrics view, not a fourth top-level overlay. That
   *  matters for the paint guards: the visualizer already owns the screen,
   *  so this inherits every guard it has instead of needing its own. */
  gameOpen: false,

  /** Arm the game. Refuses on the lite layout: it wants four arrow keys and
   *  a fire key held at once, which a touch screen has no way to offer, and
   *  a 42x22 grid is 84x76 dots -- half the playfield. The Konami code is
   *  unreachable there anyway (no arrow keys); this is the belt to that
   *  braces, so a future gesture cannot open a game that does not fit. */
  startGame(s) {
    if (this.mobile || !this.visualizerActive) return false
    const { term } = s
    const dc = () => new DotCanvas(term, term.cols, GAME_ROWS)
    const layers = { ground: dc(), hazard: dc(), player: dc() }
    const w = layers.player.w, h = layers.player.h
    this._game = {
      layers, w, h,
      ship: { x: Math.round(w * 0.18), y: Math.round(h / 2) },
      trail: Array.from({ length: TRAIL_LEN }, () => ({ x: Math.round(w * 0.18), y: Math.round(h / 2) })),
      trailAt: 0,
      scroll: 0,
      // Equal VISUAL speed in both axes. DotCanvas measures the dot's shape
      // off the loaded face rather than assuming it (see dotAspect), so
      // this rides the font instead of a hardcoded guess -- which is what
      // the first version got wrong: it claimed a dot was "roughly twice as
      // tall as it is wide" and slowed the vertical axis to 0.55 on that
      // basis. Measured, a dot in ter-u16n is 4.5px across and 4px down, so
      // the correction is 1/0.889 = ~1.125 -- vertical should be slightly
      // FASTER in dots than horizontal, not half speed. Climbing was about
      // 45% slower than it looked, which mattered little when the only
      // threat was terrain and matters a great deal now that things shoot.
      vAspect: 1 / layers.player.aspect,
      bullets: [], enemies: [], caps: [], parts: [],
      // Enemy fire and surface guns, both added 2026-08-30. Kept in their
      // own lists rather than tagged into `bullets`/`enemies`: everything
      // that hunts the player is checked against exactly one thing (the
      // ship) while everything of the player's is checked against many, so
      // sharing a list would mean filtering on every pass through both.
      ebullets: [], turrets: [],
      forms: new Map(),
      fid: 0,
      stage: 1,
      stageIn: STAGE_DOTS,
      stageFlash: 0,
      turretIn: 260,
      // Armament. Wiped wholesale on death -- see loseLife.
      spd: 0, missile: false, double: false, laser: false, opts: 0, shield: 0,
      meter: 0,
      score: 0, lives: START_LIVES,
      cool: 0, invuln: 150, waveIn: 90,
      over: false, overAt: 0,
      acc: 0, lastT: null, step: 0,
    }
    this.gameOpen = true
    this.lyricsViewOpen = false
    this._heldKeys?.clear()
    return true
  },

  /** Back to the effect canvas. Does NOT leave the visualizer: [E] acts on
   *  the view you are actually looking at, the same call the lyrics view's
   *  [V] case already makes. */
  stopGame(s) {
    if (!this.gameOpen) return false
    this.gameOpen = false
    this._game = null
    this._heldKeys?.clear()
    if (s) this.drawVisualizerInfo(s)
    return true
  },

  /** The game's own key handling, ahead of the visualizer's switch.
   *  Returns true when it consumed the key.
   *
   *  Deliberately narrow: it takes the arrows, the two fire keys, [ENTER]
   *  and the two exit keys, and lets everything else fall through to the
   *  visualizer underneath. [M] still mutes, [N] still skips the track,
   *  [T] still sets the sleep timer -- the radio does not stop being a
   *  radio because there is a game on the screen, and the track playing
   *  under the game is the station's, not the game's. */
  gameKey(s, e) {
    if (!this.gameOpen) return false
    const g = this._game
    switch (e.key) {
      case 'e': case 'E': case 'Escape':
        e.preventDefault()
        this.stopGame(s)
        return true
      case 'Enter':
        e.preventDefault()
        // Silent when the meter is empty, the same restraint [L] shows with
        // no lyrics: a key that cannot act should not feel like it broke.
        if (g && !g.over && g.meter > 0) this.gameSpendMeter()
        return true
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
      case ' ': case 'z': case 'Z':
        e.preventDefault()
        // Movement and fire are read from the held-key set every step, not
        // acted on here -- see gameHeld. Keydown only has to register the
        // key; auto-repeat would otherwise make movement stutter at the OS
        // repeat rate rather than run at the ship's own speed.
        return true
    }
    return false
  },

  /** Held-key test. Keyed on e.code where the event carries one (layout
   *  independent, and immune to the shift bug: hold Z, tap Shift, and the
   *  keyup arrives as 'Z' while 'z' is what went in), falling back to
   *  e.key for the harness, which sends no code. */
  gameHeld(...codes) {
    const held = this._heldKeys
    if (!held) return false
    return codes.some((c) => held.has(c))
  },

  gameSpendMeter() {
    const g = this._game
    const pick = POWERS[g.meter - 1]
    let took = true
    switch (pick) {
      case 'SPEED': took = g.spd < SPEEDS.length - 1; if (took) g.spd++; break
      case 'MISSILE': took = !g.missile; g.missile = true; break
      // DOUBLE and LASER are exclusive, as they are in the arcade: taking
      // one drops the other rather than stacking.
      case 'DOUBLE': took = !g.double; g.double = true; g.laser = false; break
      case 'LASER': took = !g.laser; g.laser = true; g.double = false; break
      case 'OPTION': took = g.opts < MAX_OPTIONS; if (took) g.opts++; break
      case '?': took = g.shield <= 0; if (took) g.shield = 2; break
    }
    // A refused spend keeps the capsule: the meter only resets when it
    // actually bought something, so hitting the cap on SPEED does not
    // silently eat the pickup.
    if (!took) return
    g.meter = 0
    playGamePowerUp()
  },

  // --- simulation -------------------------------------------------------

  gameStep(s) {
    const g = this._game
    const { w, h } = g
    g.step++
    g.scroll += 0.9
    if (g.invuln > 0) g.invuln--
    if (g.over) {
      // Reported 2026-08-30: "at game over some artifacts of enemies freeze
      // on screen". They did. The scroll above runs before this return, so
      // the ground kept moving while every enemy, shot and turret hung
      // motionless in mid-air on top of it -- the one combination that
      // reads as the game having crashed rather than ended.
      //
      // The field is emptied in gameLoseLife the moment it becomes over, so
      // there is nothing left to freeze. Debris is the exception and is
      // still stepped here: the last explosion finishing under GAME OVER is
      // the difference between a stop and an ending.
      for (const p of g.parts) { p.x += p.vx; p.y += p.vy; p.life-- }
      g.parts = g.parts.filter((p) => p.life > 0)
      return
    }

    // Ship. Held keys read here rather than in gameKey so movement runs at
    // the ship's speed and not the keyboard's repeat rate.
    const v = SPEEDS[g.spd]
    // See vAspect in startGame for why this is measured and not a constant.
    if (this.gameHeld('ArrowLeft')) g.ship.x -= v
    if (this.gameHeld('ArrowRight')) g.ship.x += v
    if (this.gameHeld('ArrowUp')) g.ship.y -= v * g.vAspect
    if (this.gameHeld('ArrowDown')) g.ship.y += v * g.vAspect
    g.ship.x = Math.max(4, Math.min(w - 5, g.ship.x))
    g.ship.y = Math.max(3, Math.min(h - 4, g.ship.y))

    g.trail[g.trailAt] = { x: g.ship.x, y: g.ship.y }
    g.trailAt = (g.trailAt + 1) % TRAIL_LEN

    // Fire. Gated by the on-screen cap as well as the cooldown -- see
    // SHOT_CAP. A capped shot does NOT consume the cooldown, so the gun
    // fires the instant a slot frees rather than on the next whole cycle.
    if (g.cool > 0) g.cool--
    if (g.cool === 0 && this.gameHeld('Space', 'KeyZ', ' ', 'z') && this.gameCanFire()) {
      this.gameFire(g.ship.x + 4, g.ship.y)
      for (const o of this.gameOptions()) this.gameFire(o.x + 2, o.y)
      g.cool = g.laser ? 11 : 8
      playGameShot()
    }

    // Waves. The ambient timer is the floor; a bass onset brings the next
    // one forward. That is the one thing this game does that only works
    // because it is inside a radio: the tap is looking at the station's
    // actual audio, so waves arrive on the track's actual beat. It cannot
    // REPLACE the timer -- a quiet passage, a declined capture or a muted
    // speaker all leave the tap null, and a game whose enemies stop
    // spawning in a quiet bar is broken, not atmospheric.
    const A = this._au
    if (g.waveIn > 0) g.waveIn--
    const beat = A && A.onset && A.bass > 0.5 && g.waveIn < 100 && g.enemies.length < 14
    if (g.waveIn === 0 || beat) {
      this.gameSpawnWave()
      g.waveIn = 150 + Math.floor(Math.random() * 90)
    }

    // Stage progress. Measured in scrolled dots so it advances with the
    // distance travelled and not with time spent hiding.
    if (g.stageFlash > 0) g.stageFlash--
    g.stageIn -= 0.9
    if (g.stageIn <= 0) {
      g.stage++
      g.stageIn = STAGE_DOTS
      g.stageFlash = 150
      g.score += 1000
      playGamePowerUp()
    }

    // Surface guns, spaced by distance for the same reason.
    g.turretIn -= 0.9
    if (g.turretIn <= 0) {
      this.gameSpawnTurret()
      g.turretIn = Math.max(90, 240 - g.stage * 22) + Math.random() * 160
    }

    this.gameStepBullets()
    this.gameStepEnemies()
    this.gameStepTurrets()
    this.gameStepEnemyBullets()
    this.gameStepPickups()

    for (const p of g.parts) { p.x += p.vx; p.y += p.vy; p.life-- }
    g.parts = g.parts.filter((p) => p.life > 0)

    // Terrain kills last, so a frame that already killed you by collision
    // cannot kill you twice.
    if (g.invuln <= 0) {
      const [top, bot] = terrainAt(Math.round(g.scroll + g.ship.x), h)
      if (g.ship.y - 2 < top || g.ship.y + 2 > h - 1 - bot) this.gameLoseLife()
    }
  },

  /** Is there a free slot on screen? See SHOT_CAP.
   *
   *  Counts the forward weapon only -- missiles have their own pool, and
   *  are checked separately inside gameFire so a full missile pool cannot
   *  block the gun (or the reverse). */
  gameCanFire() {
    const g = this._game
    const cap = g.laser
      ? LASER_CAP + LASER_CAP_PER_OPT * g.opts
      : SHOT_CAP + SHOT_CAP_PER_OPT * g.opts
    let live = 0
    for (const b of g.bullets) if (b.kind !== 'm') live++
    return live < cap
  },

  gameFire(x, y) {
    const g = this._game
    if (g.laser) {
      g.bullets.push({ x, y, vx: 5.2, vy: 0, kind: 'l' })
    } else {
      g.bullets.push({ x, y, vx: 3.4, vy: 0, kind: 'b' })
      if (g.double) g.bullets.push({ x, y, vx: 2.5, vy: -1.3, kind: 'b' })
    }
    // The missile is the ground-attack weapon: it falls until it meets the
    // floor and then runs along it, which is what makes it worth a slot on
    // a map with terrain rather than being a second forward gun.
    if (g.missile) {
      let live = 0
      for (const b of g.bullets) if (b.kind === 'm') live++
      if (live < MISSILE_CAP + MISSILE_CAP_PER_OPT * g.opts) {
        g.bullets.push({ x, y, vx: 1.7, vy: 1.5, kind: 'm' })
      }
    }
  },

  /** Where the options are right now: the ship's own past positions. */
  gameOptions() {
    const g = this._game
    const out = []
    for (let i = 0; i < g.opts; i++) {
      const back = (i + 1) * OPTION_LAG
      out.push(g.trail[(g.trailAt - back + TRAIL_LEN * 2) % TRAIL_LEN])
    }
    return out
  },

  gameStepBullets() {
    const g = this._game
    const { w, h } = g
    for (const b of g.bullets) {
      b.x += b.vx
      b.y += b.vy
      if (b.kind === 'm') {
        const [, bot] = terrainAt(Math.round(g.scroll + b.x), h)
        const floor = h - 1 - bot
        // Landed: stop falling and crawl. Re-checked every step, so it
        // follows the floor back up a rising slope instead of burrowing.
        if (b.y >= floor) { b.y = floor - 1; b.vy = 0; b.vx = 2.6 }
        else b.vy = Math.min(2.2, b.vy + 0.16)
      }
    }
    g.bullets = g.bullets.filter((b) => {
      if (b.x > w + 16 || b.x < -16 || b.y < 0 || b.y > h) return false
      // Bullets stop at scenery; the missile is exempt, since running along
      // the floor means being inside the terrain's top dot by design.
      if (b.kind !== 'm') {
        const [top, bot] = terrainAt(Math.round(g.scroll + b.x), h)
        if (b.y < top || b.y > h - 1 - bot) return false
      }
      return true
    })
  },

  gameStepEnemies() {
    const g = this._game
    const { w, h } = g
    for (const en of g.enemies) {
      en.x -= en.vx
      en.y = en.baseY + en.amp * Math.sin(en.x * 0.055 + en.phase)
      // Shooting back (2026-08-30). Until this, the only threat in the game
      // was collision -- with terrain or with an enemy's body -- which is a
      // single idea the player solves once and then never thinks about
      // again. That is the actual reason it played easy, far more than
      // enemy health or hitbox size, and it is why neither of those was
      // touched: more health makes a game grindier, not harder.
      //
      // Only fires while fully on screen, so nothing can shoot you from
      // inside the right-hand margin where it cannot be seen or answered.
      // Must be on screen AND far enough ahead to be answerable -- see
      // MIN_FIRE_RANGE. Holding fire rather than resetting the interval, so
      // closing to point-blank buys an enemy nothing.
      if (!en.shooter || en.x > w - 4 || en.x - g.ship.x < MIN_FIRE_RANGE) continue
      if (en.tel > 0) {
        // Telegraphed. The wind-up draws the line the shot will travel (see
        // gameDrawHazards), which is what makes an aimed shot fair: you are
        // told where it is going before it goes there.
        if (--en.tel === 0) this.gameEnemyFire(en.x - 3, en.y, 1.25)
      } else if (--en.shootIn <= 0) {
        en.tel = 24
        en.aimX = g.ship.x
        en.aimY = g.ship.y
        en.shootIn = this.gameFireInterval()
      }
    }
    const survivors = []
    for (const en of g.enemies) {
      let dead = false
      for (const b of g.bullets) {
        // Generous boxes on purpose. These are 3-dot-wide sprites moving a
        // couple of dots a step; a tight test reads as shots passing
        // through enemies, which is the single most common way a shooter
        // at this resolution feels broken.
        const rx = b.kind === 'l' ? 8 : 3
        if (Math.abs(b.x - en.x) < rx && Math.abs(b.y - en.y) < 3) {
          dead = true
          // The laser is a beam: it keeps going through what it kills.
          if (b.kind !== 'l') b.x = -999
          break
        }
      }
      if (dead) {
        g.score += 100
        this.gameBurst(en.x, en.y, 7)
        playGameHit(false)
        this.gameFormationKill(en.fid, en.x, en.y, 'killed')
        continue
      }
      if (en.x < -6) { this.gameFormationKill(en.fid, en.x, en.y, 'escaped'); continue }
      // Collision with the ship.
      if (g.invuln <= 0 && Math.abs(en.x - g.ship.x) < 4 && Math.abs(en.y - g.ship.y) < 3) {
        this.gameBurst(en.x, en.y, 7)
        this.gameFormationKill(en.fid, en.x, en.y, 'escaped')
        this.gameLoseLife()
        continue
      }
      survivors.push(en)
    }
    g.enemies = survivors
  },

  /** The capsule rule, and the reason formations are tracked at all: in
   *  Gradius a power capsule is not a random drop, it is the reward for
   *  clearing a WHOLE formation. Let one through and you get nothing. That
   *  single rule is what turns the meter from a slot machine into the thing
   *  you are actually playing for. */
  gameFormationKill(fid, x, y, how) {
    const g = this._game
    const f = g.forms.get(fid)
    if (!f) return
    f[how]++
    if (f.killed + f.escaped >= f.total) {
      // Drifts left at well under half the ship's slowest speed, so it is
      // always catchable even with no SPEED upgrades and something else
      // demanding attention. Being generous here is right: the capsule is
      // already the reward for the hardest thing in the game (clearing a
      // whole formation), and making you win it twice is just mean.
      if (f.killed === f.total) g.caps.push({ x, y, vx: 0.28 })
      g.forms.delete(fid)
    }
  },

  gameSpawnWave() {
    const g = this._game
    const { w, h } = g
    const fid = ++g.fid
    const n = 4 + Math.floor(Math.random() * 3)
    // Spawn inside the channel the terrain will actually have when the
    // formation arrives, not the one under the right-hand edge now.
    const [top, bot] = terrainAt(Math.round(g.scroll + w * 1.4), h)
    const lo = top + 8, hi = h - 1 - bot - 8
    const amp = 5 + Math.random() * 5
    const baseY = Math.max(lo + amp, Math.min(hi - amp, lo + Math.random() * Math.max(1, hi - lo)))
    const phase = Math.random() * Math.PI * 2
    const vx = 0.8 + Math.random() * 0.5
    // Only some of a formation shoots, and that is a volume control, not a
    // detail. With every member armed, a full screen of fourteen enemies
    // firing every few seconds puts a shot in the air roughly three times a
    // second -- measured against a bot that flies the channel perfectly and
    // does nothing else, that took survival from "indefinite" to 24
    // seconds, which is not difficulty, it is a curtain. Most enemies being
    // fodder is also how the arcade does it, and it gives a formation
    // internal shape: there is a right one to kill first.
    const shooters = new Set()
    const nShoot = Math.max(1, Math.round(n * 0.4))
    while (shooters.size < nShoot) shooters.add(Math.floor(Math.random() * n))
    for (let i = 0; i < n; i++) {
      g.enemies.push({
        x: w + 6 + i * 9, baseY, y: baseY, amp, phase, vx, fid,
        shooter: shooters.has(i),
        // Staggered per member, so a formation arrives as a rolling threat
        // rather than a single volley you either eat or don't.
        shootIn: this.gameFireInterval() + i * 24, tel: 0, aimX: 0, aimY: 0,
      })
    }
    g.forms.set(fid, { total: n, killed: 0, escaped: 0 })
  },

  /** Steps between one enemy's shots. Tightens with the stage, which is the
   *  only difficulty ramp in the game until rank lands -- and the gentlest
   *  one available, since it adds pressure without making anything tougher
   *  to kill or harder to see. */
  gameFireInterval() {
    const g = this._game
    const ramp = Math.max(0.42, 1 - (g.stage - 1) * 0.13)
    return Math.round((260 + Math.random() * 280) * ramp)
  },

  /** An aimed shot, from an enemy or a surface gun. Aimed at where the ship
   *  WAS when the wind-up started (en.aimX/aimY), not where it is now:
   *  a shot that re-aims at the moment of firing is unavoidable by moving,
   *  which makes the telegraph a lie. */
  gameEnemyFire(x, y, speed, aimX, aimY) {
    const g = this._game
    if (g.ebullets.length >= EBULLET_CAP + EBULLET_CAP_PER_STAGE * (g.stage - 1)) return
    const tx = (aimX ?? g.ship.x) - x
    const ty = (aimY ?? g.ship.y) - y
    const d = Math.hypot(tx, ty) || 1
    g.ebullets.push({ x, y, vx: (tx / d) * speed, vy: (ty / d) * speed })
  },

  gameStepEnemyBullets() {
    const g = this._game
    const { w, h } = g
    const keep = []
    for (const b of g.ebullets) {
      b.x += b.vx
      b.y += b.vy
      if (b.x < -3 || b.x > w + 3 || b.y < -3 || b.y > h + 3) continue
      // Stopped by scenery, the same as the player's own shots. Without
      // this, a surface gun could fire straight through the hill it is
      // standing on.
      const [top, bot] = terrainAt(Math.round(g.scroll + b.x), h)
      if (b.y < top || b.y > h - 1 - bot) continue
      if (g.invuln <= 0 && Math.abs(b.x - g.ship.x) < 3.5 && Math.abs(b.y - g.ship.y) < 3) {
        this.gameLoseLife()
        continue
      }
      keep.push(b)
    }
    g.ebullets = keep
  },

  /** A gun bolted to the terrain surface.
   *
   *  Anchored to an ABSOLUTE terrain column rather than a screen position,
   *  so it rides the same scroll the ground does and sits on the surface
   *  exactly however that surface moves -- the alternative, a screen-space
   *  position with a per-step correction, drifts off the hillside the
   *  moment the profile changes under it.
   *
   *  These are also what makes MISSILE worth a slot. Before them there was
   *  nothing on the ground to shoot, so a sixth of the power meter was a
   *  trap choice -- a real hole in the economy, quite apart from difficulty. */
  gameSpawnTurret() {
    const g = this._game
    const { w, h } = g
    const col = Math.round(g.scroll + w + 8)
    const floor = Math.random() < 0.68
    g.turrets.push({
      col, floor,
      shootIn: 60 + Math.floor(Math.random() * 90), tel: 0, aimX: 0, aimY: 0,
    })
  },

  /** Where a turret is on screen right now, given the scroll. */
  gameTurretPos(t) {
    const g = this._game
    const { h } = g
    const [top, bot] = terrainAt(t.col, h)
    return { x: t.col - g.scroll, y: t.floor ? h - 1 - bot - 2 : top + 2 }
  },

  gameStepTurrets() {
    const g = this._game
    const { w } = g
    const keep = []
    for (const t of g.turrets) {
      const p = this.gameTurretPos(t)
      if (p.x < -6) continue
      // Same range rule as the flyers. A turret the ship is already on top
      // of firing straight up is the same unanswerable shot.
      if (p.x < w - 2 && Math.hypot(p.x - g.ship.x, p.y - g.ship.y) > MIN_FIRE_RANGE * 0.8) {
        if (t.tel > 0) {
          if (--t.tel === 0) this.gameEnemyFire(p.x, p.y + (t.floor ? -3 : 3), 1.25, t.aimX, t.aimY)
        } else if (--t.shootIn <= 0) {
          t.tel = 26
          t.aimX = g.ship.x
          t.aimY = g.ship.y
          t.shootIn = this.gameFireInterval()
        }
      }
      // Shot down by anything, missiles included -- the missile runs along
      // the floor precisely so it can reach these.
      let hit = false
      for (const b of g.bullets) {
        const rx = b.kind === 'l' ? 8 : 3.5
        if (Math.abs(b.x - p.x) < rx && Math.abs(b.y - p.y) < 3.5) {
          hit = true
          if (b.kind !== 'l') b.x = -999
          break
        }
      }
      if (hit) {
        g.score += 150
        this.gameBurst(p.x, p.y, 9)
        playGameHit(false)
        continue
      }
      if (g.invuln <= 0 && Math.abs(p.x - g.ship.x) < 4 && Math.abs(p.y - g.ship.y) < 3) {
        this.gameBurst(p.x, p.y, 9)
        this.gameLoseLife()
        continue
      }
      keep.push(t)
    }
    g.turrets = keep
  },

  gameStepPickups() {
    const g = this._game
    const { h } = g
    const keep = []
    for (const c of g.caps) {
      c.x -= c.vx
      // 2026-08-30, after the first playtest: "capsules drop too quick to
      // get". They used to fall at 0.35 dots a step and settle on the floor,
      // which was wrong twice over. It put the reward on the ONE surface in
      // the game that kills you on contact, so collecting your winnings from
      // clearing a formation meant a dive into the terrain -- and it gave
      // you about two seconds to decide before it got there.
      //
      // They now hang at the height the formation died at and drift left,
      // which is both fair and what the arcade actually does: a Gradius
      // capsule has no gravity. The clamp keeps one inside the channel when
      // the terrain scrolls up underneath it, so a capsule can never be
      // swallowed by the ground it is no longer falling towards.
      const [top, bot] = terrainAt(Math.round(g.scroll + c.x), h)
      c.y = Math.max(top + 3, Math.min(c.y, h - 1 - bot - 3))
      if (c.x < -4) continue
      // Widened with the sprite: the shell is 7x5 dots now, and a hitbox
      // tighter than the thing you can see reads as the pickup not working.
      if (Math.abs(c.x - g.ship.x) < 8 && Math.abs(c.y - g.ship.y) < 6) {
        g.meter = (g.meter % POWERS.length) + 1
        playGameCapsule()
        continue
      }
      keep.push(c)
    }
    g.caps = keep
  },

  gameBurst(x, y, n) {
    const g = this._game
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.4 + Math.random() * 1.1
      g.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: 10 + Math.floor(Math.random() * 12) })
    }
  },

  gameLoseLife() {
    const g = this._game
    // The shield eats the hit and nothing else changes -- that is what the
    // '?' slot buys.
    if (g.shield > 0) {
      g.shield--
      g.invuln = 40
      this.gameBurst(g.ship.x, g.ship.y, 10)
      playGameHit(false)
      return
    }
    this.gameBurst(g.ship.x, g.ship.y, 22)
    playGameHit(true)
    g.lives--
    // Everything goes. This is the arcade's actual rule and it is the
    // reason the meter has any weight: a death that cost you nothing but a
    // life would make the whole left-to-right power economy decorative.
    g.spd = 0; g.missile = false; g.double = false; g.laser = false
    g.opts = 0; g.shield = 0; g.meter = 0
    g.bullets = []
    // Incoming fire is cleared too. Respawning into a screen full of shots
    // that were aimed at where you died is a death you cannot answer, and
    // the invulnerability window is not long enough to fly out of it.
    g.ebullets = []
    if (g.lives < 0) {
      g.over = true
      g.overAt = Date.now()
      // Clear the field. Nothing is stepped once the game is over (see
      // gameStep), so anything left in these lists would sit frozen on a
      // still-scrolling background until the view hands itself back.
      // Particles are deliberately kept: they are the explosion that just
      // happened, and they still run.
      g.enemies = []
      g.ebullets = []
      g.turrets = []
      g.caps = []
      g.forms.clear()
      return
    }
    const { w, h } = g
    g.ship.x = Math.round(w * 0.18)
    g.ship.y = Math.round(h / 2)
    for (let i = 0; i < TRAIL_LEN; i++) g.trail[i] = { x: g.ship.x, y: g.ship.y }
    g.invuln = 150
  },

  // --- drawing ----------------------------------------------------------

  /** Called from drawVisualizerFrame in place of the effect. Same contract
   *  every visuals/<key>.js has: repaint rows 1..VIZ_BOT-1 in full, every
   *  frame, so the footer's writes into those rows stay safe. */
  drawGameFrame(s, t) {
    const g = this._game
    if (!g) { this.gameOpen = false; return }
    const { term } = s

    // Fixed-step catch-up. See STEP.
    if (g.lastT === null) g.lastT = t
    const dt = Math.min(MAX_DT, Math.max(0, t - g.lastT))
    g.lastT = t
    g.acc += dt
    let steps = 0
    while (g.acc >= STEP && steps < MAX_STEPS) { g.acc -= STEP; this.gameStep(s); steps++ }
    if (g.acc > STEP * MAX_STEPS) g.acc = 0

    if (g.over && Date.now() - g.overAt > 5200) { this.stopGame(s); return }

    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')

    const { ground, hazard, player } = g.layers
    ground.clear(); hazard.clear(); player.clear()
    this.gameDrawTerrain(ground)
    this.gameDrawHazards(hazard)
    this.gameDrawPlayer(player)
    // Blit order IS the layering: later layers win a contested cell. See
    // the note at the top of this file.
    ground.blit(term, DIM, 0, GAME_TOP)
    hazard.blit(term, NORMAL, 0, GAME_TOP)
    player.blit(term, BRIGHT, 0, GAME_TOP)

    this.gameDrawHud(s)
    this.gameDrawMeter(s)
    if (g.over) this.gameDrawOver(s)
  },

  gameDrawTerrain(dc) {
    const g = this._game
    const { h } = g
    for (let x = 0; x < dc.w; x++) {
      const c = Math.round(g.scroll) + x
      const [top, bot] = terrainAt(c, h)
      // A solid fill would be a slab of fully-lit cells -- a lot of lit area
      // for the bloom shader, and the visualizer footer's own note is about
      // exactly that eating legibility. Two dots of solid crust reads as a
      // surface; scattered fill behind it reads as rock without the bloom.
      //
      // The scatter is hash2 and NOT a modular lattice. The first version
      // was `(c * 7 + y * 13) % 3 === 0`, which is cheaper and looks fine
      // reasoned about on paper; rendered, it is a regular diagonal, and a
      // regular diagonal repeated over a whole cliff face is a moire, not
      // rock. Worth the sin() -- and worth looking at a real frame before
      // believing any texture, which is how this was caught.
      // Three things had to be true at once here, and the first two attempts
      // each got one and lost another. Written down because the reasoning is
      // not recoverable from the arithmetic:
      //
      //   - NOT a modular lattice (`(c * 7 + y * 13) % 3`, attempt one).
      //     Cheap, and rendered as a regular diagonal moire across the whole
      //     cliff.
      //   - NOT per-dot noise (uniform hash2, attempt two). A lone lit dot
      //     is one pixel in eight of a Braille cell, and a field of them is
      //     indistinguishable from television static -- which is the exact
      //     thing this app draws for NO SIGNAL. The terrain must never read
      //     as the noise floor.
      //   - The fill has to survive being THICK. The ceiling runs to ~23
      //     dots at its deepest, so whatever the deep fill looks like, it
      //     looks like that over a sixth of the screen.
      //
      // So: a solid lit crust at the surface, and behind it a hash sampled
      // per 2x2 dot block rather than per dot, which lands in clumps of four
      // and reads as rubble. The floor under the depth fade is what stops it
      // thinning back out into single dots at the deep end.
      for (let y = 0; y < top; y++) {
        const depth = top - y
        if (depth <= 3 || hash2(c >> 1, y >> 1) < Math.max(0.2, 0.5 - depth * 0.02)) dc.plot(x, y)
      }
      for (let y = h - bot; y < h; y++) {
        const depth = y - (h - bot) + 1
        if (depth <= 3 || hash2(c >> 1, y >> 1) < Math.max(0.2, 0.5 - depth * 0.02)) dc.plot(x, y)
      }
    }
  },

  gameDrawHazards(dc) {
    const g = this._game
    for (const en of g.enemies) {
      for (const [dx, dy] of ENEMY) dc.plot(en.x + dx, en.y + dy)
      // The wind-up, drawn as the line the shot is about to travel. This is
      // the whole of what makes aimed fire fair rather than a gotcha: you
      // are shown the path before anything is on it, and the shot commits
      // to where you WERE, so moving off the line actually works.
      if (en.tel > 0) this.gameDrawAim(dc, en.x - 3, en.y, en.aimX, en.aimY, en.tel)
    }
    for (const t of g.turrets) {
      const p = this.gameTurretPos(t)
      for (const [dx, dy] of TURRET) dc.plot(p.x + dx, p.y + (t.floor ? dy : -dy))
      if (t.tel > 0) this.gameDrawAim(dc, p.x, p.y + (t.floor ? -3 : 3), t.aimX, t.aimY, t.tel)
    }
    // Enemy fire sits in the hazard layer with everything else that can
    // kill you, while the player's own shots are a brightness tier above in
    // gameDrawPlayer. That tiering was built for the capsule and pays for
    // itself again here: incoming and outgoing fire are told apart by the
    // same rule, with no new colour and no new shape to learn.
    for (const b of g.ebullets) {
      dc.plot(b.x, b.y)
      dc.plot(b.x - Math.sign(b.vx), b.y)
    }
    for (const p of g.parts) dc.plot(p.x, p.y)
    // Capsules are NOT drawn here -- see gameDrawPlayer and CAPSULE_SHELL.
  },

  /** The wind-up line, drawn from the muzzle toward where the shot will go.
   *  It grows as the telegraph runs down, so the closer it is to firing the
   *  further the line reaches -- a countdown you read at a glance rather
   *  than a flash you either catch or miss. */
  gameDrawAim(dc, x, y, aimX, aimY, tel) {
    const dx = aimX - x, dy = aimY - y
    const d = Math.hypot(dx, dy) || 1
    const reach = 6 + (26 - tel) * 1.1
    // Dashed, so it never reads as a beam that is already firing.
    for (let i = 3; i < reach; i += 3) dc.plot(x + (dx / d) * i, y + (dy / d) * i)
  },

  gameDrawPlayer(dc) {
    const g = this._game
    for (const b of g.bullets) {
      if (b.kind === 'l') dc.line(b.x - 7, b.y, b.x + 7, b.y)
      else { dc.plot(b.x, b.y); dc.plot(b.x + 1, b.y) }
    }
    for (const o of this.gameOptions()) for (const [dx, dy] of OPTION) dc.plot(o.x + dx, o.y + dy)
    // Capsules ride in the bright layer with the player's own kit. See
    // CAPSULE_SHELL for why all three of size, brightness and blink.
    for (const c of g.caps) {
      for (const [dx, dy] of CAPSULE_SHELL) dc.plot(c.x + dx, c.y + dy)
      if ((g.step >> 4) % 2 === 0) for (const [dx, dy] of CAPSULE_CORE) dc.plot(c.x + dx, c.y + dy)
    }
    // Blink through invulnerability rather than drawing nothing: a ship you
    // cannot see is a ship you fly into a wall.
    if (g.over) return
    if (g.invuln > 0 && (g.step >> 2) % 2 === 0) return
    for (const [dx, dy] of SHIP) dc.plot(g.ship.x + dx, g.ship.y + dy)
    if (g.shield > 0) {
      for (let a = 0; a < 10; a++) {
        const th = (a / 10) * Math.PI * 2
        dc.plot(g.ship.x + Math.cos(th) * 7, g.ship.y + Math.sin(th) * 4)
      }
    }
  },

  /** Score, stage, ships.
   *
   *  The stage half is here because "I don't see how the level ends" was
   *  the most damning thing in the first round of feedback -- and the
   *  honest answer was that it didn't, and that nothing on screen even
   *  suggested progress was a concept. A number and a bar are not an
   *  ending, but they turn an endless scroll into somewhere you are
   *  travelling through, which is most of what was actually missing. */
  gameDrawHud(s) {
    const { term } = s
    const g = this._game
    term.text(1, HUD_Y, `SCORE ${String(g.score).padStart(7, '0')}`, MUTED)

    const bars = 14
    const done = Math.max(0, Math.min(bars, Math.round((1 - g.stageIn / STAGE_DOTS) * bars)))
    const bar = `STAGE ${g.stage} [${'█'.repeat(done)}${'·'.repeat(bars - done)}]`
    const bx = Math.max(0, Math.floor((term.cols - bar.length) / 2))
    // Brightens for the flash after a rollover, then settles back. The one
    // moment the readout is worth looking at is the moment it changes.
    term.text(bx, HUD_Y, bar, g.stageFlash > 0 ? (BRIGHT | BOLD) : MUTED)

    const right = `SHIPS ${Math.max(0, g.lives)}   [E] EXIT`
    term.text(term.cols - 1 - right.length, HUD_Y, right, MUTED)
  },

  /** The power meter -- the reason this game and not another one.
   *
   *  Everything else here fights the medium: a ship, terrain and bullets all
   *  want a framebuffer and get a grid of Braille approximating one. The
   *  meter is the opposite. It is six labelled boxes with a cursor on one of
   *  them, which is a TEXT widget, and it renders here exactly as well as it
   *  ever did in an arcade cabinet -- better, since these are real glyphs and
   *  not a bitmap font stretched over a CRT. */
  gameDrawMeter(s) {
    const { term } = s
    const g = this._game
    const owned = [g.spd > 0, g.missile, g.double, g.laser, g.opts > 0, g.shield > 0]
    const segs = POWERS.map((p) => ` ${p} `)
    const width = segs.reduce((n, seg) => n + seg.length + 1, -1)
    const x0 = Math.max(0, Math.floor((term.cols - width) / 2))
    let x = x0
    for (const [i, seg] of segs.entries()) {
      const armed = g.meter === i + 1
      // Armed wins over owned: the cursor is the thing you are deciding
      // about, and it has to be findable at a glance while the screen is
      // moving.
      const attr = armed ? (BRIGHT | BOLD) : owned[i] ? NORMAL : FAINT
      term.text(x, METER_Y, seg, attr, armed ? 1 : 0)
      x += seg.length + 1
    }
    if (g.meter > 0 && !g.over) {
      const hint = '[ENTER]'
      term.text(Math.max(0, x0 - hint.length - 2), METER_Y, hint, MUTED)
    }
  },

  gameDrawOver(s) {
    const { term } = s
    const g = this._game
    const mid = GAME_TOP + Math.floor(GAME_ROWS / 2)
    const lines = [['GAME OVER', BRIGHT | BOLD], [`SCORE ${String(g.score).padStart(7, '0')}`, NORMAL]]
    for (const [i, [text, attr]] of lines.entries()) {
      const x = centerX(term.cols, text)
      for (let k = -1; k <= text.length; k++) term.put(x + k, mid + i * 2, ' ')
      term.text(x, mid + i * 2, text, attr)
    }
  },
}
