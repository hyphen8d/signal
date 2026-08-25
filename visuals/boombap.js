// SIGNAL -- visualizer effect "BOOM BAP". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, BRIGHT, DIM, FAINT, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// The MPC step-sequencer constants (BOOMBAP_STEPS/PATTERN/BPM) and the
// Scratch Flash state (_scratchFlashes) that the 57th-pass rewrites left
// behind were never read again; dropped in the 2026-08-25 audit.

export default {
  key: 'boombap',
  label: 'BOOM BAP',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // 57th pass, 4th rewrite -- BOOM BAP rebuilt around "boombox with sound
    // waves, pulsing lights, and meters," dropping the MPC
    // pad-sequencer concept entirely -- see drawBoomBapEffect. Speaker/
    // sound-wave rings stay (`_boomWaves`); the old step-sequencer state
    // (_boomLastStep, _boomPadFlashAt, _boomLivePat, _boomBeatCount,
    // _boomPrevPhase) is gone, along with the pad grid it drove. The EQ
    // bars are repurposed as a continuous VU-style meter bank -- springs
    // toward the live band value every frame instead of jumping once per
    // sequencer step -- and a new LED strip pulses with the beat.
    p._boomWaves = []
    p._boomEq = Array.from({ length: 22 }, () => ({ level: 0, target: 0 }))
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // Stale waves carry startT values that `t - startT > 1.3` can't expire
    // until the (restarted) effect clock climbs back past them.
    p._boomWaves = []
  },
  // 65th pass -- SKYLINE (the growing-towers effect built off
  // makeSkylineTowers()) and STACK (the 19-bar full-width equalizer
  // effect) permanently removed. See the 65th-pass note above
  // VISUAL_METHODS for why.
  // 57th pass, 4th rewrite -- BOOM BAP rebuilt from scratch around exactly
  // the design brief: a boom box with sound waves coming out of it
  // and pulsing lights and meters to the music. Dropped the MPC
  // pad-sequencer entirely (it was the extra idea nobody asked for, and
  // likely a chunk of what read as cluttered/"broken" -- a background
  // step-learning system floating above the box that most viewers never
  // parse as anything). Also dropped the busy ambient dust scatter that
  // used to fill dead space -- the box itself is now the whole picture.
  // Three reactive layers, all continuous (spring-toward-target every
  // frame, no per-step jumps): sound-wave rings off the speaker, a pulsing
  // LED strip, and a VU-style meter bank. No tap: everything settles to a
  // low idle read (slow heartbeat ring, single chasing LED, quiet meters)
  // rather than either "dead" or "running the old canned pattern" -- same
  // "always there, different metered level" language as CIRCUIT CRUSH/
  // ATOMIC this pass.
  draw(p, s, t) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const cx = term.cols / 2
    const speakerY = VIZ_BOT - 7
    const A = p._au

    // --- sound waves --------------------------------------------------
    // Live: a real onset fires a ring sized by the bass under it. Idle: a
    // slow ~1.6s heartbeat ring at low strength so the box is never fully
    // still, just quiet.
    {
      const lastW = p._boomWaves.length ? p._boomWaves[p._boomWaves.length - 1].startT : -99
      if (A) {
        if (A.onset && t - lastW > 0.1) {
          p._boomWaves.push({ startT: t, strength: 0.55 + 0.45 * Math.min(1, A.bass * 1.4) })
          if (p._boomWaves.length > 8) p._boomWaves.shift()
        }
      } else if (t - lastW > 1.6) {
        p._boomWaves.push({ startT: t, strength: 0.4 })
      }
    }
    for (let i = p._boomWaves.length - 1; i >= 0; i--) {
      if (t - p._boomWaves[i].startT > 1.3) p._boomWaves.splice(i, 1)
    }
    // Crisp expanding rings -- a tight band (1.1 wide, single character)
    // rather than a soft gradient, so a hit reads as a distinct arc.
    for (let y = 1; y < speakerY; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = 0
        for (const w of p._boomWaves) {
          const age = t - w.startT
          const dx = x - cx, dy = (y - speakerY) * 1.6
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = age * 26
          const ringDist = Math.abs(dist - radius)
          if (ringDist < 1.1) v = Math.max(v, (1 - ringDist / 1.1) * (1 - age / 1.3) * w.strength)
        }
        if (v < 0.12) continue
        const ch = v > 0.7 ? ')' : v > 0.4 ? ':' : '.'
        term.put(x, y, ch, visualizerLevelAttr(Math.min(1, v)))
      }
    }

    // --- the cabinet -----------------------------------------------------
    const lastHit = p._boomWaves.length ? p._boomWaves[p._boomWaves.length - 1].startT : -99
    const flash = Math.max(0, 1 - (t - lastHit) / 0.15)
    const width = 24
    const left = Math.round(cx) - width / 2
    const top = speakerY - 4, bottom = speakerY + 2
    for (let x = left + 8; x <= left + width - 8; x++) term.put(x, top - 1, '_', DIM)
    term.put(left + 8, top, '|', DIM)
    term.put(left + width - 8, top, '|', DIM)
    for (let x = left; x <= left + width; x++) {
      term.put(x, top, '─', DIM)
      term.put(x, bottom, '─', DIM)
    }
    for (let y = top; y <= bottom; y++) {
      term.put(left, y, '│', DIM)
      term.put(left + width, y, '│', DIM)
    }
    term.put(left, top, '┌', DIM)
    term.put(left + width, top, '┐', DIM)
    term.put(left, bottom, '└', DIM)
    term.put(left + width, bottom, '┘', DIM)

    // --- meters: VU-style bar bank, top interior row ---------------------
    // Springs toward the live band value every frame -- bass/mid/treble
    // zones left-to-right -- instead of jumping once per sequencer step.
    // Idle: a slow, quiet breathing level per bar so the deck reads as
    // "on, listening" rather than off.
    const eqY = top + 1
    const eqLeft = left + 2
    const eqCount = Math.min(p._boomEq.length, width - 4)
    for (let bi = 0; bi < eqCount; bi++) {
      const bar = p._boomEq[bi]
      if (A) {
        const fr = bi / (eqCount - 1)
        bar.target = Math.min(1, 0.08 + 0.92 * (fr < 0.33 ? A.bass : fr < 0.67 ? A.mid : A.treble))
      } else {
        bar.target = 0.08 + 0.05 * Math.sin(t * 0.7 + bi * 0.4)
      }
      bar.level += (bar.target - bar.level) * 0.25
      const lvl = bar.level
      const ch = lvl > 0.66 ? '█' : lvl > 0.33 ? '▄' : '_'
      term.put(eqLeft + bi, eqY, ch, visualizerLevelAttr(0.4 + lvl * 0.5))
    }

    // --- pulsing LED strip, second interior row ---------------------------
    // Spaced round lights, not a solid bar -- a classic level ladder: more
    // lights fill in as A.level rises, the hot end (last quarter) reads
    // brighter baseline, and a real hit flashes every lit LED BRIGHT for
    // an instant (reusing `flash`, the same decay the drivers use below,
    // so the whole box visibly pulses together on a hit). Idle: one light
    // slowly chasing back and forth, like a standby indicator.
    const ledY = top + 2
    const ledSpan = width - 4
    const ledCount = Math.floor(ledSpan / 2) + 1
    for (let i = 0; i < ledCount; i++) {
      const x = eqLeft + i * 2
      if (x > left + width - 2) break
      const frac = ledCount > 1 ? i / (ledCount - 1) : 0
      let lit, hot
      if (A) {
        lit = A.level > frac * 0.92
        hot = frac > 0.75
      } else {
        const pos = ((Math.sin(t * 0.5) + 1) / 2) * (ledCount - 1)
        lit = Math.abs(i - pos) < 0.7
        hot = false
      }
      const ch = lit ? '●' : '○'
      const attr = !lit ? FAINT : (flash > 0.5 ? BOLD : hot ? BRIGHT : NORMAL)
      term.put(x, ledY, ch, attr)
    }

    // --- twin drivers, concentric rings flashing together on hits --------
    const cyr = speakerY - 1
    for (const dxOff of [-7, 7]) {
      const dxr = Math.round(cx) + dxOff
      term.put(dxr, cyr, flash > 0.5 ? '█' : '▓', visualizerLevelAttr(Math.max(0.5, flash)))
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2
        term.put(Math.round(dxr + Math.cos(ang) * 2), Math.round(cyr + Math.sin(ang) * 1), 'o', visualizerLevelAttr(0.45 + flash * 0.35))
      }
    }

    // --- sidewalk in front of the cabinet, for depth ----------------------
    const vanishX = Math.round(cx)
    for (let y = bottom + 1; y < VIZ_BOT; y++) {
      const depth = y - bottom
      const halfW = Math.min(vanishX, 3 + depth * 3)
      const lo = vanishX - halfW, hi = vanishX + halfW
      const seam = depth % 3 === 0
      const edgeAttr = visualizerLevelAttr(Math.max(0.15, 0.2 + depth * 0.05))
      for (let x = lo; x <= hi; x++) {
        if (x < 0 || x >= term.cols) continue
        if (x === lo) term.put(x, y, '\\', edgeAttr)
        else if (x === hi) term.put(x, y, '/', edgeAttr)
        else if (seam) term.put(x, y, '-', FAINT)
        else term.put(x, y, '.', FAINT)
      }
    }
  },
}
