// SIGNAL -- helpers shared by the visualizer effects: the density ramp, the
// cheap 2D hash, and the level->attribute mapping. 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''

// Visualizer (43rd/44th pass) -- DRIFT mode. A layered sine-wave density
// field, same "decorative but structured" idiom as the VU meter and antenna
// glyph: no real audio analysis anywhere (WebAudio can't see inside the
// YouTube iframe), just deterministic synthetic motion.
// 2026-08-23: that constraint is now WORKED AROUND, not gone -- the live
// audio tap (see its section above) captures the tab/mic audio outside the
// iframe, and every effect below modulates off its signal bus when it's
// live. The synthetic motion described here remains the exact fallback
// whenever no capture is running. Character density
// (this ramp) plus the beam-level tier below give it more apparent gradient
// than the 5 discrete attribute tiers alone would.
//
// Built as the first of what's meant to become a per-station roster (44th
// pass -- since it can't be impacted by audio, it can instead
// be themed to each station, with a goal of eventually having 10 visuals) --
// VISUAL_METHODS just below is the dispatch table that idea hangs off of.
// DRIFT is wired to one station explicitly (see STATIONS' `visual` field),
// not just landing there by default. That was DRIFT MODE, which the two
// sharing a name made an obvious pairing; NEON STASIS replaced it on the
// same dial slot on 2026-08-30 and kept the effect, so the pairing is now
// by temperament rather than by name -- mallsoft wants the same slow
// undemanding wash the ambient lane did. Every other station falls back to
// DRIFT purely because nothing themed exists for them yet. Something
// hacking/code-based was floated for CIPHER and a synthwave/
// vaporwave treatment for CIRCUIT CRUSH as the next two builds; RIPPLE and
// SCOPE (see the original screensaver mockup artifact) are other candidate
// directions for stations further down the roster.
export const DRIFT_RAMP = ' .:-=+*#%@'
// Cheap deterministic 2D hash (47th pass, OUTRUN roadside terrain) -- no
// state, just a pseudo-random 0..1 value from two integers, so ground
// texture can be recomputed every frame from (column, scroll-row) without
// keeping its own buffer.
export function hash2(a, b) {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/** Maps a 0..1 density value to term.js's discrete beam-intensity tiers. */
export function visualizerLevelAttr(v) {
  if (v < 0.2) return FAINT
  if (v < 0.4) return DIM
  if (v < 0.6) return MUTED
  if (v < 0.85) return NORMAL
  return BRIGHT
}

