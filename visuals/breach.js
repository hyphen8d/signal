// SIGNAL -- visualizer effect "BREACH". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.
//
// 2026-10-16 (design pass) -- the critique, judged off the real tube: "no
// subject" (full-frame hex rain is texture, not a picture), "one brightness
// tier" (the resolve words were barely brighter than the hex around them,
// since every rain cell's tier came off `alpha * surge * bandGlow`, which
// sat at NORMAL/BRIGHT for most of each 14-cell tail), and "the beat is not
// visible" (a kick only nudged `surge`, which the rain was already near the
// top of). What changed:
//   - THE SUBJECT is a login box in the middle of the screen -- a remote
//     shell being cracked: USER, the KEY fragments the rain has resolved so
//     far, a progress bar and a status line. Black margin round it, so the
//     rain stops a cell short of its frame instead of running into it.
//   - THE MUSICAL ELEMENT is the kick, and it lands in the box: the bar
//     JUMPS, the frame flips from single-line to double-line and goes
//     BRIGHT (a change of SHAPE, which survives the dimmest tint where a
//     brightness flash does not), and a burst of words resolves in the rain.
//     The bar full is ACCESS GRANTED for a beat, then a new attempt.
//   - THE RAIN is streams now, not a wash: a BRIGHT head, a two-cell NORMAL
//     neck, a DIM body and a FAINT end, then nothing. Each column waits a
//     random gap between streams, so about half the screen is black at any
//     moment (the brief asked for at least 40%). The glyphs are fixed in
//     place per stream -- the head reveals them as it falls -- where the old
//     `(x*7 + y*3 + t*20)` index reshuffled every cell every frame, which is
//     most of why it read as soup.
//   - MUTED is the same picture gone cold: rain at a crawl in DIM/FAINT, the
//     box in MUTED/DIM, the bar frozen where it stood, status NO CARRIER.
// The `_breachCols[x].word` / `.wordRow` / `.wordUntil` / `.resolveAt`
// shape is unchanged -- tests/visuals.test.mjs reads it (H4, M5) -- and a
// resolve never lands on the box or its margin, so the box cannot paint a
// word over (or the word the box).
//
// 2026-10-20 (polish, from the set critique) -- "overprinted garbage in the
// KEY field, and the kick moves the bar 5% -> 11%, which reads as nothing."
// Subject, composition and rendering untouched; four tweaks:
//   - THE KEY FIELD is three fixed slots (KEY_SLOT_W). It used to re-lay
//     the three newest words, newest first, on every resolve anywhere --
//     several times a second -- and under phosphor persistence each lay
//     ghosted through the last ('0BAFS404A6YN'). Now a resolve only offers
//     a candidate; a KICK accepts it into one slot, round-robin (so the
//     field changes when the status says KEY ACCEPTED, and only one slot
//     of it), and empty slots fill at once at the start of an attempt.
//     CIPHER's glyph is never a key: in that field it read as corruption.
//     ACCESS GRANTED ending clears the field with the bar.
//   - THE KICK moves the bar a sixth (KICK_STEP 0.05 -> 1/6), so a beat is
//     about five cells and access lands every ~6 kicks.
//   - BRIGHTNESS ORDER: rain heads BRIGHT -> NORMAL, necks NORMAL ->
//     MUTED, so BRIGHT in the rain means a resolved word and nothing else;
//     CIPHER's glyph, when it resolves in the rain, is NORMAL (a station
//     mark, not a cracked word).
//   - DENSITY: half the streams are "low" (LOW_SHARE) and begin at the
//     box's top margin row, so the rows above the box carry about half the
//     rain and stop reading as a wall.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

export const BREACH_HEX = '0123456789ABCDEF'
// A resolved fragment briefly holds legible mid-column before dissolving
// back to noise -- CIPHER's own glyph mixed in alongside plausible hacker-
// movie debris, not a generic word list.
export const BREACH_WORDS = ['0xFF', 'ROOT', '9F3A', 'ADMIN', 'ACK', 'SYN', '404', 'AUTH', '╬╬╬']

// 2026-10-16 (design pass) -- the box. Fixed height; the width follows the
// term (60..100 columns all fit), centred on both axes of rows 1..VIZ_BOT-1.
export const BOX_H = 8
export const BOX_MAX_W = 44
/** Box rectangle for a term `cols` wide: { x, y, w, h }. The black margin
 *  is one cell on every side of it. */
