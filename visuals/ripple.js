// SIGNAL -- visualizer effect "RIPPLE". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// RIPPLE (45th pass, CITY LIGHTS) -- rain rings on a Tokyo night, ring
// bands expanding from fixed drop points, respawning on a stagger once
// each fully fades.
// 45th pass: slots bumped 7 -> 11 (live QA: "don't understand or see much
// on ... 6" -- too few drops meant long stretches with nothing happening).
export const RIPPLE_SLOTS = 11
export const RIPPLE_MAXAGE = 3.2
export const RIPPLE_SPEED = 3.6

export default {
  key: 'ripple',
  label: 'RIPPLE',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // RIPPLE's rain-ring slots (45th pass, CITY LIGHTS) -- fixed drop
    // points, each respawning on a stagger once it's fully faded.
    p._ripples = Array.from({ length: RIPPLE_SLOTS }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 21,
      startT: -Math.random() * RIPPLE_MAXAGE,
    }))
  },
  // RIPPLE effect (45th pass) -- for CITY LIGHTS. Raindrops on a Tokyo
  // night: a handful of fixed drop points, each expanding a ring band
  // outward and fading over RIPPLE_MAXAGE seconds before respawning
  // elsewhere on a stagger, over a faint constant neon shimmer so the
  // frame never reads as fully empty between drops.
  draw(p, s, t) {
    const { term } = s
    const A = p._au
    for (const r of p._ripples) {
      if (t - r.startT > RIPPLE_MAXAGE) {
        r.x = Math.random() * term.cols
        r.y = 1 + Math.random() * 21
        r.startT = t + Math.random() * 0.6
        r.amp = 1
      }
    }
    // 2026-08-23 (live audio tap) -- rain falls with the groove: a real
    // beat drops a raindrop NOW, sized by the bass under it (heavy rain in
    // the chorus, drizzle in the verse). Only a ring already past half its
    // life is eligible to be conscripted, which is the throttle: busy
    // passages naturally deplete the pool, so density self-limits, and the
    // ambient staggered respawns above continue exactly as today.
    if (A && A.onset) {
      let oldest = null
      for (const r of p._ripples) {
        if (t - r.startT > RIPPLE_MAXAGE * 0.45 && (!oldest || r.startT < oldest.startT)) oldest = r
      }
      if (oldest) {
        oldest.x = Math.random() * term.cols
        oldest.y = 1 + Math.random() * 21
        oldest.startT = t
        oldest.amp = 1 + 0.4 * A.bass   // was 0.75 base -- could read DIMMER than an ambient ring
      }
    }
    // 57th pass, 3rd rewrite -- safety net added because puddles/ripples
    // didn't always seem to show. With 11 staggered slots there's no hard
    // guarantee at least one is currently young/bright -- bad luck in the
    // stagger could leave every ring past its fresh half at once, which
    // reads as "nothing happening" even though the system is technically
    // still running. Force a fresh ripple whenever that happens so the
    // screen is never more than half a ring's life away from a visible one.
    {
      let youngestAge = Infinity
      for (const r of p._ripples) {
        const age = t - r.startT
        if (age >= 0 && age < youngestAge) youngestAge = age
      }
      if (youngestAge > RIPPLE_MAXAGE * 0.5) {
        const r = p._ripples[Math.floor(Math.random() * p._ripples.length)]
        r.x = Math.random() * term.cols
        r.y = 1 + Math.random() * 21
        r.startT = t
        r.amp = 1
      }
    }
    // Neon floor glitters with the highs -- treble only, gentle range.
    const glitter = auMul(A, A ? A.treble : 0, 0.75, 1.25)
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = 0
        for (const r of p._ripples) {
          const age = t - r.startT
          if (age < 0 || age > RIPPLE_MAXAGE) continue
          const dx = x - r.x, dy = (y - r.y) * 2.0
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = age * RIPPLE_SPEED
          const ringDist = Math.abs(dist - radius)
          // (tap) beat-conscripted rings carry their own amplitude; rings
          // from before the field existed read as 1 via the fallback.
          // Band widened 2.2 -> 2.8 because puddles/ripples didn't always
          // seem to show -- a thin ring is easy to miss between frames
          // on the terminal grid; a chunkier one reads unmistakably.
          if (ringDist < 2.8) v = Math.max(v, (1 - ringDist / 2.8) * (1 - age / RIPPLE_MAXAGE) * (r.amp || 1))
        }
        // 45th pass: neon floor and ring width both boosted -- live QA
        // found the effect nearly invisible at the old 0.05-0.09 range,
        // which mostly rendered FAINT/DIM and washed out under CITY
        // LIGHTS' own bloomAmt 1.8, the heaviest on the roster.
        const neon = (0.12 + 0.07 * Math.sin(x * 0.5 + t * 0.8 + y * 0.2)) * glitter
        v = Math.max(v * 0.95, neon)
        if (v < 0.06) { term.put(x, y, ' '); continue }
        const ch = v > 0.75 ? 'O' : v > 0.5 ? 'o' : v > 0.28 ? ':' : v > 0.12 ? '.' : '·'
        term.put(x, y, ch, visualizerLevelAttr(Math.min(1, v)))
      }
    }
  },
}
