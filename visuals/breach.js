// SIGNAL -- visualizer effect "BREACH". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

export const BREACH_HEX = '0123456789ABCDEF'
// A resolved fragment briefly holds legible mid-column before dissolving
// back to noise -- CIPHER's own glyph mixed in alongside plausible hacker-
// movie debris, not a generic word list.
export const BREACH_WORDS = ['0xFF', 'ROOT', '9F3A', 'ADMIN', 'ACK', 'SYN', '404', 'AUTH', '╬╬╬']

/** Would a word of `len` cells starting at column `x` on `row` share a cell
 *  with a word some other column already holds? (2026-09-12, audit H4.) */
export function wordCollides(cols, x, row, len) {
  const lo = Math.max(0, x - 5), hi = Math.min(cols.length - 1, x + len)
  for (let ox = lo; ox <= hi; ox++) {
    const o = cols[ox]
    if (ox === x || !o.word || o.wordRow !== row) continue
    if (ox < x + len && x < ox + o.word.length) return true
  }
  return false
}

export default {
  key: 'breach',
  label: 'BREACH',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    p._breachCols = Array.from({ length: term.cols }, () => ({
      speed: 6 + Math.random() * 10,
      head: Math.random() * 30,
      resolveAt: -1,
      word: null,
      wordRow: 0,
      wordUntil: 0,
    }))
    // 2026-08-23 (live audio tap) -- BREACH's rain-speed accumulator clock,
    // same reasoning as _outrunPhaseT: speed reacts via per-column phase
    // advance, never by scaling the `t * col.speed` term itself.
    p._breachLastT = 0
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-08-23 (live audio tap) -- the rain-speed accumulator clock
    // restarts with the effect clock.
    p._breachLastT = 0
    // 2026-09-12 (audit, M5) -- resolveAt and wordUntil are absolute
    // effect-clock values too, and survived here. After a two-minute
    // visit, exit and re-enter: 30/80 columns held a word whose wordUntil
    // was ~120s away (lit BRIGHT until the restarted clock climbed back
    // past it) and 55/80 had no ambient resolve scheduled for minutes.
    // Invisible only while H4 kept every word off the screen. Same
    // FLAME-class bug the entry comment in visualizer.js describes.
    for (const col of p._breachCols) { col.word = null; col.resolveAt = -1 }
  },
  // BREACH effect (44th pass) -- for CIPHER. Vertical hex-noise columns
  // scrolling down through the real beam-intensity tiers (bright head,
  // fading tail), CIPHER's own glyph seeded into the noise. What keeps this
  // from being a stock Matrix rain: a short span in a column occasionally
  // RESOLVES -- holds a legible fragment for a beat, then dissolves back to
  // noise -- the same settle-out-of-scrambled-glyphs idea resolveText()
  // already uses for callsigns and track titles, borrowed back for the
  // canvas. Columns run at irregular, independent speeds (CIPHER's own
  // field notes: "meters twitch") rather than one uniform waterfall.
  // 57th pass, 2nd rewrite -- Decrypt Sweep, rebuilt from scratch so
  // there is no activity if there is no audio. The old version
  // scrolled the rain on raw `t * col.speed` regardless of the tap -- audio
  // only ever nudged an already-running animation, which read as "always
  // on" rather than reactive. This version has NO idle motion at all: with
  // no live tap, the whole column state is frozen and the screen renders a
  // dim, motionless hex texture -- CIPHER waiting for a signal, not looping
  // a canned decrypt. Only a live tap advances anything: each column's
  // `head` (rows scrolled) only increments while A exists, driven by its own
  // band's energy (`A.bands9[x % 9]`, widened from 6 bands the same 58th
  // pass that widened the EQ ribbon), so quiet bands crawl and loud ones
  // race. Word-resolves and the ambient schedule are likewise gated on A --
  // no tap, no resolves, ever.
  // 62nd pass -- was a faint, unmoving hex
  // texture with no resolves without a tap. Found during live QA to read
  // as broken rather than atmospheric when a real tap isn't available, so
  // hard silence rules were relaxed in favor of a seamless fallback. Falls back
  // to syntheticAudio(t) now (see its own note near auMul) -- the scroll/
  // resolve logic below is unchanged, it just always has a signal to read.
  draw(p, s, t) {
    const { term } = s
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (t < p._breachLastT) p._breachLastT = t
    const bdt = Math.min(0.1, Math.max(0, t - p._breachLastT))
    p._breachLastT = t
    // 65th pass -- CIPHER needed to feel more reactive: surge (the
    // whole-screen brightness pulse) widened 0.6 -> 1.1, scroll-speed's
    // band range widened 0.7-2.6 -> 0.5-3.2 so quiet vs loud bands read
    // as clearly different speeds, a per-column brightness term now leans
    // on that same column's band value (a hot band reads hot, not just
    // fast), and the glitch-word trigger chance on a peak doubled so peaks
    // visibly do something more often.
    const surge = 1 + A.pulse * 1.1
    const cols = p._breachCols
    for (let x = 0; x < term.cols; x++) {
      const col = cols[x]
      const band = A.bands9[x % 9]
      const bandMul = auMul(A, band, 0.5, 3.2)
      col.head = (col.head + bdt * col.speed * bandMul) % 30
      if (col.resolveAt < 0) col.resolveAt = t + 2 + Math.random() * 5
      if (A.pulse > 0.6 && !col.word && Math.random() < 0.06) col.resolveAt = t
      if (t > col.resolveAt && !col.word) {
        const word = BREACH_WORDS[Math.floor(Math.random() * BREACH_WORDS.length)]
        const row = 2 + Math.floor(Math.random() * 18)
        // 2026-09-12 (audit, H4) -- two fragments landing on overlapping
        // cells of one row read as garbage, not as two resolves, and the
        // second pass below would otherwise let the later column win over
        // half of the earlier word. A resolve that would collide waits for
        // its next slot instead.
        if (wordCollides(cols, x, row, word.length)) {
          col.resolveAt = t + 0.5 + Math.random() * 2
        } else {
          col.word = word
          col.wordRow = row
          col.wordUntil = t + 0.5 + Math.random() * 0.4
          col.resolveAt = t + 2 + Math.random() * 5
        }
      }
      if (col.word && t > col.wordUntil) col.word = null
      const headY = col.head - 4
      const bandGlow = auMul(A, band, 0.6, 1.4)
      for (let y = 1; y < VIZ_BOT; y++) {
        const dist = headY - y
        if (dist < 0 || dist > 14) { term.put(x, y, ' '); continue }
        const alpha = Math.max(0, 1 - dist / 14)
        const ch = BREACH_HEX[Math.floor((x * 7 + y * 3 + t * 20) % BREACH_HEX.length)]
        term.put(x, y, ch, visualizerLevelAttr(Math.min(1, alpha * surge * bandGlow)))
      }
    }
    // 2026-09-12 (audit, H4) -- the words are a SECOND pass, after every
    // column's rain is down. They used to be written inside the column
    // loop, so columns x+1.. repainted their own full height straight over
    // the word that column x had just laid across them: measured over 400
    // frames, 0 intact / 9482 broken (`SYN` rendered as `SF6`). The
    // effect's whole design hook -- "a short span occasionally RESOLVES,
    // holds a legible fragment for a beat" -- had never once appeared on
    // screen, and the 65th pass doubled the resolve chance on a pulse
    // without anyone able to see the difference. Drawn last, a word also
    // holds over the rain of its own columns for its wordUntil beat, which
    // is the resolve-then-dissolve the comment above describes.
    for (let x = 0; x < term.cols; x++) {
      const col = cols[x]
      if (!col.word) continue
      for (let wi = 0; wi < col.word.length; wi++) {
        const wx = x + wi
        if (wx < term.cols) term.put(wx, col.wordRow, col.word[wi], BRIGHT)
      }
    }
  },
}