export function boxRect(cols) {
  const w = Math.min(BOX_MAX_W, cols - 12)
  return { x: Math.round((cols - w) / 2), y: Math.round((1 + VIZ_BOT - BOX_H) / 2), w, h: BOX_H }
}
// Rows inside the box (relative to its top).
export const ROW_USER = 2, ROW_KEY = 3, ROW_BAR = 5, ROW_STATUS = 6
// How far one kick moves the bar, and how long ACCESS GRANTED holds.
// 2026-10-20 (polish) -- 0.05 -> 1/6: a kick moved the bar one cell
// (5% -> 11% on the critic's sheet), which reads as nothing. A sixth of
// the bar is about five cells, and ACCESS GRANTED lands every ~6 kicks
// (fewer with the level creep) -- often enough to be seen, rare enough
// that the box is not ACCESS GRANTED half the time.
export const KICK_STEP = 1 / 6
export const GRANTED_HOLD = 1.8
// How long a kick holds the double-line frame (s of effect clock) -- a
// countdown, not an absolute time, so re-entry cannot strand it.
export const KICK_HOLD = 0.35
// Stream shape: head, neck, body (DIM), end (FAINT). 2026-10-20 (polish)
// -- the head was BRIGHT, the same tier as a resolved word, so the words
// did not stand out of the rain (rubric 3). Head NORMAL, neck MUTED now;
// BRIGHT in the rain belongs to the words alone.
const NECK = 2
export const RAIN_HEAD = NORMAL, RAIN_NECK = MUTED
// 2026-10-20 (polish) -- the rain above the box read as a wall. This share
// of streams is "low": it begins at the box's top margin row instead of at
// row 1, so the rows above the box carry about half the rain the rows
// below do, and the box sits under open sky rather than under a curtain.
export const LOW_SHARE = 0.5
// The KEY field: three fixed slots, each as wide as the longest word, so a
// new key rewrites one slot and never shifts the others.
// 2026-10-20 (polish) -- the field used to be the three newest words,
// newest first, re-laid every time any word resolved anywhere (several a
// second). On the tube each re-lay ghosted through the last one under
// phosphor persistence and the field read as overprinted garbage
// ('0BAFS404A6YN'). Now a slot changes only when a KICK accepts a key
// (KEY ACCEPTED is the status that says so), plus the first fill of an
// empty slot; and CIPHER's glyph is never a key -- in the KEY field it
// read as corruption.
export const KEY_SLOT_W = 5
export const KEY_GLYPH = '╬╬╬'

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

/** Would that word touch the box or its one-cell margin? (2026-10-16.) */
export function wordHitsBox(box, x, row, len) {
  return row >= box.y - 1 && row <= box.y + box.h &&
    x < box.x + box.w + 1 && x + len > box.x - 1
}

/** A new stream for one column: where its head starts (above the top, so
 *  the gap is the black between streams), how long it is, how fast. */
function respawn(col, first) {
  col.len = 5 + Math.floor(Math.random() * 7)
  col.speed = 6 + Math.random() * 10
  col.seed = Math.floor(Math.random() * 997)
  // Gap: 2..30 rows of nothing before the head enters at row 1. A first
  // spawn is scattered over the whole cycle so the screen opens mid-rain.
  const gap = 2 + Math.random() * 28
  col.head = first ? -gap + Math.random() * (VIZ_BOT + gap) : -gap
  // A low stream's head is counted from the box's top margin row, not from
  // row 1 (see LOW_SHARE); headRow() applies the offset.
  col.low = Math.random() < LOW_SHARE
}

/** The row a column's stream head is on, given the box's top margin row. */
export function headRow(col, by0) {
  return Math.floor(col.head) + (col.low ? by0 - 1 : 0)
}

/** Empties the KEY field: a fresh attempt. */
function clearKeys(p) {
  p._breachKeys[0] = p._breachKeys[1] = p._breachKeys[2] = null
  p._breachKeyNext = 0
  p._breachKeyNew = -1
  p._breachCand = null
}

/** A word just resolved in the rain. It becomes the candidate a kick will
 *  accept; if a slot is still empty it fills that one at once, so the
 *  field is not blank for the first few kicks of an attempt. */
