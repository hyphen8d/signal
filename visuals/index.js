// SIGNAL -- the visualizer registry: every effect module, in the order [V]
// cycles them. Each effect is { key, label, init?(p, term), reset?(p),
// draw(p, s, t) }; its state lives on the program object under the same
// _-prefixed names it always had. Split out of program.js in the 2026-08-25 audit --
// the notes below are the history of what used to be VISUAL_METHODS.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

// FLAME (46th pass, DISTORTION FIELD) -- replaces HOWL outright (which had
// itself replaced the original FEEDBACK concept). Live QA: "fire 'flame'
// living thing." Classic bottom-up fire propagation -- a heat value per
// cell (this._fireHeat, sized term.cols x HINT_Y1, seeded in init()),
// reseeded hot and flickering at the floor every frame, cooling and
// drifting sideways at random as it rises. Genuinely alive: no fixed
// cycle, no two frames identical, unlike every prior concept tried here.
// station.visual -> the drawing method it dispatches to. Falls back to
// 'drift' for any station with no visual field, or one that doesn't match
// a built entry here yet.
// 65th pass -- live QA on the new [Shift+C]/[V] cycling below resurfaced
// five long-unassigned effects (STACK, SKYLINE, NEON SIGN, GEIGER,
// COUNTER/CLOUDS) that had only ever been kept around under this project's
// usual "never delete a superseded effect" convention. All five were
// rejected outright once actually seen again -- not a tuning problem, just
// not wanted -- so this pass breaks that convention for these five only:
// their code (and any state/constants used only by them) is deleted
// outright rather than left unassigned. ISOTOPE MAP is the one exception:
// resurfaced alongside them, but liked ("looks cool, just needs more
// reactivity"), so it's kept, given a reactivity pass, and promoted to
// ATOMIC's new default in place of BLAST FIELD.
// 67th pass -- BLAST FIELD and PULSE removed outright too, same
// reasoning as the 65th pass: both had sat unassigned for passes with no
// station shipping them, so there was nothing left keeping them around.
// 65th pass -- lets [Shift+C] (and [V], inside the visualizer) cycle any
// station's visualizer through every built effect, not just the one it
// ships with -- "any effect, anywhere" rather than a curated per-station
// shortlist. Object.keys() preserves insertion order for string keys, so
// this walks VISUAL_METHODS in the same order it's declared above; DREAD
// (the secret station's own effect) is included, same "any effect,
// anywhere" scope, not carved out.
// 65th pass -- SKYLINE (MOMENTUM's growing-towers effect, built via
// makeSkylineTowers()) and NEON SIGN (MIDNIGHT NEON's word-sign effect,
// built via NEON_FONT/buildNeonSegments()) permanently removed, along with
// their supporting constants and helper functions. See the 65th-pass note
// above VISUAL_METHODS for why.
// 67th pass -- PULSE (COLD WAVE's old neon-lattice-and-EKG effect, and its
// PULSE_CYCLE/pulseBeatEnvelope/PULSE_BEAT_COLS/pulseEkgOffset tuning)
// permanently removed. See the removal note above drawVisualizerFrame.

const V = globalThis.SIGNAL_BUILD ?? ''

const ORDER = ['drift', 'flame', 'breach', 'outrun', 'ripple', 'flowfield', 'bubbletubes', 'boombap', 'dread', 'frost', 'isotope']
const mods = await Promise.all(ORDER.map((k) => import(`./${k}.js?v=${V}`)))
/** key -> effect module, in cycle order. Falls back to DRIFT for any
 *  station whose `visual` doesn't name a built effect (see activeVisualKey). */
export const VISUALS = Object.fromEntries(mods.map((m) => [m.default.key, m.default]))
// 65th pass -- lets [Shift+C] (and [V], inside the visualizer) cycle any
// station's visualizer through every built effect, not just the one it
// ships with -- "any effect, anywhere" rather than a curated per-station
// shortlist. DREAD (the secret station's own effect) is included.
export const VISUAL_KEYS = Object.keys(VISUALS)
