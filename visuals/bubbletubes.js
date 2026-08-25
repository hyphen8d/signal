// SIGNAL -- visualizer effect "BUBBLE TUBES". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, FAINT, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// 61st pass -- BUBBLE TUBES tuning (MIDNIGHT NEON, replaces NEON SIGN).
// JUKE_TUBES matches A.bands9's length on purpose -- one tube per real
// spectrum band, not an arbitrary count. JUKE_IDLE_FILL is the "hardware
// stays on" floor: even a fully quiet band still shows some lit tube,
// same idea as NEON SIGN's ambient flicker.
// 62nd pass -- the bubble pool (JUKE_BUBBLE_*) is gone along with the
// bubbles themselves: the "0" bubble shapes didn't read well, kept as
// the thicker bars instead.
export const JUKE_TUBES = 9
export const JUKE_IDLE_FILL = 0.16

export default {
  key: 'bubbletubes',
  label: 'BUBBLE TUBES',
  // 65th pass -- GEIGER (ATOMIC's analogue rate-meter effect, needle +
  // scale + click state) permanently removed. See the 65th-pass note above
  // VISUAL_METHODS for why.
  // 67th pass -- BLAST FIELD (ATOMIC's detonation-field effect, GEIGER's
  // own former replacement) permanently removed in turn, alongside PULSE
  // below. See the 67th-pass note above drawVisualizerFrame for why.
  // 65th pass -- NEON SIGN (MIDNIGHT NEON's word-sign effect, built on
  // NEON_FONT/buildNeonSegments) permanently removed. See the 65th-pass
  // note above VISUAL_METHODS for why.
  // BUBBLE TUBES (61st pass, MIDNIGHT NEON) -- was NEON SIGN's replacement; see
  // VISUAL_METHODS' note above bubbletubes for the full brief. Nine tubes
  // span the full width, one per real spectrum band off A.bands9 (the same
  // 9-band tap CIPHER's drawBreachEffect reads), each filled from the base
  // up like a VU bar -- an honest readout, not a texture. A low idle floor
  // (JUKE_IDLE_FILL) keeps every tube visibly lit even with no signal, same
  // "hardware stays on" contract NEON SIGN's ambient flicker used.
  // 62nd pass -- dropped the bubble pool entirely, keeping just the
  // thicker bars; the tubes
  // are the whole picture now. Also falls back to syntheticAudio(t) when
  // there's no real tap (see its own note near auMul), so a station with
  // no signal still shows tubes breathing and occasionally kicking instead
  // of sitting dead at the idle floor.
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    const fieldTop = 1, fieldBot = VIZ_BOT - 1
    const fieldH = fieldBot - fieldTop + 1
    const n = JUKE_TUBES
    const spacing = cols / n
    for (let i = 0; i < n; i++) {
      const cx = spacing * i + spacing / 2
      const w = Math.max(2, Math.round(spacing * 0.5))
      const x0 = Math.round(cx - w / 2)
      const x1 = Math.min(cols - 1, x0 + w - 1)
      const level = Math.max(0, Math.min(1, A.bands9[i]))
      const fill = JUKE_IDLE_FILL + level * (1 - JUKE_IDLE_FILL)
      const litRows = Math.max(1, Math.round(fill * fieldH))
      for (let r = 0; r < fieldH; r++) {
        const y = fieldBot - r
        if (r >= litRows) {
          if (w >= 3) { term.put(x0, y, '|', FAINT); term.put(x1, y, '|', FAINT) }
          continue
        }
        // 61st pass, live QA fix: the original 3-tier fade (0.3 + heat*0.7
        // through visualizerLevelAttr) put most of a tall column's upper
        // rows into FAINT/DIM, which the CRT's bloom/threshold curve
        // renders as functionally invisible -- a loud band's tube looked
        // just as short as a quiet one on screen even though the character
        // buffer was correct (confirmed by reading term.chars directly).
        // Two-tier instead: bright near the base, normal above -- both
        // tiers stay clearly visible, so tube HEIGHT is what reads as
        // loudness, not a gradient that fades out of visibility.
        const heat = 1 - r / litRows
        const ch = heat > 0.5 ? '█' : '▓'
        const attr = heat > 0.5 ? BRIGHT : NORMAL
        for (let x = x0; x <= x1; x++) term.put(x, y, ch, attr)
      }
    }
  },
}