export function offerKey(p, word) {
  if (word === KEY_GLYPH || p._breachKeys.includes(word)) return
  const empty = p._breachKeys.indexOf(null)
  if (empty >= 0) {
    p._breachKeys[empty] = word
    p._breachKeyNew = empty
    p._breachKeyNext = (empty + 1) % p._breachKeys.length
  } else {
    p._breachCand = word
  }
}

/** A kick: the candidate replaces ONE slot, round-robin. */
function acceptKey(p) {
  const w = p._breachCand
  if (!w || p._breachKeys.includes(w)) return
  const i = p._breachKeyNext || 0
  p._breachKeys[i] = w
  p._breachKeyNew = i
  p._breachKeyNext = (i + 1) % p._breachKeys.length
  p._breachCand = null
}

function putStr(term, x, y, str, attr, max) {
  const n = Math.min(str.length, max)
  for (let i = 0; i < n; i++) term.put(x + i, y, str.charCodeAt(i), attr)
  return n
}

export default {
  key: 'breach',
  label: 'BREACH',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    p._breachCols = Array.from({ length: term.cols }, () => {
      const col = { speed: 0, head: 0, len: 0, seed: 0, resolveAt: -1, word: null, wordRow: 0, wordUntil: 0 }
      respawn(col, true)
      return col
    })
    // 2026-08-23 (live audio tap) -- BREACH's rain-speed accumulator clock,
    // same reasoning as _outrunPhaseT: speed reacts via per-column phase
    // advance, never by scaling the `t * col.speed` term itself.
    p._breachLastT = 0
    // 2026-10-16 (design pass) -- the box: progress 0..1, the kick
    // envelope, a granted countdown (seconds left, relative -- not an
    // absolute effect-clock time), the last pulse (for the rising edge) and
    // the KEY field (three fixed slots; see KEY_SLOT_W and offerKey).
    p._breachProg = 0
    p._breachKick = 0
    p._breachGranted = 0
    p._breachPrevHit = false
    p._breachKeys = [null, null, null]
    clearKeys(p)
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
    // 2026-10-16 (design pass) -- every visit is a fresh attempt.
    p._breachProg = 0
    p._breachKick = 0
    p._breachGranted = 0
    p._breachPrevHit = false
    clearKeys(p)
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
  // 65th pass -- CIPHER needed to feel more reactive: surge (the
  // whole-screen brightness pulse) widened 0.6 -> 1.1, scroll-speed's
  // band range widened 0.7-2.6 -> 0.5-3.2 so quiet vs loud bands read
  // as clearly different speeds, a per-column brightness term now leans
  // on that same column's band value (a hot band reads hot, not just
  // fast), and the glitch-word trigger chance on a peak doubled so peaks
  // visibly do something more often. (2026-10-16: the surge and the
  // per-column brightness are gone -- the stream's tiers are fixed by
  // position now, and the beat lives in the box. The band speed range
  // stays.)
  draw(p, s, t) {
    const { term } = s
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (t < p._breachLastT) p._breachLastT = t
    const bdt = Math.min(0.1, Math.max(0, t - p._breachLastT))
    p._breachLastT = t
    const cols = p._breachCols
    const box = boxRect(term.cols)
    const bx0 = box.x - 1, bx1 = box.x + box.w, by0 = box.y - 1, by1 = box.y + box.h

    // The kick: a rising edge of the onset/pulse, never a level. Steady
    // loud audio (pulse flat, no onset) is not a beat.
    const hit = !muted && (A.onset || A.pulse > 0.6)
    const kick = hit && !p._breachPrevHit
    p._breachPrevHit = hit
    p._breachKick = Math.max(0, p._breachKick - bdt)
    if (p._breachGranted > 0) {
      p._breachGranted -= bdt
      if (p._breachGranted <= 0) { p._breachGranted = 0; p._breachProg = 0; clearKeys(p) }
    } else if (!muted) {
      // A slow creep with the level, so a track with no clear onsets still
      // gets in eventually; the kicks are what you see move it.
      p._breachProg += bdt * 0.012 * A.level
      if (kick) { p._breachProg += KICK_STEP; acceptKey(p) }
      if (p._breachProg >= 1) { p._breachProg = 1; p._breachGranted = GRANTED_HOLD }
    }
    if (kick) p._breachKick = KICK_HOLD
    // Muted, the rain crawls rather than stopping: faint, never dead.
    const speedMul = muted ? 0.25 : 1

    for (let x = 0; x < term.cols; x++) {
      const col = cols[x]
      const band = A.bands9[x % 9]
      col.head += bdt * col.speed * speedMul * auMul(A, band, 0.5, 3.2)
      if (headRow(col, by0) - col.len > VIZ_BOT) respawn(col, false)
      if (col.resolveAt < 0) col.resolveAt = t + 2 + Math.random() * 5
      // A kick resolves a burst of words across the rain.
      if (kick && !col.word && Math.random() < 0.08) col.resolveAt = t
      // A word resolves OUT OF A STREAM, just behind its head, so a column
      // with no stream on screen waits for one -- which is also what keeps
      // the words a handful at a time rather than a field of them (the
      // first capture of this pass, resolving anywhere, had a dozen up).
      const hr = headRow(col, by0) - 2
      const streamUp = hr >= (col.low ? by0 : 2) && hr < VIZ_BOT - 2
      if (t > col.resolveAt && !col.word && (!streamUp || Math.random() < 0.6)) {
        col.resolveAt = t + 0.5 + Math.random() * 2
      } else if (t > col.resolveAt && !col.word) {
        const word = BREACH_WORDS[Math.floor(Math.random() * BREACH_WORDS.length)]
        const row = hr
        // 2026-09-12 (audit, H4) -- two fragments landing on overlapping
        // cells of one row read as garbage, not as two resolves, and the
        // second pass below would otherwise let the later column win over
        // half of the earlier word. A resolve that would collide waits for
        // its next slot instead. (2026-10-16: so does one that would land
        // on the box.)
        if (wordCollides(cols, x, row, word.length) || wordHitsBox(box, x, row, word.length)) {
          col.resolveAt = t + 0.5 + Math.random() * 2
        } else {
          col.word = word
          col.wordRow = row
          col.wordUntil = t + 0.5 + Math.random() * 0.4
          col.resolveAt = t + 2 + Math.random() * 5
          // A cracked fragment is a CANDIDATE key; a kick accepts it (or
          // it fills a slot that is still empty). CIPHER's glyph never is.
          offerKey(p, word)
        }
      }
      if (col.word && t > col.wordUntil) col.word = null
      const hRow = headRow(col, by0)
      const top = col.low ? by0 : 1
      const inBoxCols = x >= bx0 && x <= bx1
      for (let y = 1; y < VIZ_BOT; y++) {
        if (inBoxCols && y >= by0 && y <= by1) continue
        const dist = hRow - y
        if (y < top || dist < 0 || dist >= col.len) { term.put(x, y, 32); continue }
        let attr
        if (dist === 0) attr = muted ? DIM : RAIN_HEAD
        else if (dist <= NECK) attr = muted ? DIM : RAIN_NECK
        else if (dist < col.len - 2) attr = muted ? FAINT : DIM
        else attr = FAINT
        // The glyphs are fixed in place for the life of the stream; only
        // the head flickers, as the decode front.
        const hv = dist === 0 ? Math.random() : hash2(x + col.seed, y)
        term.put(x, y, BREACH_HEX.charCodeAt(Math.floor(hv * 16) & 15), attr)
      }
    }

    drawBox(p, term, box, muted)

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
    // 2026-10-20 (polish) -- CIPHER's glyph is a station mark in the rain,
    // not a cracked word: it resolves a tier under the words (NORMAL, the
    // rain heads' tier), so BRIGHT reads as "a word" and nothing else.
    for (let x = 0; x < term.cols; x++) {
      const col = cols[x]
      if (!col.word) continue
      const wAttr = col.word === KEY_GLYPH ? (muted ? DIM : NORMAL) : (muted ? NORMAL : BRIGHT)
      for (let wi = 0; wi < col.word.length; wi++) {
        const wx = x + wi
        if (wx < term.cols) term.put(wx, col.wordRow, col.word.charCodeAt(wi), wAttr)
      }
    }
  },

}
/** The login box, its black margin included. */
function drawBox(p, term, box, muted) {
  const { x: X, y: Y, w: W, h: H } = box
  const kicked = !muted && p._breachKick > 0
  const granted = p._breachGranted > 0
  // The frame: single-line at rest, double-line and BRIGHT on a kick.
  const fAttr = muted ? MUTED : (kicked || granted ? BRIGHT : NORMAL)
  const hz = kicked ? 0x2550 : 0x2500, vt = kicked ? 0x2551 : 0x2502
  const tl = kicked ? 0x2554 : 0x250C, tr = kicked ? 0x2557 : 0x2510
  const bl = kicked ? 0x255A : 0x2514, br = kicked ? 0x255D : 0x2518
  const label = muted ? DIM : NORMAL
  const value = muted ? MUTED : BRIGHT
  // Margin: one black cell all round.
  for (let x = X - 1; x <= X + W; x++) { term.put(x, Y - 1, 32); term.put(x, Y + H, 32) }
  for (let y = Y; y < Y + H; y++) { term.put(X - 1, y, 32); term.put(X + W, y, 32) }
  for (let y = Y; y < Y + H; y++) {
    for (let x = X; x < X + W; x++) {
      let ch = 32
      if (y === Y || y === Y + H - 1) ch = hz
      if (x === X || x === X + W - 1) ch = vt
      if (y === Y && x === X) ch = tl
      else if (y === Y && x === X + W - 1) ch = tr
      else if (y === Y + H - 1 && x === X) ch = bl
      else if (y === Y + H - 1 && x === X + W - 1) ch = br
      term.put(x, y, ch, ch === 32 ? NORMAL : fAttr)
    }
  }
  const inner = W - 6
  // Title in the top border, the station's callsign at its right.
  putStr(term, X + 2, Y, ' REMOTE SHELL ', fAttr, inner)
  const cs = p.lockedStation && p.lockedStation.callsign
  if (cs && cs.length + 18 < W) putStr(term, X + W - 3 - cs.length, Y, cs, fAttr, cs.length)
  putStr(term, X + 3, Y + ROW_USER, 'USER', label, 4)
  putStr(term, X + 10, Y + ROW_USER, 'root', value, 4)
  putStr(term, X + 3, Y + ROW_KEY, 'KEY', label, 3)
  // Fixed slots (KEY_SLOT_W + 1 apart); the interior was blanked above, so
  // a slot shorter than its width leaves spaces, never the last key's tail.
  for (let i = 0; i < p._breachKeys.length; i++) {
    const k = p._breachKeys[i]
    const kx = X + 10 + i * (KEY_SLOT_W + 1)
    if (!k || kx + KEY_SLOT_W > X + W - 3) continue
    putStr(term, kx, Y + ROW_KEY, k, i === p._breachKeyNew ? value : label, KEY_SLOT_W)
  }
  // The bar: [████····]  NN%
  const barW = W - 16
  const by = Y + ROW_BAR
  const fill = Math.round(p._breachProg * barW)
  const barAttr = muted ? MUTED : (granted || kicked ? BRIGHT : NORMAL)
  term.put(X + 3, by, 0x5B, label)
  for (let i = 0; i < barW; i++) {
    term.put(X + 4 + i, by, i < fill ? 0x2588 : 0xB7, i < fill ? barAttr : (muted ? FAINT : DIM))
  }
  term.put(X + 4 + barW, by, 0x5D, label)
  const pct = Math.min(100, Math.floor(p._breachProg * 100))
  const px = X + 6 + barW
  term.put(px, by, pct >= 100 ? 0x31 : 32, value)
  term.put(px + 1, by, pct >= 10 ? 0x30 + Math.floor(pct / 10) % 10 : 32, value)
  term.put(px + 2, by, 0x30 + pct % 10, value)
  term.put(px + 3, by, 0x25, label)
  // The kick reads in words as well as in the frame: KEY ACCEPTED.
  const status = muted ? 'NO CARRIER' : granted ? 'ACCESS GRANTED' : kicked ? 'KEY ACCEPTED' : 'DECRYPTING'
  const sAttr = muted ? DIM : granted || kicked ? BRIGHT : label
  const n = putStr(term, X + 3, Y + ROW_STATUS, status, sAttr, inner)
  for (let x = X + 3 + n; x < X + W - 1; x++) term.put(x, Y + ROW_STATUS, 32)
}
