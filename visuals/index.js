// SIGNAL -- the visualizer registry: every effect module, in the order [V]
// cycles them. Each effect is { key, label, decay?, init?(p, term), reset?(p),
// draw(p, s, t) }; `decay` (2026-09-21) is the phosphor persistence the tube
// runs at while the effect is up, in place of the station's -- see
// drawVisualizerFrame(). Its state lives on the program object under the same
// _-prefixed names it always had. Split out of program.js in the 2026-08-25 audit --
// the notes below are the history of what used to be VISUAL_METHODS.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.
//
// THE RUBRIC (2026-10-16). What every effect here is judged against -- by a
// person, and by the viz-critic agent (.claude/agents/viz-critic.md, local to
// the dev box since .claude/ is gitignored; it reads this block rather than
// keeping its own copy). Judge from tools/viz-sheet.mjs captures of the real
// tube, never from the text grid: on the day this was written the harness
// passed all 18 effects while the tube showed AURORA as hard rectangles.
//
//   1. ONE SUBJECT. A picture you can name in two seconds -- a boombox, a
//      castle, a skyline -- not a texture. (Approved by Matt 2026-10-16.)
//   2. ONE MUSICAL ELEMENT. One thing moves with the music, and the beat is
//      visible: set the LOUD and KICK tiles side by side and the difference
//      is obvious without hunting for it. Ambient stations' effects swell
//      rather than thump (AURORA, DRIFT -- see the bloom exclusion in
//      drawVisualizerFrame).
//   3. A BRIGHTNESS ORDER. Subject brightest, scenery dimmer, background
//      darkest; nothing in the scenery outshines the subject. MUTED, FAINT
//      and DIM are near-invisible under some phosphors -- a part drawn only
//      in them is a part that is not there.
//   4. SHAPES, NOT CHARACTER SOUP. Shade blocks (`░▒▓█`) raster as solid
//      rectangles on the tube: a field of them reads as blocks, not as light.
//      Use them for mass (a ridge, a cabinet), not for anything meant to look
//      soft or thin.
//   5. FOUR STATES. NO TAP (most visitors), MUTED, quiet and loud each look
//      deliberate: never dead, never blank, never strobing.
//   6. THE REAL-RADIO TEST. Would a real set -- or the picture in a real
//      set's window -- have this?

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

const ORDER = ['drift', 'flame', 'breach', 'outrun', 'ripple', 'flowfield', 'bubbletubes', 'boombap', 'dread', 'frost', 'isotope', 'lagoon', 'uprising', 'keep', 'orbit', 'aurora', 'backroom', 'dancefloor']
const mods = await Promise.all(ORDER.map((k) => import(`./${k}.js?v=${V}`)))
/** key -> effect module, in cycle order. Falls back to DRIFT for any
 *  station whose `visual` doesn't name a built effect (see activeVisualKey). */
export const VISUALS = Object.fromEntries(mods.map((m) => [m.default.key, m.default]))
// 65th pass -- lets [Shift+C] (and [V], inside the visualizer) cycle any
// station's visualizer through every built effect, not just the one it
// ships with -- "any effect, anywhere" rather than a curated per-station
// shortlist. DREAD (the secret station's own effect) is included.
export const VISUAL_KEYS = Object.keys(VISUALS)
